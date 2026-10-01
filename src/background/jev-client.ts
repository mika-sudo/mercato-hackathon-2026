import { z } from "zod";
import type { Folder, FolderCounts, ThreadCategory } from "../shared/contracts";
import { DEFAULT_FOLDERS } from "../shared/folders";
import { ExtensionError } from "../shared/messages";
import type { ClassifierApi } from "./api";

const labelCountsSchema = z.object({
  counts: z.record(
    z.string().min(1).max(128),
    z.object({
      label: z.string().min(1).max(225),
      threads: z.number().int().min(0),
      unread_threads: z.number().int().min(0)
    })
  )
});

const triageSchema = z.object({
  labels: z.record(z.string(), z.string().min(1).max(128))
});

const healthSchema = z.object({
  account: z.string().nullable().optional()
});

interface JevClientOptions {
  baseUrl: string;
  apiKey?: string | null;
  fetcher?: typeof fetch;
}

/** Client for the Mercato triage API. The backend triages a single Gmail account. */
export class JevClient implements ClassifierApi {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: JevClientOptions) {
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  }

  /** The API's triage categories that have a box; others (such as `done`) are not shown. */
  async listFolders(mailboxEmail: string): Promise<Folder[]> {
    const [counts, health] = await Promise.all([this.labelCounts(), this.request("/health")]);
    const account = healthSchema.parse(health).account;
    if (account && account.toLowerCase() !== mailboxEmail.toLowerCase()) {
      throw new ExtensionError(
        "MAILBOX_MISMATCH",
        `The Mercato API triages ${account}, but Gmail is signed in as ${mailboxEmail}.`
      );
    }
    return DEFAULT_FOLDERS.flatMap((folder) => {
      const category = counts[folder.id];
      return category ? [{ ...folder, gmailLabel: category.label }] : [];
    });
  }

  async getFolderCounts(_mailboxEmail: string): Promise<FolderCounts> {
    const counts = await this.labelCounts();
    return Object.fromEntries(
      Object.entries(counts).map(([id, count]) => [
        id,
        { threads: count.threads, unread: count.unread_threads }
      ])
    );
  }

  async getCategories(_mailboxEmail: string, gmailThreadIds: string[]): Promise<ThreadCategory[]> {
    const search = new URLSearchParams({ thread_ids: gmailThreadIds.join(",") });
    const { labels } = triageSchema.parse(await this.request(`/triage?${search.toString()}`));
    const updatedAt = new Date().toISOString();
    return gmailThreadIds.map((gmailThreadId) => ({
      gmailThreadId,
      folderId: labels[gmailThreadId] ?? null,
      source: "classifier",
      updatedAt
    }));
  }

  /** Wakes the backend's triage pass; the result shows up once that pass reaches the thread. */
  async classifyThread(mailboxEmail: string, gmailThreadId: string): Promise<ThreadCategory> {
    await this.request("/run", { method: "POST" });
    const [category] = await this.getCategories(mailboxEmail, [gmailThreadId]);
    if (!category) throw new ExtensionError("INVALID_UPSTREAM_RESPONSE", "Triage returned no result.");
    return category;
  }

  async setThreadFolder(): Promise<ThreadCategory> {
    throw new ExtensionError(
      "NOT_SUPPORTED",
      "Filing emails isn't available yet: the Mercato API has no endpoint for it.",
      501
    );
  }

  private async labelCounts() {
    return labelCountsSchema.parse(await this.request("/labels/counts")).counts;
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(init.headers ?? {});
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    if (this.options.apiKey) headers.set("X-API-Key", this.options.apiKey);

    const url = `${this.options.baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await this.fetcher(url, { ...init, headers });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      const detail = typeof json === "object" && json && "detail" in json ? json.detail : null;
      throw new ExtensionError(
        response.status === 401 || response.status === 403 ? "UNAUTHORIZED" : "UPSTREAM_ERROR",
        typeof detail === "string" ? detail : `Request failed with status ${response.status}`,
        response.status
      );
    }
    return json;
  }
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new ExtensionError("INVALID_UPSTREAM_RESPONSE", "The Mercato API returned malformed JSON.");
  }
}
