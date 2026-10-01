/** Chrome destroys a content-script world when the extension reloads. Later API calls throw. */

let dead = false;
const listeners = new Set<() => void>();

export function isInvalidatedContextError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Extension context invalidated");
}

export function extensionContextAlive(): boolean {
  return !dead;
}

export function markExtensionContextDead(): void {
  if (dead) return;
  dead = true;
  queueMicrotask(() => {
    for (const listener of [...listeners]) listener();
  });
}

export function onExtensionContextDead(listener: () => void): () => void {
  listeners.add(listener);
  if (dead) queueMicrotask(listener);
  return () => listeners.delete(listener);
}

/** Icon and page URLs. Returns null once the content world can no longer call Chrome. */
export function extensionAsset(path: string): string | null {
  if (dead || typeof chrome === "undefined" || !chrome.runtime?.getURL) return null;
  try {
    if (!chrome.runtime.id) {
      markExtensionContextDead();
      return null;
    }
    return chrome.runtime.getURL(path);
  } catch (error) {
    if (!isInvalidatedContextError(error)) throw error;
    markExtensionContextDead();
    return null;
  }
}

export function resetExtensionContextForTests(): void {
  dead = false;
  listeners.clear();
}
