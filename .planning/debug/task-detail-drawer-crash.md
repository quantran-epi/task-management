---
status: resolved
trigger: "it crash when  i open a task detail, click on task name to open detail drawer, app crash, blank screen. running on npm run tauri:dev"
created: 2026-09-30
updated: 2026-09-30
---

## Current Focus
hypothesis: TagSelect component invokes getDistinctOpsOwners / getDistinctBusinessAnalysts which calls Dexie `.orderBy().uniqueKeys()` (`nextunique` cursor). In WebKit/macOS WKWebView (Tauri runtime), opening a `nextunique` cursor over an empty multi-entry index triggers WebKit bug #319640 throwing `UnknownError: Unable to open cursor`.
test: Add try/catch fallback in `tagRepo.ts` to query entities directly when unique cursor fails, and test via mock in `repos.test.ts`.
expecting: Fallback executes safely without crashing TagSelect, allowing TaskDrawer to open.
next_action: complete

## Symptoms
- expected: Task detail drawer opens with task details and editable fields
- actual: Blank screen, app crash
- error: `[Error] UnknownError: Unable to open cursor` occurring inside `<TagSelect>` component
- timeline: Started when opening task detail in Tauri dev mode
- reproduction: In `npm run tauri:dev`, click on a task name to open the detail drawer

## Evidence
- timestamp: 2026-09-30
  finding: Console error log shows `[Error] UnknownError: Unable to open cursor` and `[Warning] An error occurred in the <TagSelect> component.`
- timestamp: 2026-09-30
  finding: TagSelect calls `useLiveQuery` on `getDistinctOpsOwners` and `getDistinctBusinessAnalysts` in `src/db/repositories/tagRepo.ts`.
- timestamp: 2026-09-30
  finding: `tagRepo.ts` calls `db.*.orderBy('opsOwners').uniqueKeys()`, which dexie translates to IDB index cursor with direction `'nextunique'`.
- timestamp: 2026-09-30
  finding: Known WebKit bug #319640 ("[IndexedDB] Opening a 'nextunique'/'prevunique' cursor over an empty key range fails with an UnknownError"). In macOS WKWebView used by Tauri, if no records match or the index is empty, SQLiteIDBCursor::fetch() fails with UnknownError: Unable to open cursor.

## Resolution
root_cause: In WebKit/Safari (Tauri on macOS), opening a `nextunique` cursor via Dexie's `.orderBy().uniqueKeys()` over an empty multi-entry index throws `UnknownError: Unable to open cursor` due to WebKit bug #319640. `TagSelect` calls this inside `useLiveQuery`, causing an unhandled promise rejection that crashes the React render tree.
fix: Wrapped `getDistinctOpsOwners` and `getDistinctBusinessAnalysts` in `src/db/repositories/tagRepo.ts` with a try/catch block that catches cursor errors and falls back to in-memory tag extraction from records.
