import type { VisibleRow } from "../gmail/adapter";

const FLIGHT_MS = 650;
const STAGGER_MS = 30;
const FADE_MS = 300;
const SLIDE_MS = 450;
const SLIDE_STAGGER_MS = 80;
/** Boxes start this far left of the first box. */
const SLIDE_FROM_PX = 16;

export interface SweepOptions {
  rows: VisibleRow[];
  /** Box a row flies into; null fades the row out where it is. */
  targetFor(threadId: string): HTMLElement | null;
  onLand(threadId: string): void;
  doc?: Document;
}

export function prefersReducedMotion(win: Window = window): boolean {
  return win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function nextFrames(count = 2): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left === 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });
}

/**
 * Deals the boxes out from the leftmost one, left to right, each from behind the one before it
 * (boxes must be positioned for that stacking). Resolves once all are in place.
 */
export async function slideInBoxes(boxes: HTMLElement[]): Promise<void> {
  const first = boxes[0]?.getBoundingClientRect();
  if (!first) return;
  const zIndexes = boxes.map((box) => box.style.zIndex);
  try {
    const animations = boxes.map((box, index) => {
      const from = box.getBoundingClientRect().left - first.left + SLIDE_FROM_PX;
      box.style.zIndex = String(boxes.length - index);
      return box.animate(
        [
          { transform: `translateX(${-from}px)`, opacity: 0 },
          { opacity: 1, offset: 0.25 },
          { transform: "translateX(0)", opacity: 1 }
        ],
        {
          duration: SLIDE_MS,
          delay: index * SLIDE_STAGGER_MS,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          fill: "backwards"
        }
      );
    });
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  } finally {
    boxes.forEach((box, index) => {
      box.style.zIndex = zIndexes[index]!;
    });
  }
}

/**
 * Flies a copy of each row into its box and hides the originals. Resolves once every copy
 * has landed, with a function that shows the originals again. Pass it a wait so the rows
 * stay hidden until Gmail has replaced the list; otherwise they flash back first.
 */
export async function sweepRowsIntoFolders(
  options: SweepOptions
): Promise<(maxWaitMs?: number) => void> {
  const doc = options.doc ?? window.document;
  const overlay = doc.createElement("div");
  overlay.dataset.mercatoSweep = "1";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:hidden;";
  doc.body.append(overlay);

  const hidden: Array<{ element: HTMLElement; visibility: string }> = [];
  const restore = () => {
    for (const { element, visibility } of hidden) element.style.visibility = visibility;
  };
  const release = (maxWaitMs = 0) => {
    const deadline = performance.now() + maxWaitMs;
    const check = () => {
      const stillShown = hidden.some(
        ({ element }) => element.isConnected && element.getClientRects().length > 0
      );
      if (stillShown && performance.now() < deadline) window.setTimeout(check, 100);
      else restore();
    };
    check();
  };

  try {
    await Promise.all(options.rows.map((row, index) => fly(row, index)));
  } catch (error) {
    restore();
    throw error;
  } finally {
    overlay.remove();
  }
  return release;

  function fly(row: VisibleRow, index: number): Promise<void> {
    const from = row.element.getBoundingClientRect();
    const ghost = ghostFor(row.element, from, doc);
    overlay.append(ghost);
    hidden.push({ element: row.element, visibility: row.element.style.visibility });
    row.element.style.visibility = "hidden";

    const target = options.targetFor(row.threadId);
    const animation = target
      ? ghost.animate(flightKeyframes(from, target.getBoundingClientRect()), {
          duration: FLIGHT_MS,
          delay: index * STAGGER_MS,
          easing: "cubic-bezier(0.5, 0, 0.75, 0)",
          fill: "forwards"
        })
      : ghost.animate(
          [
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: "scale(0.97)" }
          ],
          { duration: FADE_MS, delay: index * STAGGER_MS, easing: "ease-out", fill: "forwards" }
        );
    return animation.finished
      .then(() => {
        if (target) options.onLand(row.threadId);
      })
      .catch(() => undefined)
      .finally(() => ghost.remove());
  }
}

function flightKeyframes(from: DOMRect, to: DOMRect): Keyframe[] {
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const endX = Math.min(1, (to.width * 0.6) / Math.max(from.width, 1));
  const endY = Math.min(1, (to.height * 0.6) / Math.max(from.height, 1));
  const lift = Math.min(40, Math.abs(dy) * 0.15 + 12);
  return [
    { transform: "translate(0px, 0px) scale(1, 1)", opacity: 1 },
    {
      transform: `translate(${dx * 0.35}px, ${dy * 0.35 - lift}px) scale(${0.6 + endX * 0.4}, ${0.85 + endY * 0.15})`,
      opacity: 1,
      offset: 0.4
    },
    { transform: `translate(${dx}px, ${dy}px) scale(${endX}, ${endY})`, opacity: 0.15 }
  ];
}

function ghostFor(element: HTMLElement, rect: DOMRect, doc: Document): HTMLElement {
  const ghost = doc.createElement("div");
  ghost.style.cssText = [
    "position:absolute",
    `left:${rect.left}px`,
    `top:${rect.top}px`,
    `width:${rect.width}px`,
    `height:${rect.height}px`,
    "box-sizing:border-box",
    "overflow:hidden",
    "background:#ffffff",
    "border-radius:8px",
    "box-shadow:0 6px 18px rgba(32, 33, 36, 0.28)",
    "transform-origin:center center",
    "will-change:transform, opacity"
  ].join(";");

  const copy = element.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  for (const node of copy.querySelectorAll("[id]")) node.removeAttribute("id");
  copy.style.visibility = "visible";

  if (copy instanceof HTMLTableRowElement) {
    // A bare <tr> loses its column layout; rebuild the table around it with Gmail's classes.
    const source = element.closest("table");
    const table = doc.createElement("table");
    if (source) table.className = source.className;
    table.style.cssText = `width:${rect.width}px;height:${rect.height}px;border-collapse:collapse;table-layout:fixed;margin:0;`;
    const columns = source?.querySelector("colgroup");
    if (columns) table.append(columns.cloneNode(true));
    const body = doc.createElement("tbody");
    body.append(copy);
    table.append(body);
    ghost.append(table);
  } else {
    ghost.append(copy);
  }
  return ghost;
}
