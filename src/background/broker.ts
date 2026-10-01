import type { Folder, ThreadCategory } from "../shared/contracts";
import { ExtensionError, isGmailUrl, publicError, requestSchema } from "../shared/messages";
import type { Reply, Request } from "../shared/messages";
import type { ClassifierApi } from "./api";

const FOLDER_TTL_MS = 5 * 60_000;

export class Broker {
  private readonly folderCache = new Map<string, { fetchedAt: number; folders: Folder[] }>();

  constructor(
    private readonly api: ClassifierApi,
    private readonly now: () => number = Date.now,
    private readonly extensionId: string = chrome.runtime.id
  ) {}

  isContentSender(sender: chrome.runtime.MessageSender): boolean {
    return (
      sender.id === this.extensionId &&
      (sender.frameId === 0 || sender.frameId === undefined) &&
      typeof sender.tab?.id === "number" &&
      isGmailUrl(sender.url) &&
      isGmailUrl(sender.tab.url)
    );
  }

  async handle(raw: unknown, sender: chrome.runtime.MessageSender): Promise<Reply<unknown>> {
    try {
      if (!this.isContentSender(sender)) {
        throw new ExtensionError(
          "FORBIDDEN_SENDER",
          "Only the Gmail top frame may make requests to this extension worker."
        );
      }
      const parsed = requestSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ExtensionError("INVALID_REQUEST", "Unsupported extension request.");
      }
      const data = await this.dispatch(parsed.data);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  }

  private async dispatch(request: Request): Promise<DispatchReply> {
    switch (request.kind) {
      case "folders.list":
        return { folders: await this.readFolders(request.mailboxEmail) };
      case "threads.categories":
        return {
          categories: await this.api.getCategories(request.mailboxEmail, request.gmailThreadIds)
        };
      case "thread.classify":
        return {
          category: await this.api.classifyThread(request.mailboxEmail, request.gmailThreadId)
        };
      case "thread.setFolder":
        return {
          category: await this.api.setThreadFolder(
            request.mailboxEmail,
            request.gmailThreadId,
            request.folderId
          )
        };
    }
  }

  private async readFolders(mailboxEmail: string): Promise<Folder[]> {
    const cached = this.folderCache.get(mailboxEmail);
    if (cached && this.now() - cached.fetchedAt <= FOLDER_TTL_MS) {
      return cached.folders.map((folder) => ({ ...folder }));
    }
    const folders = await this.api.listFolders(mailboxEmail);
    this.folderCache.set(mailboxEmail, {
      fetchedAt: this.now(),
      folders: folders.map((folder) => ({ ...folder }))
    });
    return folders;
  }
}

interface DispatchReplyMap {
  "folders.list": { folders: Folder[] };
  "threads.categories": { categories: ThreadCategory[] };
  "thread.classify": { category: ThreadCategory };
  "thread.setFolder": { category: ThreadCategory };
}

type DispatchReply = DispatchReplyMap[Request["kind"]];
