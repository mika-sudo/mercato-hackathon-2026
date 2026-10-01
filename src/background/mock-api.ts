import type { Folder, FolderCounts, ThreadCategory } from "../shared/contracts";
import { DEFAULT_FOLDERS } from "../shared/folders";
import type { ClassifierApi } from "./api";

const FIXTURE_FOLDERS: Folder[] = DEFAULT_FOLDERS;

export class MockClassifierApi implements ClassifierApi {
  private readonly categoriesByMailbox = new Map<string, Map<string, ThreadCategory>>();

  async listFolders(_mailboxEmail: string): Promise<Folder[]> {
    return FIXTURE_FOLDERS.map((folder) => ({ ...folder }));
  }

  async getFolderCounts(mailboxEmail: string): Promise<FolderCounts> {
    const counts: FolderCounts = {};
    for (const category of this.getMailboxCategories(mailboxEmail).values()) {
      if (!category.folderId) continue;
      const count = (counts[category.folderId] ??= { threads: 0, unread: 0 });
      count.threads += 1;
    }
    return counts;
  }

  async getCategories(mailboxEmail: string, gmailThreadIds: string[]): Promise<ThreadCategory[]> {
    const mailbox = this.getMailboxCategories(mailboxEmail);
    const now = new Date().toISOString();
    const output: ThreadCategory[] = [];
    for (const id of gmailThreadIds) {
      const existing = mailbox.get(id);
      if (existing) {
        output.push({ ...existing });
        continue;
      }
      const next = this.classifyDeterministically(id, now);
      mailbox.set(id, next);
      output.push({ ...next });
    }
    return output;
  }

  async classifyThread(mailboxEmail: string, gmailThreadId: string): Promise<ThreadCategory> {
    const mailbox = this.getMailboxCategories(mailboxEmail);
    const category = this.classifyDeterministically(gmailThreadId, new Date().toISOString());
    mailbox.set(gmailThreadId, category);
    return { ...category };
  }

  async setThreadFolder(
    mailboxEmail: string,
    gmailThreadId: string,
    folderId: string | null
  ): Promise<ThreadCategory> {
    if (folderId !== null && !FIXTURE_FOLDERS.some((folder) => folder.id === folderId)) {
      throw new Error(`Unknown folderId: ${folderId}`);
    }
    const mailbox = this.getMailboxCategories(mailboxEmail);
    const category: ThreadCategory = {
      gmailThreadId,
      folderId,
      source: "user",
      confidence: 1,
      updatedAt: new Date().toISOString()
    };
    mailbox.set(gmailThreadId, category);
    return { ...category };
  }

  private getMailboxCategories(mailboxEmail: string): Map<string, ThreadCategory> {
    let mailbox = this.categoriesByMailbox.get(mailboxEmail);
    if (!mailbox) {
      mailbox = new Map<string, ThreadCategory>();
      this.categoriesByMailbox.set(mailboxEmail, mailbox);
    }
    return mailbox;
  }

  private classifyDeterministically(gmailThreadId: string, updatedAt: string): ThreadCategory {
    const score = [...gmailThreadId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const folders = FIXTURE_FOLDERS;
    const folder = folders[score % folders.length];
    const confidence = Number((0.55 + ((score % 40) / 100)).toFixed(2));
    return {
      gmailThreadId,
      folderId: folder?.id ?? null,
      source: "classifier",
      confidence,
      updatedAt
    };
  }
}
