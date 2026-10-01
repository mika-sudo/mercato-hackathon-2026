export interface Configuration {
  apiBaseUrl: string | null;
  apiKey: string | null;
  inboxSdkAppId: string | null;
  useMock: boolean;
  issues: string[];
  ready: boolean;
}

export function configurationFrom(env: Record<string, unknown>): Configuration {
  const issues: string[] = [];
  const rawApi = String(env.VITE_API_BASE_URL ?? "").trim();
  let apiBaseUrl: string | null = null;
  let useMock = false;

  if (!rawApi) {
    useMock = true;
  } else {
    try {
      const url = new URL(rawApi);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        /[\\\s]/.test(rawApi)
      ) {
        throw new Error("Invalid API URL.");
      }
      apiBaseUrl = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
    } catch {
      issues.push("Set VITE_API_BASE_URL to a valid HTTPS API origin and optional path.");
    }
  }

  const apiKey = String(env.VITE_API_KEY ?? "").trim() || null;
  const sdk = String(env.VITE_INBOXSDK_APP_ID ?? "").trim();
  const inboxSdkAppId = /^sdk_[a-zA-Z0-9_-]{5,15}_[0-9a-f]{10}$/.test(sdk) ? sdk : null;
  if (!inboxSdkAppId) {
    issues.push("Set VITE_INBOXSDK_APP_ID to your InboxSDK application id, then rebuild.");
  }

  return {
    apiBaseUrl,
    apiKey,
    inboxSdkAppId,
    useMock,
    issues,
    ready: issues.length === 0
  };
}

export const configuration = configurationFrom({
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_API_KEY: import.meta.env.VITE_API_KEY,
  VITE_INBOXSDK_APP_ID: import.meta.env.VITE_INBOXSDK_APP_ID
});
