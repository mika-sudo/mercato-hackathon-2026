import type { Rpc } from "../shared/client";
import { ExtensionError } from "../shared/messages";
import type { Folder, ThreadCategory } from "../shared/contracts";
import type { AdapterSnapshot, Dispose, InboxSdkAdapter } from "../gmail/adapter";

export interface FolderControllerState {
  folders: Folder[];
  categoryByThread: Record<string, ThreadCategory>;
  loading: {
    folders: boolean;
    categories: boolean;
  };
  error: string | null;
  snapshot: AdapterSnapshot;
}

export class FolderController {
  private readonly listeners = new Set<() => void>();
  private readonly categoryByThread = new Map<string, ThreadCategory>();
  private readonly pendingThreadIds = new Set<string>();
  private snapshot: AdapterSnapshot;
  private folders: Folder[] = [];
  private loadingFolders = false;
  private loadingCategories = false;
  private error: string | null = null;
  private folderMailbox: string | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly stopAdapter: Dispose;
  private destroyed = false;

  constructor(
    private readonly adapter: InboxSdkAdapter,
    private readonly rpc: Rpc,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {
    this.snapshot = this.adapter.getSnapshot();
    this.stopAdapter = this.adapter.subscribe(() => this.onAdapterChanged());
  }

  start(): void {
    this.onAdapterChanged();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopAdapter();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.listeners.clear();
  }

  subscribe(listener: () => void): Dispose {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): FolderControllerState {
    return {
      folders: this.folders.map((folder) => ({ ...folder })),
      categoryByThread: Object.fromEntries(
        [...this.categoryByThread.entries()].map(([threadId, category]) => [
          threadId,
          { ...category }
        ])
      ),
      loading: {
        folders: this.loadingFolders,
        categories: this.loadingCategories
      },
      error: this.error,
      snapshot: {
        mailboxEmail: this.snapshot.mailboxEmail,
        openThreadId: this.snapshot.openThreadId,
        visibleThreadIds: [...this.snapshot.visibleThreadIds]
      }
    };
  }

  async refresh(): Promise<void> {
    const mailbox = this.snapshot.mailboxEmail;
    if (!mailbox) return;
    await this.loadFolders(mailbox, true);
    this.queueThreadIds(this.relevantThreadIds());
    await this.flushPending();
  }

  async setFolder(gmailThreadId: string, folderId: string | null): Promise<void> {
    const mailbox = this.snapshot.mailboxEmail;
    if (!mailbox) {
      throw new ExtensionError("NO_MAILBOX", "Mailbox email is unavailable.");
    }
    const previous = this.categoryByThread.get(gmailThreadId);
    this.categoryByThread.set(gmailThreadId, {
      gmailThreadId,
      folderId,
      source: "user",
      confidence: 1,
      updatedAt: this.nowIso()
    });
    this.emit();
    try {
      const response = await this.rpc<{ category: ThreadCategory }>({
        kind: "thread.setFolder",
        mailboxEmail: mailbox,
        gmailThreadId,
        folderId
      });
      this.categoryByThread.set(gmailThreadId, response.category);
      this.error = null;
    } catch (error) {
      if (previous) this.categoryByThread.set(gmailThreadId, previous);
      else this.categoryByThread.delete(gmailThreadId);
      this.error = errorMessage(error);
      throw error;
    } finally {
      this.emit();
    }
  }

  async classify(gmailThreadId: string): Promise<void> {
    const mailbox = this.snapshot.mailboxEmail;
    if (!mailbox) {
      throw new ExtensionError("NO_MAILBOX", "Mailbox email is unavailable.");
    }
    this.loadingCategories = true;
    this.emit();
    try {
      const response = await this.rpc<{ category: ThreadCategory }>({
        kind: "thread.classify",
        mailboxEmail: mailbox,
        gmailThreadId
      });
      this.categoryByThread.set(gmailThreadId, response.category);
      this.error = null;
    } catch (error) {
      this.error = errorMessage(error);
      throw error;
    } finally {
      this.loadingCategories = false;
      this.emit();
    }
  }

  private onAdapterChanged(): void {
    if (this.destroyed) return;
    const snapshot = this.adapter.getSnapshot();
    const mailboxChanged = this.snapshot.mailboxEmail !== snapshot.mailboxEmail;
    this.snapshot = snapshot;
    if (mailboxChanged) {
      this.folderMailbox = null;
      this.folders = [];
      this.categoryByThread.clear();
    }
    const mailbox = snapshot.mailboxEmail;
    if (mailbox && mailbox !== this.folderMailbox) {
      void this.loadFolders(mailbox);
    }
    this.queueThreadIds(this.relevantThreadIds());
    this.emit();
  }

  private relevantThreadIds(): string[] {
    const ids = new Set(this.snapshot.visibleThreadIds);
    if (this.snapshot.openThreadId) ids.add(this.snapshot.openThreadId);
    return [...ids];
  }

  private queueThreadIds(gmailThreadIds: string[]): void {
    for (const id of gmailThreadIds) {
      if (this.categoryByThread.has(id)) continue;
      this.pendingThreadIds.add(id);
    }
    if (!this.pendingThreadIds.size || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushPending();
    }, 120);
  }

  private async flushPending(): Promise<void> {
    if (this.destroyed || !this.pendingThreadIds.size) return;
    const mailbox = this.snapshot.mailboxEmail;
    if (!mailbox) return;
    const batch = [...this.pendingThreadIds].slice(0, 50);
    for (const id of batch) this.pendingThreadIds.delete(id);
    this.loadingCategories = true;
    this.emit();
    try {
      const response = await this.rpc<{ categories: ThreadCategory[] }>({
        kind: "threads.categories",
        mailboxEmail: mailbox,
        gmailThreadIds: batch
      });
      for (const category of response.categories) {
        this.categoryByThread.set(category.gmailThreadId, category);
      }
      this.error = null;
    } catch (error) {
      for (const id of batch) this.pendingThreadIds.add(id);
      this.error = errorMessage(error);
    } finally {
      this.loadingCategories = this.pendingThreadIds.size > 0;
      this.emit();
    }
    if (this.pendingThreadIds.size > 0 && !this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flushPending();
      }, 120);
    }
  }

  private async loadFolders(mailboxEmail: string, force = false): Promise<void> {
    if (!force && mailboxEmail === this.folderMailbox) return;
    this.loadingFolders = true;
    this.emit();
    try {
      const response = await this.rpc<{ folders: Folder[] }>({
        kind: "folders.list",
        mailboxEmail
      });
      if (this.snapshot.mailboxEmail !== mailboxEmail) return;
      this.folders = response.folders;
      this.folderMailbox = mailboxEmail;
      this.error = null;
    } catch (error) {
      this.error = errorMessage(error);
    } finally {
      this.loadingFolders = false;
      this.emit();
    }
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown extension error.";
}
