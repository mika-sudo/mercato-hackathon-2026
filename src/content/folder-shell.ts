import type { Folder } from "../shared/contracts";
import { DEFAULT_FOLDERS } from "../shared/folders";
import type { MailRoute } from "../gmail/adapter";
import { folderFromQuery, folderSearchQuery, userSearchText } from "../gmail/search";
import type { FolderControllerState } from "./controller";
import { SearchBarView } from "./search-bar";

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
    border: 1px solid #d0d5dd;
    border-radius: 999px;
    background: #ffffff;
    color: #111827;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 12px;
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(16, 24, 40, 0.12);
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
    if (this.visible) this.activate();
    this.render(this.controller.getState());
  }

  render(state: FolderControllerState): void {
    if (this.destroyed) return;
    this.ensureDom();
    const row = this.row;
    if (!row) return;
    if (this.pendingActivation) this.activate();
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

    const counts = new Map<string, number>();
    for (const category of Object.values(state.categoryByThread)) {
      if (!category.folderId) continue;
      counts.set(category.folderId, (counts.get(category.folderId) ?? 0) + 1);
    }

    const openThreadId = state.snapshot.openThreadId;
    const openCategory = openThreadId ? state.categoryByThread[openThreadId] : undefined;

    for (const folder of folders) {
      const count = counts.get(folder.id) ?? 0;
      const button = this.doc.createElement("button");
      button.type = "button";
      button.className = "mercato-folder-box";
      button.dataset.mercatoFolderId = folder.id;
      button.setAttribute("aria-label", `${folder.name}, ${count}`);
      button.setAttribute("aria-pressed", String(folder.id === this.activeFolderId));
      if (openCategory?.folderId === folder.id) button.setAttribute("aria-current", "true");
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const threadId = this.controller.getState().snapshot.openThreadId;
        if (threadId) {
          void this.controller.setFolder(threadId, folder.id).catch(() => undefined);
          return;
        }
        this.openFolder(folder);
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
      toggle.addEventListener("click", () => {
        this.visible = !this.visible;
        writeVisibleState(this.visible);
        if (this.visible) this.activate();
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
  private activate(): void {
    this.navigator?.replaceSearch(this.searchBar.element);
    const first = this.folders(this.controller.getState())[0] ?? null;
    if (!this.navigator) {
      this.activeFolderId = first?.id ?? null;
      this.pendingActivation = false;
      return;
    }
    const route = this.navigator.currentRoute();
    if (!route) {
      this.pendingActivation = true;
      return;
    }
    this.pendingActivation = false;
    if (!route.list || !first) return;
    const folders = this.folders(this.controller.getState());
    if (route.query !== null && folderFromQuery(route.query, folders)) return;
    this.openFolder(first);
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

  private openFolder(folder: Folder): void {
    this.activeFolderId = folder.id;
    if (!this.navigator) {
      this.render(this.controller.getState());
      return;
    }
    const folders = this.folders(this.controller.getState());
    void this.navigator.search(folderSearchQuery(this.searchBar.text, folder, folders)).catch(() => undefined);
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
    if (this.toggle) this.toggle.textContent = this.visible ? "Hide Mercato" : "Show Mercato";
  }
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
