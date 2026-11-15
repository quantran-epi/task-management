---
phase: quick-261115-q4n
plan: '01'
subsystem: ai-office
tags: [uat-41, team-docs, prompt, mcp-timeout, rust]
requires: []
provides:
  - EMPLOYEE_WRITE_DOC_LINE in the lead prompt
  - user row persisted before per-turn preps
  - GRAPHITI_MCP_TIMEOUT_SECS + connect timeout
affects:
  - src/services/ai/office/teamPrompts.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - src-tauri/src/ai_proxy.rs
tech-stack:
  added: []
  patterns:
    - importOriginal-delegating vi.mock with a hoisted probe flag
key-files:
  created: []
  modified:
    - src/services/ai/office/teamPrompts.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - src-tauri/src/ai_proxy.rs
    - tests/services/ai/office/teamPrompts.test.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts
decisions:
  - A dispose during a per-turn prep returns 'steered', not 'blocked', because the user row is already persisted
  - The leadless refusal keeps the row in the transcript and appends nothing to the event log
metrics:
  duration: ~12 min
  completed: 2026-11-15
---

# Quick 261115-q4n: Fix 3 UAT-41 defects Summary

Three diagnosed UAT-41 defects closed: the lead now tells employees to write with `write_doc`, the user's own chat row lands before any hang-prone MCP discovery, and the Graphiti MCP client is bounded in Rust.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Tell the lead that employees write with write_doc | 75a8b20c |
| 2 | Persist the user row before the hang-prone preps, log the docs failure | a15c36fb |
| 3 | Bound the Graphiti MCP reqwest client | e8557959 |

## What changed

**Task 1 — test 12.** `EMPLOYEE_WRITE_DOC_LINE` exported from `teamPrompts.ts` and pushed into the `[THƯ MỤC TÀI LIỆU NHÓM]` block between the `create_note` line and `LEAD_NO_WRITE_DOC_LINE`. One Vietnamese sentence carrying all three facts: members write their own documents with the team tool `write_doc` (list/create/update) inside their own folder with no approval card; a delegated document task must say the member uses `write_doc`; `create_note` is the leader's write path and must not be delegated. `LEAD_NO_WRITE_DOC_LINE` stays last and unchanged, so the block reads read → lead-write → member-write → lead-negation. New test asserts both lines are present together and that the new line names both tools.

**Task 2 — tests 14 and 7.** `send()` reordered: roster load → mention parse/recipients → `saveTeamMessage` + `notify()` → leadless refusal → `appendForExistingMessage` + `notify()` → the three preps (`ensureDocsReady`, `refreshMcpTools`, `resetBudgetWarnings`, `lastUserRequest`) → one `if (disposed) return 'steered'` → routing unchanged. The two pre-roster `'blocked'` checks are untouched. `ensureDocsReady`'s bare `catch` became `catch (err)` with a `console.warn` naming the team id and the error, before the existing degrade.

**Task 3 — test 14 root cause.** `GRAPHITI_MCP_TIMEOUT_SECS: u64 = 30` added after `AI_PROXY_TIMEOUT_SECS` with a doc comment explaining why it is not the 90 s LLM bound; `graphiti_mcp_request`'s client now sets `.connect_timeout(15s)` and `.timeout(GRAPHITI_MCP_TIMEOUT_SECS)`, matching the AI-chat client's order and style. No signature, command, URL or allowlist change.

## Invariants preserved

- `appendForExistingMessage` still runs only when `recipients.length > 0`; the leadless refusal path leaves the event log untouched and returns `'refused'`.
- A dispose during a prep now returns `'steered'` (row + log entry already exist), so the UI must not restore the draft and the user cannot send the same text twice. Documented in the code comment at the reorder point.
- `lastUserRequest` is still set before any turn starts.

## Verification

```
npx vitest run tests/services/ai/office/teamPrompts.test.ts tests/services/ai/office/teamRunCoordinator.test.ts
  → 2 files passed, 210 tests passed (38 + 172)

cd src-tauri && cargo check
  → Finished `dev` profile [unoptimized + debuginfo] target(s) in 7.79s (cargo available, check passed)

npx tsc --noEmit -p tsconfig.json | grep -iE 'teamPrompts|teamRunCoordinator'
  → no matches (tsc-scan-done)
```

Both new `vi.mock` factories spread `importOriginal` and delegate whenever their hoisted flag is false, so the pre-existing 170 tests in `teamRunCoordinator.test.ts` keep the real implementations. Verified by running the whole scoped file, not just the new tests.

## Deviations from Plan

**1. [Rule 3 - Blocking] The MCP probe test needed the flag on the team row, not only in memory**
- **Found during:** Task 2
- **Issue:** `coordinator.setTeamSettings({ mcpEnabled: true })` patches `liveTeam` in memory, but `ensureDocsReady` adopts the team row it re-reads from Dexie, wiping the flag before `refreshMcpTools` looks at it — so `discoverAllMcpTools` never ran and the probe stayed empty.
- **Fix:** the test also calls `updateTeam(team.id, { mcpEnabled: true }, db)` before `setTeamSettings`, with a comment stating why.
- **Files modified:** `tests/services/ai/office/teamRunCoordinator.test.ts`
- **Commit:** a15c36fb

## Deferred (out of scope, as planned)

- `delegate_batch` tool-description hint in `teamTools.ts`
- `resolveMemberFolder` full-notes scan (1.27 s warm backfill)
- Test-13 flaky untrusted-wrap gap

## Known Stubs

None.

## Self-Check: PASSED

- `src/services/ai/office/teamPrompts.ts` — exists, exports `EMPLOYEE_WRITE_DOC_LINE` (line 182), used at line 242.
- `src/services/ai/office/teamRunCoordinator.ts` — `saveTeamMessage` now precedes `ensureDocsReady`/`refreshMcpTools`; `console.warn` present in `ensureDocsReady`.
- `src-tauri/src/ai_proxy.rs` — `GRAPHITI_MCP_TIMEOUT_SECS` defined; both timeouts on the graphiti client.
- Commits 75a8b20c, a15c36fb, e8557959 all present in `git log`.
