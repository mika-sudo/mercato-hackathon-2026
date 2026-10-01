import type { Folder } from "../shared/contracts";
import { DEFAULT_FOLDERS } from "../shared/folders";
import type { MailRoute, VisibleRow } from "../gmail/adapter";
import { folderFromQuery, folderSearchQuery, userSearchText } from "../gmail/search";
import type { FolderControllerState } from "./controller";
import { SearchBarView } from "./search-bar";
import { nextFrames, prefersReducedMotion, sweepRowsIntoFolders } from "./sweep-animation";

const TOGGLE_STORAGE_KEY = "mercato-shell-visible";

const STYLES = `
  [data-mercato-search] {
    display: flex;
    align-items: center;
    gap: 4px;
    box-sizing: border-box;
    width: var(--mercato-search-width, min(720px, 50vw));
    max-width: 100%;
    min-width: 0;
    height: 48px;
    padding: 0 8px 0 4px;
    border-radius: 24px;
    background: #eaf1fb;
  }
  [data-mercato-search]:focus-within {
    background: #ffffff;
    box-shadow: 0 1px 1px 0 rgba(65, 69, 73, 0.3), 0 1px 3px 1px rgba(65, 69, 73, 0.15);
  }
  .mercato-search-icon,
  .mercato-search-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: #444746;
    cursor: pointer;
  }
  .mercato-search-icon:hover,
  .mercato-search-clear:hover {
    background: rgba(68, 71, 70, 0.08);
  }
  .mercato-search-scope {
    flex: 0 0 auto;
    padding: 4px 10px;
    border-radius: 12px;
    background: #d3e3fd;
    color: #041e49;
    font: 600 12px/1.2 "Google Sans", Roboto, Arial, sans-serif;
    white-space: nowrap;
  }
  .mercato-search-input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    padding: 0 8px;
    border: 0;
    outline: 0;
    background: transparent;
    color: #1f1f1f;
    font: 400 16px "Google Sans", Roboto, Arial, sans-serif;
  }
  html[data-mercato-visible="1"] div[role="main"] .aKh,
  html[data-mercato-visible="1"] div[role="main"] table:has([role="tablist"]) {
    display: none !important;
  }
  html[data-mercato-visible="1"] div[role="main"] [role="toolbar"][aria-label="search refinement"],
  html[data-mercato-visible="1"] div[role="main"] [role="toolbar"]:has([data-impression-suffix="ADVANCED_SEARCH_LINK"]) {
    display: none !important;
  }
  /* Gmail sizes this toolbar block to fit the chips row as well; without this the hidden row leaves a gap. */
  html[data-mercato-visible="1"] div[role="main"] [gh="tm"]:has(> [role="toolbar"][aria-label="search refinement"]),
  html[data-mercato-visible="1"] div[role="main"] [gh="tm"]:has(> [role="toolbar"] [data-impression-suffix="ADVANCED_SEARCH_LINK"]) {
    height: auto !important;
    min-height: 0 !important;
    flex-basis: auto !important;
    padding-top: 8px !important;
    padding-bottom: 8px !important;
  }
  [data-mercato-shell] {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    height: 100%;
    margin-left: 12px;
  }
  .mercato-shell-row {
    display: inline-flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 6px;
  }
  .mercato-folder-box {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    box-sizing: border-box;
    padding: 0 6px 0 10px;
    border: 1px solid #cad7f8;
    border-radius: 8px;
    background: #ffffff;
    font: 500 12px/1 "Google Sans", Roboto, Arial, sans-serif;
    color: #3c4043;
    white-space: nowrap;
    cursor: pointer;
  }
  .mercato-folder-box:hover {
    border-color: #8fadf5;
    background: #f6f9ff;
  }
  .mercato-folder-box[aria-pressed="true"] {
    border-color: #0b57d0;
    background: #d3e3fd;
    color: #041e49;
  }
  .mercato-folder-box[aria-pressed="true"] .mercato-folder-count {
    background: #ffffff;
  }
  .mercato-folder-box[aria-current="true"] {
    border-color: #3c78ff;
    box-shadow: 0 0 0 1px rgba(60, 120, 255, 0.25) inset;
  }
  .mercato-folder-count {
    min-width: 18px;
    padding: 3px 6px;
    box-sizing: border-box;
    border-radius: 10px;
    background: #e8f0fe;
    color: #19223a;
    font-weight: 700;
    text-align: center;
  }
  .mercato-shell-error {
    display: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #b42318;
    color: #ffffff;
    font: 700 12px/18px Arial, sans-serif;
    text-align: center;
    cursor: help;
  }
  .mercato-shell-toggle {
    position: fixed;
    left: 14px;
    bottom: 14px;
    z-index: 2147483647;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #d0d5dd;
    border-radius: 999px;
    background: #ffffff;
    color: #111827;
    font: 600 12px/1 "Google Sans", Roboto, Arial, sans-serif;
    padding: 6px 8px 6px 12px;
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(16, 24, 40, 0.12);
  }
  .mercato-shell-toggle:focus-visible {
    outline: 2px solid #0b57d0;
    outline-offset: 2px;
  }
  .mercato-toggle-track {
    position: relative;
    width: 28px;
    height: 16px;
    border-radius: 8px;
    background: #c4c7c5;
    transition: background-color 150ms ease;
  }
  .mercato-toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: transform 150ms ease;
  }
  .mercato-shell-toggle[aria-checked="true"] .mercato-toggle-track {
    background: #0b57d0;
  }
  .mercato-shell-toggle[aria-checked="true"] .mercato-toggle-knob {
    transform: translateX(12px);
  }
`;

export interface FolderShellController {
  getState(): FolderControllerState;
  setFolder(gmailThreadId: string, folderId: string | null): Promise<void>;
}

export interface MailNavigator {
  /** Null until Gmail has reported its first route. */
  currentRoute(): MailRoute | null;
  search(query: string): Promise<void>;
  openInbox(): Promise<void>;
  replaceSearch(element: HTMLElement | null): void;
  visibleRows(): VisibleRow[];
}

export class FolderShellView {
  private host: HTMLDivElement | null = null;
  private style: HTMLStyleElement | null = null;
  private row: HTMLDivElement | null = null;
  private errorEl: HTMLSpanElement | null = null;
  private toggle: HTMLButtonElement | null = null;
  private readonly searchBar: SearchBarView;
  private placementTick: number | null = null;
  private visible = true;
  private activeFolderId: string | null = DEFAULT_FOLDERS[0]!.id;
  /** Opening P0 waits until Gmail has a route; the extension can load before it does. */
  private pendingActivation = false;
  private sweeping = false;
  /** Counts shown while emails fly in; they tick up to the real counts as each one lands. */
  private sweepCounts: Map<string, number> | null = null;
  private destroyed = false;

  constructor(
    private readonly controller: FolderShellController,
    private readonly navigator: MailNavigator | null,
    private readonly doc: Document = window.document
  ) {
    this.visible = readVisibleState();
    this.searchBar = new SearchBarView((text) => this.runSearch(text), doc);
  }

  mount(): void {
    if (this.destroyed) return;
    this.ensureDom();
    if (this.visible) void this.activate();
    this.render(this.controller.getState());
  }

  render(state: FolderControllerState): void {
    if (this.destroyed) return;
    this.ensureDom();
    const row = this.row;
    if (!row) return;
    if (this.pendingActivation) void this.activate();
    const folders = this.folders(state);
    const route = this.navigator?.currentRoute() ?? null;
    if (route?.list) {
      this.activeFolderId = route.query === null ? null : folderFromQuery(route.query, folders)?.id ?? null;
    }
    const activeFolder = folders.find((folder) => folder.id === this.activeFolderId) ?? null;
    let typed: string | null = null;
    if (route?.list) typed = route.search && route.query !== null ? userSearchText(route.query, folders) : "";
    this.searchBar.sync(typed, activeFolder?.name ?? null);
    row.replaceChildren();

    const counts = folderCounts(state);
    const openThreadId = state.snapshot.openThreadId;
    const openCategory = openThreadId ? state.categoryByThread[openThreadId] : undefined;

    for (const folder of folders) {
      const count = this.sweepCounts?.get(folder.id) ?? counts.get(folder.id) ?? 0;
      const button = this.doc.createElement("button");
      button.type = "button";
      button.className = "mercato-folder-box";
      button.dataset.mercatoFolderId = folder.id;
      button.setAttribute("aria-label", `${folder.name}, ${count}`);
      const apiCount = state.folderCounts?.[folder.id];
      if (apiCount) button.title = `${apiCount.threads} emails, ${apiCount.unread} unread`;
      button.setAttribute("aria-pressed", String(folder.id === this.activeFolderId));
      if (openCategory?.folderId === folder.id) button.setAttribute("aria-current", "true");
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const threadId = this.controller.getState().snapshot.openThreadId;
        if (threadId) {
          void this.controller.setFolder(threadId, folder.id).catch(() => undefined);
          return;
        }
        void this.openFolder(folder);
      });

      const title = this.doc.createElement("span");
      title.className = "mercato-folder-title";
      title.textContent = folder.name;
      const countEl = this.doc.createElement("span");
      countEl.className = "mercato-folder-count";
      countEl.textContent = String(count);
      button.append(title, countEl);
      row.append(button);
    }

    if (this.errorEl) {
      this.errorEl.title = state.error ?? "";
      this.errorEl.style.display = state.error ? "inline-block" : "none";
    }

    this.syncVisibility();
    this.placeInToolbar();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.placementTick !== null) {
      window.clearInterval(this.placementTick);
      this.placementTick = null;
    }
    delete this.doc.documentElement.dataset.mercatoVisible;
    this.navigator?.replaceSearch(null);
    this.host?.remove();
    this.style?.remove();
    this.toggle?.remove();
    this.host = null;
    this.style = null;
    this.row = null;
    this.errorEl = null;
    this.toggle = null;
  }

  private ensureDom(): void {
    if (!this.style) {
      const style = this.doc.createElement("style");
      style.dataset.mercatoShellStyle = "1";
      style.textContent = STYLES;
      this.doc.head.append(style);
      this.style = style;
    }

    if (!this.host) {
      const host = this.doc.createElement("div");
      host.dataset.mercatoShell = "1";
      // Gmail treats clicks inside its toolbar as list actions.
      host.addEventListener("mousedown", (event) => event.stopPropagation());
      const row = this.doc.createElement("div");
      row.className = "mercato-shell-row";
      const errorEl = this.doc.createElement("span");
      errorEl.className = "mercato-shell-error";
      errorEl.textContent = "!";
      host.append(row, errorEl);
      this.host = host;
      this.row = row;
      this.errorEl = errorEl;
    }

    if (!this.toggle) {
      const toggle = this.doc.createElement("button");
      toggle.type = "button";
      toggle.className = "mercato-shell-toggle";
      toggle.setAttribute("role", "switch");
      const label = this.doc.createElement("span");
      label.textContent = "Talos";
      const track = this.doc.createElement("span");
      track.className = "mercato-toggle-track";
      const knob = this.doc.createElement("span");
      knob.className = "mercato-toggle-knob";
      track.append(knob);
      toggle.append(label, track);
      toggle.addEventListener("click", () => {
        if (this.sweeping) return;
        this.visible = !this.visible;
        writeVisibleState(this.visible);
        if (this.visible && this.canSweep()) {
          void this.sweepIn();
          return;
        }
        if (this.visible) void this.activate();
        else this.deactivate();
        this.render(this.controller.getState());
      });
      this.toggle = toggle;
      this.doc.body.append(toggle);
    }

    if (this.placementTick === null) {
      // Gmail swaps toolbars on every navigation and drops foreign nodes.
      this.placementTick = window.setInterval(() => this.placeInToolbar(), 1000);
    }
  }

  private folders(state: FolderControllerState): Folder[] {
    const folders = state.folders.length ? state.folders : DEFAULT_FOLDERS;
    return [...folders].sort((a, b) => a.order - b.order);
  }

  /** Turning Mercato on takes over search and opens P0, unless a Mercato folder is already open. */
  private async activate(): Promise<void> {
    this.navigator?.replaceSearch(this.searchBar.element);
    if (!this.navigator) {
      this.activeFolderId = this.folders(this.controller.getState())[0]?.id ?? null;
      this.pendingActivation = false;
      return;
    }
    if (!this.navigator.currentRoute()) {
      this.pendingActivation = true;
      return;
    }
    this.pendingActivation = false;
    const folder = this.folderToOpenOnActivate();
    if (folder) await this.openFolder(folder);
  }

  private folderToOpenOnActivate(): Folder | null {
    const route = this.navigator?.currentRoute();
    if (!route?.list) return null;
    const folders = this.folders(this.controller.getState());
    if (route.query !== null && folderFromQuery(route.query, folders)) return null;
    return folders[0] ?? null;
  }

  /** The sweep only makes sense when turning on replaces the visible list with P0. */
  private canSweep(): boolean {
    if (!this.navigator || prefersReducedMotion()) return false;
    if (this.controller.getState().snapshot.openThreadId) return false;
    return this.folderToOpenOnActivate() !== null;
  }

  private async sweepIn(): Promise<void> {
    const navigator = this.navigator;
    if (!navigator) return;
    this.sweeping = true;
    let release: ((maxWaitMs?: number) => void) | null = null;
    try {
      navigator.replaceSearch(this.searchBar.element);
      this.render(this.controller.getState());
      // Let the chips lay out and the tab row collapse before measuring rows and targets.
      await nextFrames(2);
      const rows = navigator.visibleRows();
      if (rows.length && !this.destroyed) {
        const state = this.controller.getState();
        const folderOf = (threadId: string) => state.categoryByThread[threadId]?.folderId ?? null;
        const counts = folderCounts(state);
        for (const row of rows) {
          const folderId = folderOf(row.threadId);
          if (folderId) counts.set(folderId, Math.max(0, (counts.get(folderId) ?? 1) - 1));
        }
        this.sweepCounts = counts;
        this.render(state);
        release = await sweepRowsIntoFolders({
          rows,
          targetFor: (threadId) => {
            const folderId = folderOf(threadId);
            return folderId ? this.chipFor(folderId) : null;
          },
          onLand: (threadId) => {
            const folderId = folderOf(threadId);
            if (folderId) this.landInChip(folderId);
          },
          doc: this.doc
        });
      }
    } catch {
      // A failed animation must not keep Mercato from turning on.
    } finally {
      this.sweepCounts = null;
      this.sweeping = false;
    }
    if (this.destroyed) {
      release?.();
      return;
    }
    await this.activate();
    release?.(3000);
    this.render(this.controller.getState());
  }

  private chipFor(folderId: string): HTMLElement | null {
    const chip = this.row?.querySelector<HTMLElement>(
      `[data-mercato-folder-id="${CSS.escape(folderId)}"]`
    );
    return chip && chip.isConnected && isVisible(chip) ? chip : null;
  }

  private landInChip(folderId: string): void {
    if (!this.sweepCounts) return;
    const count = (this.sweepCounts.get(folderId) ?? 0) + 1;
    this.sweepCounts.set(folderId, count);
    const chip = this.chipFor(folderId);
    if (!chip) return;
    const countEl = chip.querySelector(".mercato-folder-count");
    if (countEl) countEl.textContent = String(count);
    if (!chip.getAnimations().length) {
      chip.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
        { duration: 220, easing: "ease-out" }
      );
    }
  }

  /** Turning Mercato off restores Gmail's search and leaves Mercato folders for the inbox. */
  private deactivate(): void {
    this.pendingActivation = false;
    if (!this.navigator) return;
    this.navigator.replaceSearch(null);
    const route = this.navigator.currentRoute();
    const folders = this.folders(this.controller.getState());
    if (route?.list && route.query !== null && folderFromQuery(route.query, folders)) {
      void this.navigator.openInbox().catch(() => undefined);
    }
  }

  private async openFolder(folder: Folder): Promise<void> {
    this.activeFolderId = folder.id;
    if (!this.navigator) {
      this.render(this.controller.getState());
      return;
    }
    const folders = this.folders(this.controller.getState());
    await this.navigator.search(folderSearchQuery(this.searchBar.text, folder, folders)).catch(() => undefined);
  }

  private runSearch(text: string): void {
    if (!this.navigator) return;
    const folders = this.folders(this.controller.getState());
    const folder = folders.find((item) => item.id === this.activeFolderId) ?? null;
    const query = folderSearchQuery(text, folder, folders);
    if (!query) {
      void this.navigator.openInbox().catch(() => undefined);
      return;
    }
    void this.navigator.search(query).catch(() => undefined);
  }

  private placeInToolbar(): void {
    const host = this.host;
    if (!host) return;
    const toolbar = visible(this.doc.querySelectorAll<HTMLElement>('div[gh="mtb"]'));
    if (!toolbar) return;
    const buttons = toolbar.querySelector<HTMLElement>(".G-tF");
    if (buttons) {
      if (host.parentElement !== buttons) buttons.append(host);
      return;
    }
    if (host.previousElementSibling !== toolbar) toolbar.after(host);
  }

  private syncVisibility(): void {
    this.doc.documentElement.dataset.mercatoVisible = this.visible ? "1" : "0";
    if (this.host) this.host.style.display = this.visible ? "" : "none";
    this.toggle?.setAttribute("aria-checked", String(this.visible));
  }
}

/** Mailbox-wide counts from the API, or counts of the threads seen in this tab until they load. */
function folderCounts(state: FolderControllerState): Map<string, number> {
  const counts = new Map<string, number>();
  if (state.folderCounts) {
    for (const [folderId, count] of Object.entries(state.folderCounts)) counts.set(folderId, count.threads);
    return counts;
  }
  for (const category of Object.values(state.categoryByThread)) {
    if (!category.folderId) continue;
    counts.set(category.folderId, (counts.get(category.folderId) ?? 0) + 1);
  }
  return counts;
}

function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function visible(nodes: NodeListOf<HTMLElement>): HTMLElement | null {
  for (const node of nodes) if (isVisible(node)) return node;
  return null;
}

function readVisibleState(): boolean {
  try {
    return window.localStorage.getItem(TOGGLE_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeVisibleState(value: boolean): void {
  try {
    window.localStorage.setItem(TOGGLE_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage can be unavailable in restricted contexts.
  }
}
