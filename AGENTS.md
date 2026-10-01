# Mercato Gmail extension shell — agent notes

## Runtime shape

- `src/content/index.ts` loads InboxSDK in Gmail, starts `InboxSdkAdapter`, and runs `FolderController`.
- `FolderController` sends typed RPC requests from `src/shared/messages.ts` through `src/shared/client.ts`.
- `src/background/index.ts` receives requests and routes them through `Broker`.
- `Broker` uses either:
  - `JevClient` for the Mercato triage API (`VITE_API_BASE_URL` set), or
  - `MockClassifierApi` for local shell behavior (`VITE_API_BASE_URL` empty).
- The Mercato API (FastAPI, schema at `/openapi.json`) authenticates with the `X-API-Key` header and
  triages one Gmail account (`/health` reports it). `JevClient` maps it as follows:
  - `folders.list`: `/labels/counts` categories that have a box in `DEFAULT_FOLDERS`, with their Gmail labels.
    It errors when the signed-in Gmail account isn't the one the API triages.
  - `folders.counts`: `/labels/counts`, mailbox-wide thread and unread counts. The controller refreshes them every minute.
  - `threads.categories`: `GET /triage?thread_ids=…`. Untriaged threads get `folderId: null` and are re-asked on refresh.
  - `thread.classify`: `POST /run`, then `/triage` for that thread.
  - `thread.setFolder`: no API endpoint yet, so it fails with `NOT_SUPPORTED`.

## Invariants

- Gmail identity only comes from InboxSDK ids (`getThreadIDAsync`), validated by `gmailApiId`.
- Keep Gmail DOM and InboxSDK usage inside `src/gmail/adapter.ts`; no other module should inspect Gmail DOM.
- Use one RPC channel (`mercato.gmail.v1`) and validate every request with zod.
- Folder taxonomy is API-driven (`folders.list`), not hardcoded in UI flows.

## Folders and search

- Each folder is backed by a Gmail label (`Folder.gmailLabel`, defaults in `src/shared/folders.ts`).
  Folder ids are the classifier's triage labels (`urgent`, `important`, `unimportant`, `junk`), and the
  backend applies the matching `TRIAGE-*` Gmail labels. Opening a folder is a Gmail search for
  `label:"<gmailLabel>"`. The API's `done` category has no box.
- `src/content/search-bar.ts` replaces Gmail's header search while Mercato is visible. It shows only
  the user's text; `src/gmail/search.ts` adds/strips the folder label term (`folderSearchQuery`,
  `userSearchText`). Never put the label term in the visible input.
- The active folder is derived from the current Gmail route query, not stored separately, so
  back/forward and reloads stay consistent. Turning Mercato on opens the first folder (P0)
  unless a Mercato folder is already open; turning it off restores Gmail's search and returns to Inbox.
- With an email open, clicking a folder chip files that email (`thread.setFolder`) instead of navigating.
- Turning Mercato on from a non-Mercato list flies copies of the on-screen rows into their chips
  (`src/content/sweep-animation.ts`) before opening P0. It is skipped under reduced motion or
  with an email open. Originals stay hidden until Gmail replaces the list (max 3s).
- `InboxSdkAdapter` tracks rows and the open thread through their InboxSDK `destroy` events only.
  Route changes also fire on window focus, so they must not clear that state.

## Current scope

- Plain DOM UI (no React): folder chips in the list toolbar, the search bar, and a bottom-left toggle.
- The shell exposes `window.__mercato` in the content-script context for manual testing:
  - `setFolder(gmailThreadId, folderId | null)`
  - `classify(gmailThreadId)`
  - `getState()`
