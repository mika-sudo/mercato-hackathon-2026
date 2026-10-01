import type { Folder } from "../shared/contracts";
import { DEFAULT_FOLDERS } from "../shared/folders";
import type { MailRoute, VisibleRow } from "../gmail/adapter";
import { folderFromQuery, folderSearchQuery, quotedLabel, userSearchText } from "../gmail/search";
import type { FolderControllerState } from "./controller";
import { SearchBarView } from "./search-bar";
import { OnboardingModal } from "./onboarding-modal";
import { loadOnboarding, saveOnboarding } from "./onboarding-store";
import { nextFrames, prefersReducedMotion, slideInBoxes, sweepRowsIntoFolders } from "./sweep-animation";

const TOGGLE_STORAGE_KEY = "mercato-shell-visible";
const PENDING_MAX_MS = 10_000;

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
  /* Gmail's toolbar block paints over this spot on search pages; keep the boxes clickable. */
  [data-mercato-shell] {
    position: relative;
    z-index: 3;
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
    position: relative;
    overflow: hidden;
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
    transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 80ms ease;
  }
  .mercato-folder-box:active {
    transform: scale(0.96);
  }
  .mercato-folder-box[aria-busy="true"]::after {
    content: "";
    position: absolute;
    left: 0;
    bottom: 0;
    width: 40%;
    height: 2px;
    border-radius: 1px;
    background: #0b57d0;
    animation: mercato-box-loading 900ms ease-in-out infinite;
  }
  @keyframes mercato-box-loading {
    from { transform: translateX(-100%); }
    to { transform: translateX(250%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .mercato-folder-box { transition: none; }
    .mercato-folder-box:active { transform: none; }
    .mercato-folder-box[aria-busy="true"]::after { width: 100%; animation: none; }
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
  .mercato-mode {
    position: fixed;
    left: 12px;
    bottom: 12px;
    z-index: 2147483647;
    display: inline-flex;
    align-items: center;
    gap: 1px;
    padding: 2px;
    border: 1px solid #d0d5dd;
    border-radius: 999px;
    background: #ffffff;
    color: #111827;
    font: 600 11px/1 "Google Sans", Roboto, Arial, sans-serif;
    box-shadow: 0 2px 6px rgba(16, 24, 40, 0.1);
  }
  .mercato-mode-label {
    padding: 0 5px 0 7px;
  }
  .mercato-mode button {
    height: 20px;
    padding: 0 8px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #5f6368;
    font: inherit;
    cursor: pointer;
  }
  .mercato-mode button:hover {
    background: #f1f3f4;
  }
  .mercato-mode button:focus-visible {
    outline: 2px solid #0b57d0;
    outline-offset: 1px;
  }
  .mercato-mode button[aria-checked="true"] {
    background: #e8eaed;
    color: #1f1f1f;
  }
  .mercato-mode button[data-mode="talos"][aria-checked="true"] {
    background: #0b57d0;
    color: #ffffff;
  }
  .mercato-mode button[data-mode="onboarding"][aria-checked="true"] {
    background: #34d3a6;
    color: #06261d;
  }
`;

type TalosMode = "off" | "talos" | "onboarding";

const MODES: Array<[TalosMode, string]> = [
  ["off", "Off"],
  ["talos", "On"],
  ["onboarding", "Onboarding"]
];

export interface FolderShellController {
  getState(): FolderControllerState;
}

export interface MailNavigator {
  /** Null until Gmail has reported its first route. */
  currentRoute(): MailRoute | null;
  search(query: string): Promise<void>;
  openLabel(label: string): Promise<void>;
  openInbox(): Promise<void>;
  replaceSearch(element: HTMLElement | null): void;
  visibleRows(): VisibleRow[];
}

export class FolderShellView {
  private host: HTMLDivElement | null = null;
  private style: HTMLStyleElement | null = null;
  private row: HTMLDivElement | null = null;
  private errorEl: HTMLSpanElement | null = null;
  /** Boxes are updated in place: rebuilding them between mousedown and mouseup drops the click. */
  private readonly chips = new Map<string, HTMLButtonElement>();
  private chipsKey = "";
  private modeSelector: HTMLDivElement | null = null;
  private readonly searchBar: SearchBarView;
  private readonly onboarding: OnboardingModal;
  private placementTick: number | null = null;
  /** Talos On: folder boxes, our search bar and P0 are shown. */
  private visible = false;
  private onboardingOpen = false;
  private activeFolderId: string | null = DEFAULT_FOLDERS[0]!.id;
  /** The box just clicked: shown selected and loading until Gmail's route moves off `fromQuery`. */
  private pendingFolder: { folderId: string; fromQuery: string | null } | null = null;
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
    this.onboarding = new OnboardingModal(doc);
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
    if (this.pendingFolder && (route?.query ?? null) !== this.pendingFolder.fromQuery) this.pendingFolder = null;
    const selectedId = this.selectedFolderId();
    const activeFolder = folders.find((folder) => folder.id === selectedId) ?? null;
    let typed: string | null = null;
    if (route?.list) typed = route.search && route.query !== null ? userSearchText(route.query, folders) : "";
    this.searchBar.sync(typed, activeFolder?.name ?? null);
    this.syncChips(row, folders);

    const counts = folderCounts(state);
    const openThreadId = state.snapshot.openThreadId;
    const openCategory = openThreadId ? state.categoryByThread[openThreadId] : undefined;

    for (const folder of folders) {
      const button = this.chips.get(folder.id);
      if (!button) continue;
      const count = this.sweepCounts?.get(folder.id) ?? counts.get(folder.id) ?? 0;
      button.setAttribute("aria-label", `${folder.name}, ${count}`);
      const apiCount = state.folderCounts?.[folder.id];
      if (apiCount) button.title = `${apiCount.threads} emails, ${apiCount.unread} unread`;
      else button.removeAttribute("title");
      button.setAttribute("aria-pressed", String(folder.id === selectedId));
      if (folder.id === this.pendingFolder?.folderId) button.setAttribute("aria-busy", "true");
      else button.removeAttribute("aria-busy");
      if (openCategory?.folderId === folder.id) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
      const countEl = button.querySelector(".mercato-folder-count");
      if (countEl) countEl.textContent = String(count);
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
    this.doc.removeEventListener("click", this.onCoveredClick, true);
    if (this.placementTick !== null) {
      window.clearInterval(this.placementTick);
      this.placementTick = null;
    }
    delete this.doc.documentElement.dataset.mercatoVisible;
    this.navigator?.replaceSearch(null);
    this.onboarding.close(null);
    this.host?.remove();
    this.style?.remove();
    this.modeSelector?.remove();
    this.host = null;
    this.style = null;
    this.row = null;
    this.errorEl = null;
    this.modeSelector = null;
  }

  private currentMode(): TalosMode {
    if (this.onboardingOpen) return "onboarding";
    return this.visible ? "talos" : "off";
  }

  private selectMode(mode: TalosMode): void {
    if (this.sweeping || mode === this.currentMode()) return;
    if (mode === "onboarding") {
      void this.runOnboarding();
      return;
    }
    if (this.onboardingOpen) {
      this.onboardingOpen = false;
      this.onboarding.close(null);
    }
    this.setTalos(mode === "talos");
  }

  private setTalos(on: boolean): void {
    if (on === this.visible) {
      this.render(this.controller.getState());
      return;
    }
    this.visible = on;
    writeVisibleState(on);
    if (on && this.canSweep()) {
      void this.sweepIn();
      return;
    }
    if (on) void this.activate();
    else this.deactivate();
    this.render(this.controller.getState());
    if (on && !prefersReducedMotion()) void slideInBoxes(this.visibleChips()).catch(() => undefined);
  }

  /** Building the inbox saves prompt v1 and turns Talos on; closing keeps the previous mode. */
  private async runOnboarding(): Promise<void> {
    this.onboardingOpen = true;
    this.syncVisibility();
    const saved = await loadOnboarding();
    if (this.destroyed || !this.onboardingOpen) return;
    const answers = await this.onboarding.open(saved?.answers ?? null);
    if (this.destroyed) return;
    const pickedOtherMode = !this.onboardingOpen;
    this.onboardingOpen = false;
    if (answers) await saveOnboarding(answers).catch(() => undefined);
    if (this.destroyed || pickedOtherMode) return;
    if (answers) this.setTalos(true);
    else this.syncVisibility();
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
      this.doc.addEventListener("click", this.onCoveredClick, true);
      this.host = host;
      this.row = row;
      this.errorEl = errorEl;
    }

    if (!this.modeSelector) {
      const selector = this.doc.createElement("div");
      selector.className = "mercato-mode";
      selector.setAttribute("role", "radiogroup");
      selector.setAttribute("aria-label", "Talos mode");
      const label = this.doc.createElement("span");
      label.className = "mercato-mode-label";
      label.textContent = "Talos";
      selector.append(label);
      for (const [mode, text] of MODES) {
        const button = this.doc.createElement("button");
        button.type = "button";
        button.dataset.mode = mode;
        button.setAttribute("role", "radio");
        button.textContent = text;
        button.addEventListener("click", () => this.selectMode(mode));
        selector.append(button);
      }
      this.modeSelector = selector;
      this.doc.body.append(selector);
    }

    if (this.placementTick === null) {
      // Gmail swaps toolbars on every navigation and drops foreign nodes.
      this.placementTick = window.setInterval(() => this.placeInToolbar(), 1000);
    }
  }

  private syncChips(row: HTMLElement, folders: Folder[]): void {
    const key = JSON.stringify(folders.map((folder) => [folder.id, folder.name]));
    if (key === this.chipsKey) return;
    this.chipsKey = key;
    this.chips.clear();
    row.replaceChildren(...folders.map((folder) => this.createChip(folder)));
  }

  private createChip(folder: Folder): HTMLButtonElement {
    const button = this.doc.createElement("button");
    button.type = "button";
    button.className = "mercato-folder-box";
    button.dataset.mercatoFolderId = folder.id;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.selectFolder(folder.id);
    });
    const title = this.doc.createElement("span");
    title.className = "mercato-folder-title";
    title.textContent = folder.name;
    const countEl = this.doc.createElement("span");
    countEl.className = "mercato-folder-count";
    button.append(title, countEl);
    this.chips.set(folder.id, button);
    return button;
  }

  /** Gmail's toolbar block can win hit-testing over a box; route such clicks by position. */
  private readonly onCoveredClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!this.visible || !(target instanceof Node)) return;
    for (const [folderId, chip] of this.chips) {
      if (target === chip || !target.contains(chip)) continue;
      const rect = chip.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) continue;
      event.stopPropagation();
      this.selectFolder(folderId);
      return;
    }
  };

  private selectFolder(folderId: string): void {
    const folder = this.folders(this.controller.getState()).find((item) => item.id === folderId);
    if (folder) void this.openFolder(folder);
  }

  private selectedFolderId(): string | null {
    return this.pendingFolder?.folderId ?? this.activeFolderId;
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
      // The boxes slide out first, starting now so they never flash in place.
      const boxesIn = slideInBoxes(this.visibleChips()).catch(() => undefined);
      // Let the tab row collapse before measuring rows.
      await nextFrames(2);
      const rows = this.destroyed ? [] : navigator.visibleRows();
      const state = this.controller.getState();
      const folderOf = (threadId: string) => state.categoryByThread[threadId]?.folderId ?? null;
      if (rows.length) {
        const counts = folderCounts(state);
        for (const row of rows) {
          const folderId = folderOf(row.threadId);
          if (folderId) counts.set(folderId, Math.max(0, (counts.get(folderId) ?? 1) - 1));
        }
        this.sweepCounts = counts;
        this.render(state);
      }
      // Emails fly only once every box is in place.
      await boxesIn;
      if (rows.length && !this.destroyed) {
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

  private visibleChips(): HTMLElement[] {
    return [...this.chips.values()].filter((chip) => chip.isConnected && isVisible(chip));
  }

  private chipFor(folderId: string): HTMLElement | null {
    const chip = this.chips.get(folderId);
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
    const navigator = this.navigator;
    if (!navigator) {
      this.render(this.controller.getState());
      return;
    }
    const folders = this.folders(this.controller.getState());
    const query = folderSearchQuery(this.searchBar.text, folder, folders);
    const fromQuery = navigator.currentRoute()?.query ?? null;
    const pending = fromQuery === query ? null : { folderId: folder.id, fromQuery };
    this.pendingFolder = pending;
    this.render(this.controller.getState());
    const settled = await this.go(query, folder).then(() => true, () => false);
    // Gmail can accept a route and never move to it; the box must not stay busy forever.
    const delay = settled ? PENDING_MAX_MS : 0;
    window.setTimeout(() => {
      if (!pending || this.pendingFolder !== pending) return;
      this.pendingFolder = null;
      this.render(this.controller.getState());
    }, delay);
  }

  private runSearch(text: string): void {
    if (!this.navigator) return;
    const folders = this.folders(this.controller.getState());
    const folder = folders.find((item) => item.id === this.selectedFolderId()) ?? null;
    const query = folderSearchQuery(text, folder, folders);
    if (!query) {
      void this.navigator.openInbox().catch(() => undefined);
      return;
    }
    void this.go(query, folder).catch(() => undefined);
  }

  /** A bare folder opens Gmail's label view, which loads much faster than a search. */
  private go(query: string, folder: Folder | null): Promise<void> {
    const navigator = this.navigator;
    if (!navigator) return Promise.resolve();
    const label = folder?.gmailLabel;
    if (label && query === quotedLabel(label)) return navigator.openLabel(label);
    return navigator.search(query);
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
    const mode = this.currentMode();
    for (const button of this.modeSelector?.querySelectorAll<HTMLElement>("button[data-mode]") ?? []) {
      button.setAttribute("aria-checked", String(button.dataset.mode === mode));
    }
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

/** Talos starts Off until the user turns it on. */
function readVisibleState(): boolean {
  try {
    return window.localStorage.getItem(TOGGLE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeVisibleState(value: boolean): void {
  try {
    window.localStorage.setItem(TOGGLE_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage can be unavailable in restricted contexts.
  }
}
