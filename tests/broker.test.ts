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
