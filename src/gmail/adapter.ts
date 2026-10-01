import type { InboxSDK, ThreadRowView, ThreadView } from "@inboxsdk/core";
import { emailSchema, gmailIdSchema } from "../shared/contracts";

export type Dispose = () => void;

export interface AdapterSnapshot {
  mailboxEmail: string | null;
  openThreadId: string | null;
  visibleThreadIds: string[];
}

export function gmailApiId(value: unknown): string | null {
  const parsed = gmailIdSchema.safeParse(value);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

export class InboxSdkAdapter {
  private mailboxEmail: string | null = null;
  private openThreadId: string | null = null;
  private readonly visibleThreadIds = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly cleanup: Dispose[] = [];
  private destroyed = false;

  constructor(private readonly sdk: InboxSDK, private readonly window: Window = globalThis.window) {}

  start(): void {
    if (this.destroyed) return;
    this.syncMailbox();
    const onRoute = () => {
      this.syncMailbox();
      this.openThreadId = null;
      this.visibleThreadIds.clear();
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
      visibleThreadIds: [...this.visibleThreadIds]
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const dispose of [...this.cleanup]) dispose();
    this.cleanup.length = 0;
    this.listeners.clear();
    this.visibleThreadIds.clear();
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
    if (!id) return;
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
    if (!id) return;
    this.visibleThreadIds.add(id);
    row.on("destroy", () => {
      this.visibleThreadIds.delete(id);
      this.emit();
    });
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
