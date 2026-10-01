import * as InboxSDK from "@inboxsdk/core";
import { InboxSdkAdapter } from "../gmail/adapter";
import { onWorkerChanged, rpc } from "../shared/client";
import { configuration } from "../shared/config";
import {
  isInvalidatedContextError,
  markExtensionContextDead,
  onExtensionContextDead
} from "../shared/extension-context";
import { FolderController } from "./controller";

declare global {
  interface Window {
    __mercato?: {
      setFolder: (gmailThreadId: string, folderId: string | null) => Promise<void>;
      classify: (gmailThreadId: string) => Promise<void>;
      getState: () => ReturnType<FolderController["getState"]> | null;
    };
  }
}

const cleanupKey = Symbol.for("mercato.gmail.cleanup");
const scope = globalThis as typeof globalThis & { [cleanupKey]?: () => void };
scope[cleanupKey]?.();

let disposed = false;
let adapter: InboxSdkAdapter | undefined;
let controller: FolderController | undefined;
let stopWorker: (() => void) | undefined;

function cleanup(): void {
  if (disposed) return;
  disposed = true;
  stopWorker?.();
  stopWorker = undefined;
  controller?.destroy();
  controller = undefined;
  adapter?.destroy();
  adapter = undefined;
  delete window.__mercato;
  window.removeEventListener("pagehide", cleanup);
  delete scope[cleanupKey];
}

scope[cleanupKey] = cleanup;
window.addEventListener("pagehide", cleanup);
onExtensionContextDead(() => cleanup());

if (window.top === window) {
  void start().catch((error: unknown) => {
    if (isInvalidatedContextError(error)) markExtensionContextDead();
    cleanup();
  });
}

async function start(): Promise<void> {
  if (!configuration.inboxSdkAppId) return;
  const sdk = await InboxSDK.load(2, configuration.inboxSdkAppId, {
    appName: "Mercato",
    globalErrorLogging: false,
    eventTracking: false
  });
  if (disposed) {
    sdk.destroy();
    return;
  }

  adapter = new InboxSdkAdapter(sdk);
  controller = new FolderController(adapter, rpc);
  adapter.start();
  controller.start();
  stopWorker = onWorkerChanged(() => {
    void controller?.refresh();
  });

  const debug = isDebugEnabled();
  if (debug) {
    controller.subscribe(() => {
      console.debug("[mercato]", controller?.getState());
    });
  }

  window.__mercato = {
    setFolder: async (gmailThreadId, folderId) => {
      await controller?.setFolder(gmailThreadId, folderId);
    },
    classify: async (gmailThreadId) => {
      await controller?.classify(gmailThreadId);
    },
    getState: () => controller?.getState() ?? null
  };
}

function isDebugEnabled(): boolean {
  try {
    return window.localStorage.getItem("mercato-debug") === "1";
  } catch {
    return false;
  }
}
