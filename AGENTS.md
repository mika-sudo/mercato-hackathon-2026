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

## Folders and search

- Each folder is backed by a Gmail label (`Folder.gmailLabel`, defaults in `src/shared/folders.ts`).
  Opening a folder is a Gmail search for `label:"<gmailLabel>"`; the label must exist and be applied
  to threads (by the backend) for results to show.
- `src/content/search-bar.ts` replaces Gmail's header search while Mercato is visible. It shows only
  the user's text; `src/gmail/search.ts` adds/strips the folder label term (`folderSearchQuery`,
  `userSearchText`). Never put the label term in the visible input.
- The active folder is derived from the current Gmail route query, not stored separately, so
  back/forward and reloads stay consistent. Turning Mercato on opens the first folder (P0)
  unless a Mercato folder is already open; turning it off restores Gmail's search and returns to Inbox.
- With an email open, clicking a folder chip files that email (`thread.setFolder`) instead of navigating.

## Current scope

- Plain DOM UI (no React): folder chips in the list toolbar, the search bar, and a bottom-left toggle.
- The shell exposes `window.__mercato` in the content-script context for manual testing:
  - `setFolder(gmailThreadId, folderId | null)`
  - `classify(gmailThreadId)`
  - `getState()`
