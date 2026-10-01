# Mercato Gmail extension shell — agent notes

## Runtime shape

- `src/content/index.ts` loads InboxSDK in Gmail, starts `InboxSdkAdapter`, and runs `FolderController`.
- `FolderController` sends typed RPC requests from `src/shared/messages.ts` through `src/shared/client.ts`.
- `src/background/index.ts` receives requests and routes them through `Broker`.
- `Broker` uses either:
  - `JevClient` for remote HTTPS API calls (`VITE_API_BASE_URL` set), or
  - `MockClassifierApi` for local shell behavior (`VITE_API_BASE_URL` empty).

## Invariants

- Gmail identity only comes from InboxSDK ids (`getThreadIDAsync`), validated by `gmailApiId`.
- Keep Gmail DOM and InboxSDK usage inside `src/gmail/adapter.ts`; no other module should inspect Gmail DOM.
- Use one RPC channel (`mercato.gmail.v1`) and validate every request with zod.
- Folder taxonomy is API-driven (`folders.list`), not hardcoded in UI flows.

## Current scope

- No UI yet (no React components, no side panel).
- The shell exposes `window.__mercato` in the content-script context for manual testing:
  - `setFolder(gmailThreadId, folderId | null)`
  - `classify(gmailThreadId)`
  - `getState()`
