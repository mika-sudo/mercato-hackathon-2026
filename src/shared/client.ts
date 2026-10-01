import { extensionContextAlive, isInvalidatedContextError, markExtensionContextDead } from "./extension-context";
import { CHANNEL, ExtensionError } from "./messages";
import type { ClientRequest, Reply } from "./messages";

export type Rpc = <T>(request: ClientRequest) => Promise<T>;

export const rpc: Rpc = async <T>(request: ClientRequest): Promise<T> => {
  let reply: Reply<T>;
  try {
    reply = (await chrome.runtime.sendMessage({
      channel: CHANNEL,
      ...request
    })) as Reply<T>;
  } catch (error) {
    if (isInvalidatedContextError(error)) markExtensionContextDead();
    throw new ExtensionError(
      "EXTENSION_UNAVAILABLE",
      "The extension was reloaded or is unavailable. Refresh Gmail and retry."
    );
  }

  if (!reply || typeof reply.ok !== "boolean") {
    throw new ExtensionError("INVALID_RESPONSE", "The background worker returned an invalid response.");
  }
  if (!reply.ok) throw new ExtensionError(reply.error.code, reply.error.message, reply.error.status);
  return reply.data;
};

export function onWorkerChanged(listener: () => void): () => void {
  const handler = (message: unknown, sender: chrome.runtime.MessageSender) => {
    try {
      if (!extensionContextAlive() || sender.id !== chrome.runtime.id) return;
    } catch (error) {
      if (isInvalidatedContextError(error)) markExtensionContextDead();
      return;
    }
    if (sender.tab || !message || typeof message !== "object") return;
    if (
      "channel" in message &&
      message.channel === CHANNEL &&
      "kind" in message &&
      message.kind === "worker.changed"
    ) {
      listener();
    }
  };
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}
