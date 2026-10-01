import {
  categoriesResponseSchema,
  classifyResponseSchema,
  foldersResponseSchema,
  setFolderResponseSchema
} from "../shared/contracts";
import { ExtensionError } from "../shared/messages";
import type { Folder, ThreadCategory } from "../shared/contracts";
import type { ClassifierApi } from "./api";

interface JevClientOptions {
  baseUrl: string;
  apiKey?: string | null;
  fetcher?: typeof fetch;
}

export class JevClient implements ClassifierApi {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: JevClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async listFolders(mailboxEmail: string): Promise<Folder[]> {
    const search = new URLSearchParams({ mailbox: mailboxEmail });
    const payload = await this.request(`/folders?${search.toString()}`);
    return foldersResponseSchema.parse(payload).folders;
  }

  async getCategories(mailboxEmail: string, gmailThreadIds: string[]): Promise<ThreadCategory[]> {
    const payload = await this.request("/threads/categories", {
      method: "POST",
      body: JSON.stringify({ mailboxEmail, gmailThreadIds })
    });
    return categoriesResponseSchema.parse(payload).categories;
  }

  async classifyThread(mailboxEmail: string, gmailThreadId: string): Promise<ThreadCategory> {
    const payload = await this.request(`/threads/${gmailThreadId}/classify`, {
      method: "POST",
      body: JSON.stringify({ mailboxEmail })
    });
    return classifyResponseSchema.parse(payload).category;
  }

  async setThreadFolder(
    mailboxEmail: string,
    gmailThreadId: string,
    folderId: string | null
  ): Promise<ThreadCategory> {
    const payload = await this.request(`/threads/${gmailThreadId}/folder`, {
      method: "PUT",
      body: JSON.stringify({ mailboxEmail, folderId })
    });
    return setFolderResponseSchema.parse(payload).category;
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(init.headers ?? {});
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    if (this.options.apiKey) headers.set("Authorization", `Bearer ${this.options.apiKey}`);

    const url = `${this.options.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await this.fetcher(url, { ...init, headers });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      const code = typeof json === "object" && json && "code" in json ? String(json.code) : "UPSTREAM_ERROR";
      const message =
        typeof json === "object" && json && "message" in json
          ? String(json.message)
          : `Request failed with status ${response.status}`;
      throw new ExtensionError(code, message, response.status);
    }
    if (json === null) {
      throw new ExtensionError("INVALID_UPSTREAM_RESPONSE", "The classifier API returned an empty response.");
    }
    return json;
  }
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new ExtensionError("INVALID_UPSTREAM_RESPONSE", "The classifier API returned malformed JSON.");
  }
}
