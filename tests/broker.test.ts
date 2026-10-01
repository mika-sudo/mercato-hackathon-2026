import { describe, expect, it, vi } from "vitest";
import { Broker } from "../src/background/broker";
import { JevClient } from "../src/background/jev-client";
import { CHANNEL } from "../src/shared/messages";
import type { ClassifierApi } from "../src/background/api";

function gmailSender(overrides: Partial<chrome.runtime.MessageSender> = {}): chrome.runtime.MessageSender {
  return {
    id: "ext-id",
    frameId: 0,
    url: "https://mail.google.com/mail/u/0/#inbox",
    tab: {
      id: 100,
      url: "https://mail.google.com/mail/u/0/#inbox"
    } as chrome.tabs.Tab,
    ...overrides
  };
}

describe("Broker", () => {
  it("rejects unsupported requests", async () => {
    const api: ClassifierApi = {
      listFolders: vi.fn(),
      getFolderCounts: vi.fn(),
      getCategories: vi.fn(),
      classifyThread: vi.fn(),
      setThreadFolder: vi.fn()
    };
    const broker = new Broker(api, () => 0, "ext-id");
    const reply = await broker.handle(
      {
        channel: CHANNEL,
        kind: "not-real"
      },
      gmailSender()
    );
    expect(reply.ok).toBe(false);
    if (reply.ok) throw new Error("Expected error reply");
    expect(reply.error.code).toBe("INVALID_REQUEST");
  });

  it("caches folders per mailbox with TTL", async () => {
    let now = 0;
    const api: ClassifierApi = {
      listFolders: vi.fn(async () => [
        { id: "shipment", name: "Shipment", parentId: null, order: 1 }
      ]),
      getFolderCounts: vi.fn(),
      getCategories: vi.fn(),
      classifyThread: vi.fn(),
      setThreadFolder: vi.fn()
    };
    const broker = new Broker(api, () => now, "ext-id");
    const request = { channel: CHANNEL, kind: "folders.list", mailboxEmail: "ops@mercato.dev" } as const;

    const first = await broker.handle(request, gmailSender());
    now = 2_000;
    const second = await broker.handle(request, gmailSender());
    now = 400_000;
    const third = await broker.handle(request, gmailSender());

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third.ok).toBe(true);
    expect(api.listFolders).toHaveBeenCalledTimes(2);
  });

  it("rejects requests from non-gmail senders", async () => {
    const api: ClassifierApi = {
      listFolders: vi.fn(),
      getFolderCounts: vi.fn(),
      getCategories: vi.fn(),
      classifyThread: vi.fn(),
      setThreadFolder: vi.fn()
    };
    const broker = new Broker(api, () => 0, "ext-id");
    const reply = await broker.handle(
      { channel: CHANNEL, kind: "folders.list", mailboxEmail: "ops@mercato.dev" },
      gmailSender({ url: "https://example.com" })
    );
    expect(reply.ok).toBe(false);
    if (reply.ok) throw new Error("Expected error reply");
    expect(reply.error.code).toBe("FORBIDDEN_SENDER");
  });
});

describe("JevClient", () => {
  const counts = {
    counts: {
      urgent: { label: "TRIAGE-URGENT", exists: true, threads: 5, unread_threads: 4, messages: 5 },
      junk: { label: "TRIAGE-JUNK", exists: true, threads: 32, unread_threads: 31, messages: 33 },
      done: { label: "TRIAGE-DONE", exists: true, threads: 55, unread_threads: 53, messages: 57 }
    }
  };

  function api(routes: Record<string, unknown>) {
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input));
      const body = routes[url.pathname];
      return body === undefined
        ? new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 })
        : new Response(JSON.stringify(body), { status: 200 });
    });
    const client = new JevClient({
      baseUrl: "https://api.example.com/",
      apiKey: "test-key",
      fetcher: fetcher as unknown as typeof fetch
    });
    return { client, fetcher };
  }

  it("builds folders from the API's triage labels and sends the key header", async () => {
    const { client, fetcher } = api({
      "/labels/counts": counts,
      "/health": { ok: true, account: "Ops@Mercato.dev" }
    });

    const folders = await client.listFolders("ops@mercato.dev");

    expect(folders.map((folder) => [folder.id, folder.gmailLabel])).toEqual([
      ["urgent", "TRIAGE-URGENT"],
      ["junk", "TRIAGE-JUNK"]
    ]);
    const init = fetcher.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("X-API-Key")).toBe("test-key");
  });

  it("refuses a Gmail account the API does not triage", async () => {
    const { client } = api({ "/labels/counts": counts, "/health": { account: "other@mercato.dev" } });
    await expect(client.listFolders("ops@mercato.dev")).rejects.toMatchObject({
      code: "MAILBOX_MISMATCH"
    });
  });

  it("maps triage labels onto threads and marks untriaged ones", async () => {
    const { client, fetcher } = api({ "/triage": { labels: { a1b2c3: "junk" } } });

    const categories = await client.getCategories("ops@mercato.dev", ["a1b2c3", "d4e5f6"]);

    expect(categories.map((category) => [category.gmailThreadId, category.folderId])).toEqual([
      ["a1b2c3", "junk"],
      ["d4e5f6", null]
    ]);
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.get("thread_ids")).toBe(
      "a1b2c3,d4e5f6"
    );
  });

  it("reports mailbox-wide counts per folder", async () => {
    const { client } = api({ "/labels/counts": counts });
    expect((await client.getFolderCounts("ops@mercato.dev")).urgent).toEqual({ threads: 5, unread: 4 });
  });

  it("surfaces the API's error detail", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ detail: "Invalid or missing X-API-Key header" }), { status: 401 })
    );
    const client = new JevClient({
      baseUrl: "https://api.example.com",
      fetcher: fetcher as unknown as typeof fetch
    });
    await expect(client.getFolderCounts("ops@mercato.dev")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid or missing X-API-Key header"
    });
  });

  it("validates response contracts", async () => {
    const fetcher: typeof fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ wrong: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as unknown as typeof fetch;

    const client = new JevClient({
      baseUrl: "https://api.example.com",
      fetcher
    });

    await expect(client.listFolders("ops@mercato.dev")).rejects.toThrow();
  });
});
