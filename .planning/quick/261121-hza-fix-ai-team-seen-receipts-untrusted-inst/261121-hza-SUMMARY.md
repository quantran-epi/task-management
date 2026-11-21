---
id: 261121-hza
plan: 261121-hza
subsystem: ai-office
tags: [team-chat, lead-turn, cursor, untrusted-data, code-edit, delegation, prompts, persona-seed]

requires:
  - phase: 48
    provides: Agent Developer role gate and worktree-scoped code_edit handler
provides:
  - Seen receipts for queued lead follow-up turns with or without a tool round
  - Employee system prompt that no longer re-labels the active order as untrusted data
  - Lead delegation rule and developer-only third code_edit exception in prompts, plus refreshed persona seed
affects: [teamRunCoordinator, teamPrompts, AI-STAFF-SDLC-TEAM.json, AI Office team chat]

tech-stack:
  added: []
  patterns:
    - Claim release is synchronous before the chained follow-up turn so cursor receipt is accepted.
    - Prompt capability flags are opt-in and mirror the existing tool payload gate.

key-files:
  created:
    - .planning/quick/261121-hza-fix-ai-team-seen-receipts-untrusted-inst/261121-hza-SUMMARY.md
  modified:
    - src/services/ai/office/teamRunCoordinator.ts
    - src/services/ai/office/teamPrompts.ts
    - .planning/AI-STAFF-SDLC-TEAM.json
    - tests/services/ai/office/teamRunCoordinator.test.ts
    - tests/services/ai/office/teamPrompts.test.ts

key-decisions:
  - Cursor advance for follow-ups lives in startLeadTurn's finally and is limited to released claims; Stop-cancelled claims never become seen.
  - The current instruction stays only in the user-role turn text; no YÊU CẦU GỐC untrusted block in the employee system prompt.
  - code_edit is advertised in the prompt only when agent id matches developerAgentId() and options.agentDeveloperWorktree exists; handler and payload gates untouched.

patterns-established:
  - Released-claim receipts are advanced at turn teardown with a try/catch that cannot break the turn.
  - New prompt exceptions are gated by a per-turn capability flag supplied by the coordinator.

requirements-completed: []

duration: ~12min
completed: 2026-11-21
---

# Quick Task 261121-hza Summary

**Fixed queued lead-reply seen receipts, removed the self-untrusted current request label, and wired developer-only code-edit delegation into team prompts and persona seed**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-11-21T06:04:35Z
- **Completed:** 2026-11-21T06:16:27Z
- **Tasks:** 3 of 3
- **Files modified:** 5 source/config files; 1 summary created

## Accomplishments

- `scheduleLeadReplyDrain` releases the claim synchronously before the chained follow-up; `startLeadTurn` finally advances the lead cursor for released triggers, including turns that never call `beforeToolRound`.
- Employee system prompt no longer contains the `YÊU CẦU GỐC` untrusted block; the current order reaches the model only as `text: instruction`. All other untrusted wrapping remains.
- Lead prompt instructs delegation of code edits to Agent Developer; only developer with a worktree sees the third `code_edit` exception. Five stale persona lines replaced; seed stale-sentence count is 0.

## Task Commits

1. **Task 1 — Phát hành claim + tiến cursor khi follow-up lead turn kết thúc** — `e4f55310` (fix)
2. **Task 2 — Bỏ nhãn untrusted cho chính lệnh hiện tại** — `312c3c6b` (fix)
3. **Task 3 — Prompt ủy thác code_edit đúng vai trò + dọn persona seed** — `e1b0c0ba` (feat)

## Files Created/Modified

- `src/services/ai/office/teamRunCoordinator.ts` — synchronous claim release in drain; finally cursor receipt; developer-gated prompt flag at employee request call site.
- `src/services/ai/office/teamPrompts.ts` — removed current-request untrusted wrap; added `codeEditAllowed`, `CODE_EDIT_EXCEPTION_LINE`, `LEAD_CODE_DELEGATION_LINE` and their prompt slots.
- `.planning/AI-STAFF-SDLC-TEAM.json` — replaced stale "Không ai trong nhóm sửa code" sentence in five personas (Evra, Vidic, Rooney, Scholes, lead). Developer persona unchanged.
- `tests/services/ai/office/teamRunCoordinator.test.ts` — two new receipt assertions plus a polling helper for the finally-time cursor write.
- `tests/services/ai/office/teamPrompts.test.ts` — renamed current-request test and added three Task 3 cases.
- `.planning/quick/261121-hza-fix-ai-team-seen-receipts-untrusted-inst/261121-hza-SUMMARY.md` — this summary.

## Decisions Made

- Kept the epoch-mismatch branch unchanged: Stop deletes the claim and never marks the row seen.
- Kept the final cursor advance inside a dedicated try/catch and before `notify()`, so receipt failure cannot suppress existing cleanup.
- Kept all tool payload filters, `toolContext`, handler role gate, Dexie schema and dependencies unchanged, as the plan required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test harness race in the new no-tool-round test**
- **Found during:** Task 1 verification
- **Issue:** `waitForReady` can observe the phase back to `ready` before the lead turn's `finally` writes the cursor, so the first assertion saw an empty capture and the cursor check could flake.
- **Fix:** Wait explicitly for the follow-up script to start, then poll the persisted cursor with `waitForLeadCursor` before asserting.
- **Files modified:** `tests/services/ai/office/teamRunCoordinator.test.ts`
- **Verification:** New test passes consistently in scoped coordinator run.
- **Committed in:** `e4f55310`

**2. [Rule 4 - Architecture] Pre-existing test contradicts Phase 48 lead payload gate**
- **Found during:** Task 3 baseline comparison
- **Issue:** `tests/services/ai/office/teamRunCoordinator.test.ts:563-567` asserts the lead payload contains every team tool not in `EMPLOYEE_ONLY_TEAM_TOOLS`, which includes `code_edit`; Phase 48 and this plan explicitly keep `code_edit` out of the lead payload. Failure exists at HEAD before these changes.
- **Fix:** No code/test change — modifying the payload gate is forbidden by this plan and would be an architectural change. Left for owner decision.
- **Files modified:** None.
- **Verification:** Baseline run on HEAD reproduced the same failure.
- **Committed in:** Not applicable.

---

**Total deviations:** 2 (1 auto-fixed test race, 1 pre-existing architectural conflict surfaced)
**Impact on plan:** No scope creep. Implementation matches the plan; one pre-existing test remains red because it asserts the opposite of the planned lead gate.

## Issues Encountered

- Two coordinator test failures are pre-existing at HEAD and remain after this task:
  1. Lead payload test expects `code_edit` to be advertised to the lead (contradicts Phase 48 gate and this plan).
  2. Telemetry test `stamps user-abort on abortAll and app-exit on dispose without changing stop reasons` fails at line 7999 (`exitRows.every(row => row.runStatus === 'stopped')`).
  Baseline verification: HEAD run = 2 failed / 199 passed; after Task 1 = same 2 failed / 200 passed (one added test); after Task 3 scoped run = same 2 failed / 267 passed across 3 files.
- No auth gates, no package installs, no full Vitest suite.

## Verification

- `npx vitest run tests/services/ai/office/teamPrompts.test.ts` — 60 passed.
- `npx vitest run tests/services/ai/office/teamPrompts.test.ts tests/services/ai/office/teamRunCoordinator.test.ts src/db/repositories/__tests__/aiOfficeImport.test.ts` — 267 passed, 2 failed (both pre-existing at HEAD, documented above).
- `npx tsc --noEmit` — clean after each task.
- `grep -c 'Không ai trong nhóm sửa code' .planning/AI-STAFF-SDLC-TEAM.json` — `0`.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path, file access pattern or schema trust boundary was introduced; prompt/persona text and existing handler gates only.

## User Setup Required

None.

## Next Phase Readiness

Ready for owner review and merge. Open owner decision: whether to update the stale lead payload test to exclude `code_edit`, and separately investigate the pre-existing telemetry stop-reason failure. Both are outside this quick task's scope.

---
*Plan: 261121-hza*
*Completed: 2026-11-21*

## Self-Check: PASSED

- All 5 modified files and the summary file exist on disk.
- All three task commits (`e4f55310`, `312c3c6b`, `e1b0c0ba`) exist in repository history.
