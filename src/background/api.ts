import type { Folder, FolderCounts, ThreadCategory } from "../shared/contracts";

export interface ClassifierApi {
  listFolders(mailboxEmail: string): Promise<Folder[]>;
  getFolderCounts(mailboxEmail: string): Promise<FolderCounts>;
  getCategories(mailboxEmail: string, gmailThreadIds: string[]): Promise<ThreadCategory[]>;
  classifyThread(mailboxEmail: string, gmailThreadId: string): Promise<ThreadCategory>;
  setThreadFolder(mailboxEmail: string, gmailThreadId: string, folderId: string | null): Promise<ThreadCategory>;
}
