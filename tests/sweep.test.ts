import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sweepRowsIntoFolders } from "../src/content/sweep-animation";

function row(threadId: string): { threadId: string; element: HTMLElement } {
  const element = document.createElement("div");
  element.textContent = threadId;
  document.body.append(element);
  return { threadId, element };
}

describe("sweepRowsIntoFolders", () => {
  beforeEach(() => {
    HTMLElement.prototype.animate = vi.fn(() => ({ finished: Promise.resolve() })) as never;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("lands rows that have a box, hides originals, and cleans up its overlay", async () => {
    const chip = document.createElement("button");
    document.body.append(chip);
    const filed = row("t1");
    const unfiled = row("t2");
    const landed: string[] = [];

    const release = await sweepRowsIntoFolders({
      rows: [filed, unfiled],
      targetFor: (threadId) => (threadId === "t1" ? chip : null),
      onLand: (threadId) => landed.push(threadId)
    });

    expect(landed).toEqual(["t1"]);
    expect(filed.element.style.visibility).toBe("hidden");
    expect(unfiled.element.style.visibility).toBe("hidden");
    expect(document.querySelector("[data-mercato-sweep]")).toBeNull();

    release();
    expect(filed.element.style.visibility).toBe("");
    expect(unfiled.element.style.visibility).toBe("");
  });

  it("keeps rows hidden until Gmail stops showing them", async () => {
    vi.useFakeTimers();
    const swept = row("t1");
    let shown = true;
    vi.spyOn(swept.element, "getClientRects").mockImplementation(
      () => (shown ? [new DOMRect(0, 0, 10, 10)] : []) as unknown as DOMRectList
    );

    const release = await sweepRowsIntoFolders({
      rows: [swept],
      targetFor: () => null,
      onLand: () => undefined
    });
    release(3000);
    vi.advanceTimersByTime(300);
    expect(swept.element.style.visibility).toBe("hidden");

    shown = false;
    vi.advanceTimersByTime(100);
    expect(swept.element.style.visibility).toBe("");
  });
});
