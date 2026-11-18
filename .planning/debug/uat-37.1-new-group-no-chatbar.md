---
status: diagnosed
trigger: "uat-37.1-new-group-no-chatbar"
created: 2026-11-12T00:00:00Z
updated: 2026-11-12T17:40:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — React StrictMode double-invokes TeamWorkspace's bootstrap effect; both mounts race on `createOrGetThread`'s non-atomic read-then-add against the `&scopeKey` unique index. Mount 1 wins the insert but its `cancelled` flag is already true, so it discards the thread. Mount 2 loses with `ConstraintError` and its rejection is swallowed by `void (async () => ...)()`, so `setCoordinator` never runs and `coordinator` stays `null` forever → gate at TeamWorkspace.tsx:773 renders "Đang chuẩn bị nhóm..." with no composer.
test: DONE — reproduced 5/5 deterministically with real repo code; StrictMode jsdom probe test stayed PREPARING.
expecting: n/a (confirmed)
next_action: Report root cause. No fix applied (goal: find_root_cause_only).

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Opening a newly created group shows the chat transcript and the input bar immediately.
actual: "khi taọ nhóm, mở lần đầu, chat hiện đang chuẩn bị nhóm, không có thanh chat, phải tắt đi mở lại mới được."
errors: None reported.
reproduction: Test 4 in .planning/phases/37.1-live-steering-leader-amends-assignments-and-steers-running-a/37.1-UAT.md — create a new group, open it for the first time.
started: Discovered during UAT of phase 37.1.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: Missing API key / endpoint config makes `configError` render instead of the composer
  evidence: A config failure renders the NO_MODEL_COPY alert branch (TeamWorkspace.tsx:769-772), not "Đang chuẩn bị nhóm...". User reported the preparing text, and the second open works with identical config.
  timestamp: 2026-11-12T17:20:00Z

- hypothesis: `getOrCreateRun` returns a stale/disposed coordinator on first open
  evidence: teamRunManager.ts:36 returns early only when `existing.threadId === threadId`; a brand-new team has no registry entry at all, so the manager cannot be the blocker on first open.
  timestamp: 2026-11-12T17:22:00Z

- hypothesis: `ensureTeamThread` throws "Không tìm thấy nhóm" because the team row is not yet committed when the workspace mounts
  evidence: TeamsView/AiOfficeExplorer open the workspace only from a live-query row that already exists (TeamsView.tsx:72, AiOfficeExplorer.tsx:79). Also the failure is deterministic on FIRST open only, and a missing team row would fail on every open.
  timestamp: 2026-11-12T17:24:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-12T17:10:00Z
  checked: grep for "Đang chuẩn bị nhóm" across src/
  found: Exactly one site — src/components/ai/office/TeamWorkspace.tsx:777, inside the `: !coordinator ?` branch of the transcript region (lines 773-779).
  implication: The gate is purely `coordinator === null`. ChatInputBar lives inside AiChatWidget, which is not rendered at all in that branch — that is why no chat bar appears.

- timestamp: 2026-11-12T17:12:00Z
  checked: TeamWorkspace bootstrap effect (lines 217-332)
  found: Effect sets `setThreadId(null); setCoordinator(null);` then awaits `ensureTeamThread(team.id, db)` (line 224), then API key/config, then `getOrCreateRun(...)` (line 240), then `setCoordinator(created)` (line 324) guarded by `if (cancelled) return;`. The async IIFE is invoked with `void (async () => {...})()` — no `.catch()`.
  implication: Any rejection inside the IIFE is an unhandled rejection: `coordinator` stays null and the UI is permanently stuck on the preparing gate. There is no error surface for this path.

- timestamp: 2026-11-12T17:14:00Z
  checked: src/main.tsx:45-47
  found: The app renders inside `<React.StrictMode>`.
  implication: In dev, React double-invokes effects: mount 1 runs, cleanup sets `cancelled = true` for mount 1, then mount 2 runs the effect body again. Both async IIFEs are in flight concurrently.

- timestamp: 2026-11-12T17:16:00Z
  checked: src/db/repositories/chatRepo.ts:53-76 (`createOrGetThread`) and src/db/schema.ts:64
  found: `createOrGetThread` does `where('scopeKey').equals(scopeKey).first()` and, if absent, `db.chatThreads.add(thread)` — two separate awaits, not one transaction. Schema declares `chatThreads: 'id, &scopeKey, ...'` (unique index).
  implication: Two concurrent first-time callers both see "absent" and both attempt the add. The second add violates the unique index and throws `ConstraintError`.

- timestamp: 2026-11-12T17:30:00Z
  checked: Standalone repro with real repo code (`createOrGetThread` + `TaskPlannerDatabase`, fake-indexeddb), simulating StrictMode's cancelled-first-mount ordering
  found: Run 5/5 identically — `mount1: cancelled before setCoordinator`, `mount2 THREW: ConstraintError`, `threads in db: 1`.
  implication: The losing mount is always the LIVE one (mount 2). The winner (mount 1) discards its result because its cleanup already ran. Net effect: no coordinator is ever set on first open.

- timestamp: 2026-11-12T17:34:00Z
  checked: jsdom probe test rendering a StrictMode-wrapped component that runs the same effect shape and reports READY/PREPARING
  found: Test passed asserting the component stays `PREPARING`; vitest also surfaced the `ConstraintError` as an unhandled rejection from the probe's async IIFE.
  implication: Confirms the React-level mechanism end-to-end, and confirms the rejection escapes unhandled (matching "errors: None reported" — nothing surfaces to the user).

- timestamp: 2026-11-12T17:38:00Z
  checked: Candidate fix — same read-then-add wrapped in one `db.transaction('rw', db.chatThreads, ...)`
  found: 3 concurrent callers all resolved to the SAME thread id, 1 row in db, zero throws.
  implication: Serializing the read+add on the store closes the race and is the minimal correct fix at the repository boundary.

- timestamp: 2026-11-12T17:39:00Z
  checked: Running processes and dist/
  found: `npm run tauri:dev` → `tauri dev` → vite dev server active (PIDs 63453/63468/63648); dist/ exists but UAT ran against the dev server.
  implication: UAT ran in dev mode, so StrictMode double-invoke is active. Explains why the bug reproduces for the user but a production build would not.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  `createOrGetThread` (src/db/repositories/chatRepo.ts:53-76) is a non-atomic read-then-add against the
  unique `&scopeKey` index on `chatThreads`. TeamWorkspace's bootstrap effect (TeamWorkspace.tsx:217-332)
  calls it through `ensureTeamThread` (teamTranscriptRepo.ts:53-60). Because the app runs under
  React.StrictMode (src/main.tsx:45), the effect body runs twice concurrently on first mount. Both mounts
  observe "no thread", both call `chatThreads.add`; the second throws `ConstraintError`. The losing mount is
  the live one (mount 2) — mount 1's cleanup already set its `cancelled` flag, so mount 1 discards the thread
  it successfully inserted. Mount 2's rejection escapes the `void (async () => ...)()` IIFE unhandled, so
  `setCoordinator` (line 324) never executes. `coordinator` therefore stays `null` and the render gate at
  TeamWorkspace.tsx:773 paints "Đang chuẩn bị nhóm..." with no AiChatWidget — hence no chat input bar.
  Closing and reopening the group works because the thread row now exists, so the second open's
  `createOrGetThread` takes the `existing` early-return path and never inserts.
fix: (not applied — goal: find_root_cause_only)
verification: Reproduced 5/5 deterministically with real repo code; StrictMode jsdom probe stayed PREPARING; atomic-transaction candidate resolved 3/3 concurrent callers to one thread.
files_changed: []
