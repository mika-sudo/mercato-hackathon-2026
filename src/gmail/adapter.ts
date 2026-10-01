import type { InboxSDK, ThreadRowView, ThreadView } from "@inboxsdk/core";
import { emailSchema, gmailIdSchema } from "../shared/contracts";
import { routeSearchQuery } from "./search";

export type Dispose = () => void;

export interface AdapterSnapshot {
  mailboxEmail: string | null;
  openThreadId: string | null;
  visibleThreadIds: string[];
}

export interface VisibleRow {
  threadId: string;
  element: HTMLElement;
}

export interface MailRoute {
  list: boolean;
  /** True for Gmail search results, false for native lists like Inbox or Sent. */
  search: boolean;
  /** Null for list routes that are not expressible as a Gmail search. */
  query: string | null;
}

export function gmailApiId(value: unknown): string | null {
  const parsed = gmailIdSchema.safeParse(value);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

export class InboxSdkAdapter {
  private mailboxEmail: string | null = null;
  private openThreadId: string | null = null;
  private readonly rows = new Map<string, HTMLElement>();
  private readonly listeners = new Set<() => void>();
  private readonly cleanup: Dispose[] = [];
  private searchReplacement: HTMLElement | null = null;
  private hiddenSearch: { element: HTMLElement; previousDisplay: string } | null = null;
  private searchTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(private readonly sdk: InboxSDK, private readonly window: Window = globalThis.window) {}

  start(): void {
    if (this.destroyed) return;
    this.syncMailbox();
    // Rows and thread views report their own destroy; this also runs on window focus,
    // so it must not forget rows or the open email that are still on the page.
    const onRoute = () => {
      this.syncMailbox();
      for (const [id, element] of this.rows) if (!element.isConnected) this.rows.delete(id);
      this.emit();
    };
    this.cleanup.push(
      this.sdk.Router.handleAllRoutes(onRoute),
      this.sdk.Conversations.registerThreadViewHandler((thread) => {
        void this.captureThreadView(thread);
      }),
      this.sdk.Lists.registerThreadRowViewHandler((row) => {
        void this.captureThreadRow(row);
      }),
      this.sdk.Lists.registerThreadRowViewSelectionHandler(() => this.emit())
    );
    this.window.addEventListener("hashchange", onRoute);
    this.window.addEventListener("focus", onRoute);
    this.cleanup.push(() => {
      this.window.removeEventListener("hashchange", onRoute);
      this.window.removeEventListener("focus", onRoute);
    });
    this.emit();
  }

  subscribe(listener: () => void): Dispose {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): AdapterSnapshot {
    return {
      mailboxEmail: this.mailboxEmail,
      openThreadId: this.openThreadId,
      visibleThreadIds: [...this.rows.keys()]
    };
  }

  /** Rows currently on screen, top to bottom. */
  visibleRows(limit = 40): VisibleRow[] {
    const viewportHeight = this.window.innerHeight;
    return [...this.rows]
      .map(([threadId, element]) => ({ threadId, element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) =>
        element.isConnected && rect.height > 0 && rect.bottom > 0 && rect.top < viewportHeight)
      .sort((a, b) => a.rect.top - b.rect.top)
      .slice(0, limit)
      .map(({ threadId, element }) => ({ threadId, element }));
  }

  currentRoute(): MailRoute | null {
    try {
      const route = this.sdk.Router.getCurrentRouteView();
      const list = route.getRouteType() === this.sdk.Router.RouteTypes.LIST;
      const routeId = route.getRouteID();
      return {
        list,
        search: routeId === this.sdk.Router.NativeRouteIDs.SEARCH,
        query: list ? routeSearchQuery(routeId, route.getParams()) : null
      };
    } catch {
      return null;
    }
  }

  async search(query: string): Promise<void> {
    // Raw params let InboxSDK encode spaces, slashes and quotes exactly once.
    await this.sdk.Router.goto(this.sdk.Router.NativeRouteIDs.SEARCH, { query });
  }

  async openLabel(label: string): Promise<void> {
    await this.sdk.Router.goto(this.sdk.Router.NativeRouteIDs.LABEL, { labelName: label });
  }

  async openInbox(): Promise<void> {
    await this.sdk.Router.goto(this.sdk.Router.NativeRouteIDs.INBOX);
  }

  /** Hide Gmail's header search and show `element` in its place; null restores Gmail's. */
  replaceSearch(element: HTMLElement | null): void {
    if (this.destroyed) return;
    if (this.searchReplacement && this.searchReplacement !== element) this.searchReplacement.remove();
    this.searchReplacement = element;
    this.syncSearch();
    if (element && this.searchTimer === null) {
      // Gmail can re-render its header and drop foreign nodes.
      this.searchTimer = setInterval(() => this.syncSearch(), 1000);
    }
    if (!element && this.searchTimer !== null) {
      clearInterval(this.searchTimer);
      this.searchTimer = null;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.replaceSearch(null);
    this.destroyed = true;
    for (const dispose of [...this.cleanup]) dispose();
    this.cleanup.length = 0;
    this.listeners.clear();
    this.rows.clear();
    this.openThreadId = null;
  }

  private syncMailbox(): void {
    const parsed = emailSchema.safeParse(this.sdk.User.getEmailAddress());
    this.mailboxEmail = parsed.success ? parsed.data : null;
  }

  private async captureThreadView(thread: ThreadView): Promise<void> {
    if (this.destroyed) return;
    this.syncMailbox();
    const id = gmailApiId(await thread.getThreadIDAsync().catch(() => null));
    // A view closed while its id resolved has already fired destroy; tracking it would stick.
    if (!id || thread.destroyed) return;
    this.openThreadId = id;
    thread.on("destroy", () => {
      if (this.openThreadId === id) {
        this.openThreadId = null;
        this.emit();
      }
    });
    this.emit();
  }

  private async captureThreadRow(row: ThreadRowView): Promise<void> {
    if (this.destroyed) return;
    const id = gmailApiId(await row.getThreadIDAsync().catch(() => null));
    if (!id || row.destroyed) return;
    const element = row.getElement();
    this.rows.set(id, element);
    row.on("destroy", () => {
      if (this.rows.get(id) === element) this.rows.delete(id);
      this.emit();
    });
    this.emit();
  }

  private syncSearch(): void {
    const element = this.searchReplacement;
    const hidden = this.hiddenSearch;
    if (element && hidden?.element.isConnected && hidden.element.nextElementSibling === element) return;
    if (hidden) {
      hidden.element.style.display = hidden.previousDisplay;
      this.hiddenSearch = null;
    }
    if (!element) return;
    const anchor = this.findSearchAnchor();
    if (!anchor) return;
    const width = anchor.getBoundingClientRect().width;
    if (width > 0) element.style.setProperty("--mercato-search-width", `${Math.round(width)}px`);
    this.hiddenSearch = { element: anchor, previousDisplay: anchor.style.display };
    anchor.style.display = "none";
    anchor.insertAdjacentElement("afterend", element);
  }

  private findSearchAnchor(): HTMLElement | null {
    const doc = this.window.document;
    // The query input identifies the header search box; Gmail also renders other
    // role="search" strips (refinement chips) that are not the box itself.
    const input = [...doc.querySelectorAll<HTMLInputElement>('input[name="q"], input[aria-label*="Search"]')]
      .find((element) => isVisible(element) && !element.closest("[data-mercato-search]"));
    if (!input) return null;
    const owner = [...doc.querySelectorAll<HTMLElement>('form[role="search"], [role="search"]')]
      .find((element) => element.contains(input) && isVisible(element));
    if (owner) return owner;
    let anchor: HTMLElement = input;
    for (let depth = 0; anchor.parentElement && depth < 8; depth += 1) {
      const next: HTMLElement = anchor.parentElement;
      if (!isVisible(next)) break;
      anchor = next;
      if (anchor.getBoundingClientRect().width >= 320 && anchor.childElementCount >= 2) break;
    }
    return anchor.closest<HTMLElement>("form, [role='search'], div") ?? anchor;
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

function isVisible(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}
