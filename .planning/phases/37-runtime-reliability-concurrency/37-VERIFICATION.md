---
phase: 37-runtime-reliability-concurrency
verified: 2026-11-12T00:06:27Z
status: human_needed
score: 15/16 must-haves verified
covered_files: [".planning/phases/37-runtime-reliability-concurrency/37-01-PLAN.md", ".planning/phases/37-runtime-reliability-concurrency/37-01-SUMMARY.md", ".planning/phases/37-runtime-reliability-concurrency/37-02-PLAN.md", ".planning/phases/37-runtime-reliability-concurrency/37-02-SUMMARY.md", ".planning/phases/37-runtime-reliability-concurrency/37-03-PLAN.md", ".planning/phases/37-runtime-reliability-concurrency/37-03-SUMMARY.md", ".planning/phases/37-runtime-reliability-concurrency/37-04-PLAN.md", ".planning/phases/37-runtime-reliability-concurrency/37-04-SUMMARY.md", ".planning/phases/37-runtime-reliability-concurrency/37-05-PLAN.md", ".planning/phases/37-runtime-reliability-concurrency/37-05-SUMMARY.md", ".planning/phases/37-runtime-reliability-concurrency/37-06-PLAN.md", ".planning/phases/37-runtime-reliability-concurrency/37-06-SUMMARY.md", ".planning/phases/37-runtime-reliability-concurrency/37-07-PLAN.md", ".planning/phases/37-runtime-reliability-concurrency/37-07-SUMMARY.md", ".planning/phases/37-runtime-reliability-concurrency/37-08-PLAN.md", ".planning/phases/37-runtime-reliability-concurrency/37-08-SUMMARY.md", "src-tauri/src/sqlite_persistence.rs", "src/components/ai/AiChatWidget.tsx", "src/components/ai/ChatMessageBubble.tsx", "src/components/ai/ChatMessageList.tsx", "src/components/ai/office/AgentAttributionRow.tsx", "src/components/ai/office/TeamSettingsDrawer.tsx", "src/components/ai/office/TeamWorkspace.tsx", "src/components/shell/AppShell.tsx", "src/db/index.ts", "src/db/repositories/aiTeamRepo.ts", "src/db/repositories/aiTeamRunRepo.ts", "src/db/repositories/teamTranscriptRepo.ts", "src/db/schema.ts", "src/hooks/useTeamRunTeardown.ts", "src/services/ai/office/scheduler.ts", "src/services/ai/office/teamRunCoordinator.ts", "src/services/ai/office/teamRunManager.ts", "src/services/backup/exportBackup.ts", "src/services/backup/restoreBackup.ts", "src/services/backup/validateBackup.ts", "src/services/localSqlitePersistence.ts", "src/types/aiOffice.ts", "src/types/backup.ts", "src/types/models.ts", "src/validation/aiOfficeSchemas.ts", "src/validation/backupSchemas.ts", "src/workbench/toolwindows/AiOfficeExplorer.tsx", "tests/components/ai/office/TeamWorkspaceOutbox.test.tsx", "tests/components/ai/office/TeamWorkspaceWhitespaceSubmit.test.tsx", "tests/services/ai/office/disposeMidRunDelete.test.ts", "tests/services/ai/office/teamRunCoordinator.test.ts"]
covered_digest: "v4:sha256:e4ec6e8fc7e3c0461cbe8c6d8ac363b87b3b2aefc0b22450b2f667b4e8b37d98"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 13/16
  gaps_closed:
    - "Roadmap SC5 / 37-06 must-have: deleting a team mid-run drains every turn and writes nothing after the delete (disposeMidRunDelete.test.ts, mutation-proved)"
    - "Non-inferable backstop: a whitespace-only submit is ignored and never becomes an outbox entry (TeamWorkspaceWhitespaceSubmit.test.tsx, mutation-proved)"
    - "Non-inferable backstop: a retry whose agent has left the roster refuses and writes no attempt row (teamRunCoordinator.test.ts:2809, mutation-proved)"
  gaps_remaining:
    - "Non-inferable backstop: the phase observed in a real Tauri window (not assertable in this environment)"
  regressions: []
unverified_non_inferable:
  - check: "The phase observed in a real Tauri window (D-27/C-15, 37-08 task 2)."
    evidence: "Not performed — no model provider and no built binary in this environment (WINDOWS.md #10). The six observations remain in Human Verification below."
human_verification:
  - test: "Observed Tauri walkthrough, observation 1 — limited batch"
    expected: "With the team limit set to 2 and five delegated assignments, at most two agent bubbles read \"Đang làm việc\" at any moment, the rest read \"Đang xếp hàng\", and all five reach a terminal state."
    why_human: "D-27/C-15 require observed runtime behaviour; 37-08 task 2 could not run in the executor's headless environment (WINDOWS.md #10)."
  - test: "Observed Tauri walkthrough, observation 2 — outbox"
    expected: "A second submit made during the batch appears in the outbox above the composer, the composer stays usable, and the message dispatches automatically after the first turn settles."
    why_human: "Same — visual/queueing behaviour, not assertable from this environment."
  - test: "Observed Tauri walkthrough, observation 3 — stop a queued agent"
    expected: "The stopped agent never runs and shows \"Chưa hoàn tất\"; the remaining agents still complete."
    why_human: "Same."
  - test: "Observed Tauri walkthrough, observation 4 — global Stop"
    expected: "Every agent stops, the queue clears, the composer returns to normal, and the active-turn indicator clears."
    why_human: "Same; the indicator is the `ActiveAiTurnIndicator` surface, which is not component-tested."
  - test: "Observed Tauri walkthrough, observation 5 — retry"
    expected: "Clicking \"Chạy lại\" re-runs only that agent, its new report replaces the old one on screen, and a new leader synthesis names the unfinished work."
    why_human: "Same."
  - test: "Observed Tauri walkthrough, observation 6 — delete mid-batch"
    expected: "No further messages appear, no \"group not found\" toast, and the team disappears from the explorer list."
    why_human: "Same. The automated half of SC5 is now pinned (disposeMidRunDelete.test.ts); what remains is the rendered surface — no toast, no late bubble."
  - test: "WR-07 interleaving confidence"
    expected: "A late `finalizeAttempt` for attempt 1 cannot unlink attempt 2's `activeAssignmentByAgent` entry under a different interleaving than the one sampled."
    why_human: "The fix is a conditional unlink (teamRunCoordinator.ts:667-672) proved by exactly one sampled test (`keeps a newer attempt linked when an older attempt finalizes late`). Reviewer asked for human confidence that the sample covers the realistic race."
---

# Phase 37: Runtime reliability + concurrency Verification Report

**Phase Goal:** A run always terminates, a double submit never corrupts state, and the number of agents running at once is a real, configurable limit.
**Verified:** 2026-11-12T00:06:27Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (two backstop tests + the integrated SC5 test)

## Goal Achievement

### Roadmap Success Criteria

| # | Criterion | Status | Code path | Test that proves it |
| - | --------- | ------ | --------- | ------------------- |
| 1 | Throwing `registry.start` → error row + resolved batch, never a hang | ✓ VERIFIED | `dispatchAssignment` try/catch/finally (teamRunCoordinator.ts:1308-1362) → `finalizeAttempt` (572-674) → `settleAgent` deferred release (523-544); `runBatch` awaits `Promise.allSettled(started)` then the deferreds (1582-1588) | `teamRunCoordinator.test.ts:1873` (one of three throws → statuses `[done,error,done]`, `unfinished` tail, phase ≠ `batch-running`); `:1914` (pre-start read throws → same); `:1953` (assignment `runStatus: 'error'`, `stopReason: 'provider'`, raw literal absent from every message) |
| 2 | Double submit → one user message, one turn, phase `ready`; D-20 supersedes with a visible outbox | ✓ VERIFIED | `send()` returns `'busy'` at teamRunCoordinator.ts:1247 **before** `saveTeamMessage` at :1261, so a queued submit writes no user row; `TeamWorkspace.runTurn` routes `busy` → outbox, `blocked` → draft (485-508); `BUSY_PHASES` at :258 | `teamRunCoordinator.test.ts:1741` (asserts `'busy'`, which is only reachable on that early return, then `'started'`, then `'blocked'`); `TeamWorkspaceOutbox.test.tsx:175,197,206,216,241,270` (queue, visible panel, dispatch after settle, blocked → draft, no requeue loop, cancel keeps order) |
| 3 | `getActiveTurns()` empty after every run; indicator clears | ✓ VERIFIED | `finishTurn(teamTurnId)` in `finally` (teamRunCoordinator.ts:1278-1280); per-agent `finishTurn` in `settleAgent` (:536-538); 800ms purge in `aiTurnManager.ts:95-100` | `teamRunCoordinator.test.ts:2004` (registered while parked, drains after), `:2027` (rejected plan), `:2043` (completed batch + `abortAll` mid-run — asserts both namespaced ids coexist and `getActiveTurns()` is 0) |
| 4 | Limit 2, batch 5 → at most 2 at once, all 5 settle | ✓ VERIFIED | `createTeamRunScheduler` FIFO drain (scheduler.ts:59-119); `dispatchAssignment` acquires before `start()` and releases only in `finally` (:1351-1361) | `teamRunCoordinator.test.ts:2098` (samples every notify, `max(runningSamples) === 2`, 5 tool entries all `done`, 5 ledger rows `done`, `getRunningCount() === 0`); `:2159` plan order at limit 1; `:2186` third never starts |
| 5 | Deleting a group mid-run → no active turns, no further writes | ✓ VERIFIED | `disposeRun` awaits `dispose` then drops the entry (teamRunManager.ts:57-71); `dispose` releases parks, clears the registry, settles agents, closes the batch (:2002-2044); explorer disposes before `deleteTeam` (AiOfficeExplorer.tsx:96-111); `deleteTeam` removes both ledger tables in one rw txn (aiTeamRepo.ts:326-355) | **`disposeMidRunDelete.test.ts:70-206`** — real coordinator via `getOrCreateRun` (no stub), limit 1, lead delegates 3, `emp-a` held on a deferred, 2 queued (`:176-178`); then the explorer's exact sequence `await disposeRun` → `await deleteTeam` (`:181-182`); asserts assignments 0 / batches 0 / thread messages 0 (`:186-188`), and after releasing the held turn still 0 with no `createdAt >= deletedAt` and `startedModels === ['emp-a-model']` (`:196-201`), then `getActiveTurns()` empty after the purge window (`:204-205`). Composition with `AiOfficeExplorerTeardown.test.tsx:101` (`callOrder === ['dispose','delete']`) covers the explorer wiring |
| 6 | Per-agent stop and global abort work; stopped work marked incomplete | ✓ VERIFIED | `stopAgent` (teamRunCoordinator.ts:1913-1955) aborts the assignment controller and finalizes by actual status; `abortAll` (:1957-1993) closes the batch as `abortedBy: 'user'`; `incomplete: to !== 'done'` in `finalizeAttempt` (:647) | `teamRunCoordinator.test.ts:2349` (queued stop → `stopped`/`user-per-agent`/`incomplete`, script never invoked, report row present, tool entry names it), `:2422` (`abortAll` → all 3 `stopped`+`incomplete`, batch `abortedBy: 'user'`, phase `ready`), `:598` (running stop leaves siblings running) |

### Phase-Specific Must-Haves

| # | Must-have | Status | Evidence |
| - | --------- | ------ | -------- |
| 7 | Ledger contract: V22, `transitionAssignment` the only `runStatus` writer, append-only attempts | ✓ VERIFIED | `src/db/schema.ts:150-153`, `src/db/index.ts:630`; `aiTeamRunRepo.ts:165-180`; `aiTeamRunRepo.test.ts:73,86,96,106`; `teamRunCoordinator.test.ts:1772` (spies `update`/`put` — no `runStatus` in any update patch) |
| 8 | Scheduler: FIFO, live `setLimit`, idempotent release/cancel, abort-aware acquire, no leaked slot | ✓ VERIFIED | `scheduler.test.ts` 14 tests incl. `clamps every limit…`, `releases one slot on a double release…`, `rejects a parked acquire…`, `treats cancel as an idempotent release`; `teamRunCoordinator.test.ts:2225` (pre-start throw releases the slot), `:2263`, `:2302` (live raise/lower) |
| 9 | Termination: every terminal outcome leaves exactly one report row; `teamTurnId` finished in `finally` | ✓ VERIFIED | `finalizeAttempt` one rw txn over `chatMessages`+`aiTeamAssignments`; `teamRunCoordinator.test.ts:1605,1659,1693` (mixed batch: exactly one report per terminal attempt), `:1803` (two racing finalizes → one row), `:1278-1280` finally |
| 10 | Outbox: single dispatcher `runTurn`; busy queues, blocked restores draft, started runs; `BUSY_PHASES` covers every live phase | ✓ VERIFIED | `TeamWorkspace.tsx:485-542`; `BUSY_PHASES = LIVE_PHASES ∪ {awaiting-budget, awaiting-mutation-approval}` (teamRunCoordinator.ts:246-262); `git grep "void coordinator.send|void sendTurn("` → none; `TeamWorkspaceOutbox.test.tsx` 11 tests |
| 11 | Dispose ordered/tested; no write after dispose; `deleteTeam` removes both ledger tables and the next export validates (CR-01) | ✓ VERIFIED | `teamRunManager.test.ts:141` (entry dropped even when dispose throws), `:96`/`:118` (stale disposed before replacement); `teamRunCoordinator.test.ts:3140,3170,3216,3240,3254,3275,3329,3369`; `aiTeamRepo.test.ts:304` (delete → both tables empty → `validateBackupPayload(exportBackupPayload(db)).valid === true`); integrated end-to-end in `disposeMidRunDelete.test.ts:186-188` |
| 12 | Retry: new attempt row, source superseded by exactly one writer, re-synthesis from resolved report text, previous synthesis found via transcript (WR-05) | ✓ VERIFIED | `retryAssignment` (teamRunCoordinator.ts:1696-1865); `supersedeTeamMessage` is the only `supersededByMessageId` writer (teamTranscriptRepo.ts:177-196); `teamRunCoordinator.test.ts:2533` (attempt 2 appended, source untouched, one re-synthesis), `:2625` (done refused, one slot), `:2926` (fresh coordinator resolves the predecessor from the transcript), `:3068` (WR-07 late-finalize) |
| 13 | Backup: envelope 13; both ledger tables in schema/export/restore/validate/SQLite TS+Rust/parity; `diagnosticDetail` absent from the envelope | ✓ VERIFIED | `backupSchemas.ts:781` (version 13), `:691-780` (strict ledger schemas), `:329-345` (eight link fields on `ChatMessage`); `exportBackup.ts:172,240-244`; `restoreBackup.ts:61-71,239`; `validateBackup.ts:246-250,555-570`; `localSqlitePersistence.ts:34-35`; `sqlite_persistence.rs:26-27`; `tableListParity.test.ts:88`; `officeBackup.test.ts:258,286,477`; `validateBackup.test.ts:84,111` |
| 14 | Non-inferable (backstop): whitespace-only submit ignored | ✓ VERIFIED | `TeamWorkspace.tsx:518` guard, pinned by `TeamWorkspaceWhitespaceSubmit.test.tsx:113-129` (mocks `AiChatWidget`, calls `onSubmit('   ')` and `onSubmit('\n\t')` raw → `send` never called, zero outbox items, zero user rows) and `TeamWorkspaceOutbox.test.tsx:197-218` (composer click + Cmd+Enter paths). Mutation-proved: removing line 518 fails the new file with `expected "vi.fn()" to not be called at all, but actually been called 1 times` |
| 15 | Non-inferable (backstop): retry of a removed agent refuses and writes no row | ✓ VERIFIED | `teamRunCoordinator.ts:1728` throw, pinned by `teamRunCoordinator.test.ts:2809-2853`: real batch where B errors, `splice` removes B from the roster array the coordinator reads, `retryAssignment` rejects with `Nhân viên không còn trong nhóm`, assignment count before === after, `phase === 'ready'`, `getRunningCount() === 0`, B's script not re-invoked. Mutation-proved: removing line 1728 fails with `promise resolved "undefined" instead of rejecting` |
| 16 | Non-inferable (backstop): the phase observed in a real Tauri window | ⚠️ UNCERTAIN (insufficient_spec) | Not performed — WINDOWS.md #10; six steps in Human Verification |

**Score:** 15/16 truths verified — 0 present-behavior-unverified, 1 non-inferable unverified (the Tauri walkthrough).
Roadmap-only score: 6/6. (Previous report's 13/16 did not reconcile against its own table, which listed 12 verified rows; recounted from the rows: 12 + 3 closed = 15.)

### Re-verification (2026-11-12)

Three commits since the previous report; each claim was re-read in the test body, executed, **and mutation-proved** (guard deleted, test observed to fail, file restored, `git status` clean).

| Item | Commit | Test | Mutation proof |
| ---- | ------ | ---- | -------------- |
| SC5 / must-have 11 — delete mid-run | `bb438be1` | `tests/services/ai/office/disposeMidRunDelete.test.ts` | Commenting out `await disposeRun(db, team.id)` → `expected ['emp-a-model','emp-b-model','emp-c-model'] to deeply equal ['emp-a-model']` |
| Whitespace-only submit (14) | `d03678dd` | `tests/components/ai/office/TeamWorkspaceWhitespaceSubmit.test.tsx` (+ `TeamWorkspaceOutbox.test.tsx:197`) | Removing `TeamWorkspace.tsx:518` → `expected "vi.fn()" to not be called at all, but actually been called 1 times` |
| De-rostered retry (15) | `9c5268b2` | `teamRunCoordinator.test.ts:2809` | Removing `teamRunCoordinator.ts:1728` → `promise resolved "undefined" instead of rejecting` |

Why the SC5 test is real, not a stub: it goes through the production ownership path (`getOrCreateRun` → coordinator factory, `:149-162`), a real lead script that calls `delegate_batch` through `executeToolFn` (`:117-131`), and a live batch — `getRunningCount() === 1`, one agent started and blocked on a deferred, two ledger rows `queued` asserted *before* the delete (`:167-178`). The mutation result proves a slot would otherwise be handed to the dead run.

Why the whitespace file was necessary: `ChatInputBar.handleSend` trims and returns before `onSubmit`, so the composer-level test cannot see `TeamWorkspace.handleSubmit`'s own guard. The new file mocks `AiChatWidget` and invokes `onSubmit` raw, which is the only way to pin line 518.

Residual on SC5: the test calls `disposeRun`/`deleteTeam` directly rather than through `AiOfficeExplorer.handleDeleteTeam`; the explorer's call order is separately pinned by `AiOfficeExplorerTeardown.test.tsx:101`. The rendered surface (no toast, no late bubble) remains a human observation.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/services/ai/office/scheduler.ts` | FIFO slot scheduler | ✓ VERIFIED | 120 lines, no dependency added, clamped, abort-aware |
| `src/services/ai/office/teamRunManager.ts` | module-level coordinator ownership | ✓ VERIFIED | 85 lines, dispose-before-drop |
| `src/services/ai/office/teamRunCoordinator.ts` | ledger writes, scheduling, stop/abort/retry/dispose | ✓ VERIFIED | 2143 lines; guards at every await boundary after dispose |
| `src/db/repositories/aiTeamRunRepo.ts` | batch/assignment ledger, single status writer | ✓ VERIFIED | 199 lines |
| `src/components/ai/office/TeamWorkspace.tsx` | outbox + single dispatcher | ✓ VERIFIED | `runTurn`/`handleSubmit`/release effect at 485-542; whitespace guard at 518 now tested |
| `src/hooks/useTeamRunTeardown.ts` | app-exit teardown | ✓ VERIFIED | mounted in `AppShell.tsx:124` |
| `src/validation/backupSchemas.ts` | envelope 13 + ledger schemas | ✓ VERIFIED | version 13, strict objects |
| `tests/services/ai/office/disposeMidRunDelete.test.ts` | integrated mid-run delete | ✓ VERIFIED | 207 lines, real coordinator, mutation-proof |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `TeamWorkspace.handleSubmit` | `coordinator.send` | `runTurn` (only dispatcher) | ✓ WIRED — no `void sendTurn(`/`void coordinator.send(` anywhere in `src/` |
| `TeamWorkspace` | `coordinator.retryAssignment` | `messageListExtensions.onRetryAgent` → `AiChatWidget:409` → `ChatMessageList:190` → `ChatMessageBubble:1216` | ✓ WIRED (all four files carry the prop) |
| `AiOfficeExplorer.handleDeleteTeam` | `disposeRun` → `deleteTeam` | explicit await, dispose failure aborts the delete | ✓ WIRED and call-order tested; the same sequence proven end-to-end against a live batch |
| `dispatchAssignment` | `scheduler.acquire` → `registry.get().start()` | acquire before start, release in `finally` | ✓ WIRED |
| `runBatch` | `openBatch`/`createAssignment`/`closeBatch` | one row per decision, close on every exit path | ✓ WIRED |
| `finalizeAttempt` | `transitionAssignment` + report row | one `rw` txn over both tables | ✓ WIRED |
| `AppShell` | `disposeAllRuns('app-exit')` | `useTeamRunTeardown` (`pagehide` + Tauri close) | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Real data | Status |
| -------- | ------------- | ------ | --------- | ------ |
| `AgentStatusRow` | `message.runStatus` | persisted `chatMessages` link fields written by `finalizeAttempt` | yes (`db.chatMessages.update`/`insertReportMessage`) | ✓ FLOWING |
| `TeamWorkspace` snapshot | `coordinator.getState()` | live coordinator state (scheduler + agents map) | yes | ✓ FLOWING |
| `OutboxPanel` | `outbox` | `runTurn` outcome (`busy`/`blocked`/throw) | yes | ✓ FLOWING |
| backup envelope | `aiTeamBatches`/`aiTeamAssignments` | `db.aiTeamBatches.toArray()` / `assignments.map(projectSafeAssignment)` | yes | ✓ FLOWING |

### Behavioral Spot-Checks (focused suites only — full suite never run, user rule)

| Suite | Command | Result |
| ----- | ------- | ------ |
| scheduler + manager + ledger repo + V22 migration + parity | `npx vitest run tests/services/ai/office/scheduler.test.ts tests/services/ai/office/teamRunManager.test.ts tests/db/aiTeamRunRepo.test.ts tests/db/schemaV22Migration.test.ts tests/db/tableListParity.test.ts` | ✓ 5 files, 42 tests passed |
| coordinator | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | ✓ 1 file, 86 tests passed (2026-11-11); retry test re-run alone 2026-11-12 under mutation → fails without the guard |
| office UI | `npx vitest run tests/components/ai/office/TeamWorkspaceOutbox.test.tsx tests/components/ai/office/AgentAttributionRow.test.tsx tests/components/ai/office/AiOfficeExplorerTeardown.test.tsx` | ✓ 3 files, 23 tests passed (2026-11-11) |
| attribution + teardown hook | `npx vitest run tests/ai/ChatMessageListAttribution.test.tsx tests/hooks/useTeamRunTeardown.test.ts` | ✓ 2 files, 21 tests passed |
| backup + repo | `npx vitest run tests/services/backup/officeBackup.test.ts tests/services/backup/validateBackup.test.ts tests/services/ai/office/aiTeamRepo.test.ts tests/services/ai/office/teamTranscriptRepo.test.ts` | ✓ 4 files, 85 tests passed |
| **new: mid-run delete + whitespace** | `npx vitest run tests/services/ai/office/disposeMidRunDelete.test.ts tests/components/ai/office/TeamWorkspaceWhitespaceSubmit.test.tsx` | ✓ 2 files, 2 tests passed (2026-11-12) |
| **new: de-rostered retry** | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "refuses a retry whose agent has left the roster"` | ✓ 1 test passed, 86 skipped |
| typecheck | `npx tsc --noEmit` | ✓ exit 0 (2026-11-11) |

Total: 17 files, 260 tests, all green in verification runs. Full suite never run (user rule).

### Probe Execution

N/A — no `scripts/*/tests/probe-*.sh` declared by the phase and none present.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
| ----------- | ------------ | ------ | -------- |
| AIO-RUNTIME-01 | 37-03, 37-07 | ✓ SATISFIED | criteria 1 + 9 rows above |
| AIO-RUNTIME-02 | 37-06 | ✓ SATISFIED (D-20 override) | outbox tests; note REQUIREMENTS.md still carries the superseded "rejected visibly at the composer" wording (CONTEXT deferred flagging) |
| AIO-RUNTIME-03 | 37-03 | ✓ SATISFIED | criterion 3 |
| AIO-RUNTIME-04 | 37-02, 37-06 | ✓ SATISFIED | criterion 5 + must-have 11, now integrated-tested end-to-end |
| AIO-RUNTIME-05 | 37-01, 37-02, 37-04, 37-05 | ✓ SATISFIED | criteria 4, 7, 8, 13 |
| AIO-GROUP-04 | 37-01, 37-04, 37-05 | ✓ SATISFIED | `grep MAX_BATCH_SIZE src/ tests/` → no match; `teamTools.test.ts:501` EMPTY_BATCH; 30-assignment acceptance test in 37-04 |
| AIO-LEAD-05 | 37-04, 37-07, 37-08 | ✓ SATISFIED (automated) | criterion 6 + retry bubbles (`AgentAttributionRow.test.tsx`, `ChatMessageListAttribution.test.tsx`) |

No orphaned requirements: every ID mapped to Phase 37 in REQUIREMENTS.md appears in at least one plan's `requirements` field.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| — | none | — | `TBD`/`FIXME`/`XXX` scan over all phase-modified sources: no matches. `p-limit`/`p-queue`/`async-mutex`: absent from `package.json`. No watchdog timer in the coordinator (D-15 respected). |

### Test Quality Audit

| Check | Result |
| ----- | ------ |
| Disabled/skipped tests on a requirement | 0 (`it.skip`/`xit`/`describe.skip` scan over the ten phase suites) — WINDOWS.md #9 records a *flaky* test, not a skipped one |
| Circular test patterns | 0. The two new non-inferable tests mock only the layer *above* the guard (widget / composer) or mutate the roster array the coordinator reads; neither writes a fixture from the system under test |
| Assertion strength | Value/behavioral throughout: ledger status tuples, scheduler counts, message-row counts, call order; the three new tests were each falsified by deleting the guard they name |
| Mutation spot-check (2026-11-12) | 3/3 — every closure test failed when its guard was removed, and the files were restored (`git status` clean) |

### Decision Coverage

All trackable CONTEXT.md decisions are honored by shipped artifacts. (27/27, 0 not honored — `check.decision-coverage-verify`.)

### Gaps

None blocking. The automated surface covers criteria 1-6 in full. The only uncovered must-have is the observed Tauri walkthrough (must-have 16), which is not assertable in this environment and remains under Human Verification.

---

## Human Verification

The six observations below are the unrun Tauri walkthrough (D-27, C-15; WINDOWS.md #10). They must be performed in one session, each recorded pass/fail with a one-line note. Code reading is explicitly not sufficient for these.

Preconditions: `npm run tauri:dev` launches a window; a model provider (endpoint + API key) is saved in Settings; a ready binary exists (none of these were available to the executor).

1. **Limited batch.** Open/create a group with one leader and at least five agents. Team Settings → "Số nhân viên chạy đồng thời" = 2 → save. Send a request that makes the lead delegate five assignments. **Expect:** at most two bubbles in "Đang làm việc" at any moment, the rest "Đang xếp hàng", all five terminal.
2. **Outbox.** While the batch runs, type and submit a second message. **Expect:** it appears in the outbox above the composer marked queued (not a dropped message, no error), the composer keeps accepting input, and it dispatches automatically once the first turn settles.
3. **Stop a queued agent.** Stop one agent that is still "Đang xếp hàng". **Expect:** it shows "Chưa hoàn tất" and never ran; the other agents still complete.
4. **Global Stop.** Press the global Stop during a batch. **Expect:** every agent stops, the queue clears, the composer returns to normal, and the active-turn indicator disappears.
5. **Retry.** Click "Chạy lại" on the stopped agent's bubble. **Expect:** only that agent gets a new attempt, its new report replaces the old one on screen, and a new leader synthesis names the previously unfinished work.
6. **Delete mid-batch.** Delete the group from the AI Office explorer while a batch is running. **Expect:** no further messages, no "group not found" error toast, the team gone from the list. (The database half is now pinned by `disposeMidRunDelete.test.ts`; what a human must confirm is the rendered surface.)

Plus one judgement call: **WR-07 concurrency confidence** — the conditional unlink at `teamRunCoordinator.ts:667-672` is proved by a single sampled interleaving (`keeps a newer attempt linked when an older attempt finalizes late`). A reviewer should decide whether that sample pins the realistic race or whether a stress/randomised test is warranted.

---

## Known Pre-existing Issues

Reproduce on the base commit; **not** phase regressions and **not** counted against this phase:

1. `tests/views/TeamsView.test.tsx` — unhandled `DatabaseClosedError` rejections (7-8 per run) while the tests themselves pass. WINDOWS.md #6.
2. `tests/workbench/AiExplorers.test.tsx` — duplicate lead label on roughly one in four runs (renders both explorers on one DB). WINDOWS.md #8.
3. `tests/services/ai/office/teamRunCoordinator.test.ts:796` — "pauses one agent at 80%" flakes ~3/4 runs (`expected undefined to be 'running'`). WINDOWS.md #9. (The suite passed in this verification run, but the flake is real.)

---

_Verified: 2026-11-12T00:06:27Z_
_Verifier: Claude (gsd-verifier)_
