import * as InboxSDK from "@inboxsdk/core";
import { InboxSdkAdapter } from "../gmail/adapter";
import { onWorkerChanged, rpc } from "../shared/client";
import { configuration } from "../shared/config";
import { DEFAULT_FOLDERS } from "../shared/folders";
import {
  isInvalidatedContextError,
  markExtensionContextDead,
  onExtensionContextDead
} from "../shared/extension-context";
import { FolderController } from "./controller";
import { FolderShellView } from "./folder-shell";
import type { FolderShellController } from "./folder-shell";
import type { FolderControllerState } from "./controller";

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
let folderShell: FolderShellView | undefined;
let stopWorker: (() => void) | undefined;
let stopRender: (() => void) | undefined;

function cleanup(): void {
  if (disposed) return;
  disposed = true;
  stopWorker?.();
  stopWorker = undefined;
  stopRender?.();
  stopRender = undefined;
  folderShell?.destroy();
  folderShell = undefined;
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
  if (!configuration.inboxSdkAppId) {
    mountStaticShell("Set VITE_INBOXSDK_APP_ID and rebuild to enable Gmail thread integration.");
    return;
  }
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
  folderShell = new FolderShellView(controller, adapter);
  adapter.start();
  controller.start();
  folderShell.mount();
  stopRender = controller.subscribe(() => {
    folderShell?.render(controller!.getState());
  });
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

function mountStaticShell(message: string): void {
  const state: FolderControllerState = {
    folders: DEFAULT_FOLDERS,
    folderCounts: null,
    categoryByThread: {},
    loading: { folders: false, categories: false },
    error: message,
    snapshot: {
      mailboxEmail: null,
      openThreadId: null,
      visibleThreadIds: []
    }
  };
  const shellController: FolderShellController = {
    getState: () => state,
    setFolder: async () => undefined
  };
  folderShell = new FolderShellView(shellController, null);
  folderShell.mount();
}

function isDebugEnabled(): boolean {
  try {
    return window.localStorage.getItem("mercato-debug") === "1";
  } catch {
    return false;
  }
}
