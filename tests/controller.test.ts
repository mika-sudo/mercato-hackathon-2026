import { describe, expect, it, vi } from "vitest";
import { FolderController } from "../src/content/controller";
import type { AdapterSnapshot } from "../src/gmail/adapter";
import type { ClientRequest } from "../src/shared/messages";
import type { Folder, ThreadCategory } from "../src/shared/contracts";
import type { Rpc } from "../src/shared/client";

class FakeAdapter {
  private readonly listeners = new Set<() => void>();

  constructor(private snapshot: AdapterSnapshot) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): AdapterSnapshot {
    return {
      mailboxEmail: this.snapshot.mailboxEmail,
      openThreadId: this.snapshot.openThreadId,
      visibleThreadIds: [...this.snapshot.visibleThreadIds]
    };
  }

  setSnapshot(next: AdapterSnapshot): void {
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("FolderController", () => {
  it("optimistically sets folder and rolls back on error", async () => {
    const adapter = new FakeAdapter({
      mailboxEmail: "ops@mercato.dev",
      openThreadId: null,
      visibleThreadIds: []
    });
    const folder: Folder = { id: "shipment", name: "Shipment", parentId: null, order: 1 };
    const rpcImpl: Rpc = async <T>(request: ClientRequest): Promise<T> => {
      switch (request.kind) {
        case "folders.list":
          return { folders: [folder] } as T;
        case "folders.counts":
          return { counts: {} } as T;
        case "thread.setFolder":
          throw new Error("set failed");
        default:
          return { categories: [] } as T;
      }
    };
    const rpc = vi.fn(rpcImpl) as unknown as Rpc;

    const controller = new FolderController(adapter as never, rpc);
    controller.start();
    await flush();

    const pending = controller.setFolder("a1b2c3", "shipment");
    const optimistic = controller.getState().categoryByThread.a1b2c3;
    expect(optimistic?.folderId).toBe("shipment");

    await expect(pending).rejects.toThrow("set failed");
    expect(controller.getState().categoryByThread.a1b2c3).toBeUndefined();
    controller.destroy();
  });

  it("updates state after successful classify", async () => {
    const adapter = new FakeAdapter({
      mailboxEmail: "ops@mercato.dev",
      openThreadId: null,
      visibleThreadIds: []
    });
    const category: ThreadCategory = {
      gmailThreadId: "a1b2c3",
      folderId: "shipment",
      source: "classifier",
      confidence: 0.85,
      updatedAt: new Date().toISOString()
    };

    const rpcImpl: Rpc = async <T>(request: ClientRequest): Promise<T> => {
      switch (request.kind) {
        case "folders.list":
          return { folders: [] } as T;
        case "folders.counts":
          return { counts: {} } as T;
        case "thread.classify":
          return { category } as T;
        default:
          return { categories: [] } as T;
      }
    };
    const rpc = vi.fn(rpcImpl) as unknown as Rpc;

    const controller = new FolderController(adapter as never, rpc);
    controller.start();
    await flush();
    await controller.classify("a1b2c3");

    expect(controller.getState().categoryByThread.a1b2c3?.folderId).toBe("shipment");
    controller.destroy();
  });
});
