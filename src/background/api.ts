import type { Folder, ThreadCategory } from "../shared/contracts";

export interface ClassifierApi {
  listFolders(mailboxEmail: string): Promise<Folder[]>;
  getCategories(mailboxEmail: string, gmailThreadIds: string[]): Promise<ThreadCategory[]>;
  classifyThread(mailboxEmail: string, gmailThreadId: string): Promise<ThreadCategory>;
  setThreadFolder(mailboxEmail: string, gmailThreadId: string, folderId: string | null): Promise<ThreadCategory>;
}
