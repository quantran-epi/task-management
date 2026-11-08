---
phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
plan: 04
subsystem: ai-office
tags: [ai-office, budget, concurrency, prompts, prompt-injection]
requires: [34-02, 34-03]
provides:
  - createBudgetGate
  - bucketOf
  - shouldNotifyPause
  - normalizeUsageTotal
  - createTeamRunRegistry
  - buildLeadTurnRequest
  - buildEmployeeTurnRequest
  - wrapUntrusted
affects:
  - src/services/ai/office/teamRunCoordinator.ts
  - src/views/AiOfficeView.tsx
tech-stack:
  added: []
  patterns:
    - "resolver-installed-before-publish promise gate (copied from the approval park)"
    - "per-key runtime registry (copied from tabRuntimes shape, not imported)"
    - "delimited untrusted-data segment with delimiter redaction"
key-files:
  created:
    - src/services/ai/office/budgetGate.ts
    - src/services/ai/office/teamRunRegistry.ts
    - src/services/ai/office/teamPrompts.ts
    - tests/services/ai/office/budgetGate.test.ts
    - tests/services/ai/office/teamRunRegistry.test.ts
    - tests/services/ai/office/teamPrompts.test.ts
  modified: []
decisions:
  - "Budget crossing rule is stateless: shouldNotifyPause(previous, current) only, so a top-up re-arms notification with no stored flag"
  - "wrapUntrusted redacts delimiter-shaped runs inside the body so retrieved text cannot close the block early"
  - "Employee assignment history is filtered by agentId and messageKind before sanitizing, so a peer row can never enter another agent's history"
metrics:
  duration: "~12m"
  completed: 2026-11-08
---

# Phase 34 Plan 04: Budget Gate, Per-Agent Runtime Registry, Team Prompt Assembly Summary

Abortable 80%-crossing budget gate, one `ChatTurnRuntime` per agent, and pure lead/employee prompt builders that withhold skill bodies and bound history.

## What Was Built

### Task 1 — `src/services/ai/office/budgetGate.ts`

`createBudgetGate()` returns `{ close, open, isClosed, wait(signal?) }`. `wait` resolves
immediately while open; while closed it parks on a single resolver slot (installed before
anything is published, mirroring the approval park at `chatTurnRuntime.ts:371-403`) and
rejects with `new DOMException('Aborted', 'AbortError')` on signal abort. The abort listener
is registered `{ once: true }` and removed on resolve, so a long-lived turn signal does not
accumulate listeners across rounds. An already-aborted signal rejects immediately.

`bucketOf(used, budget)` = `Math.floor(used / budget * 10)`, returning 10 when `budget <= 0`
(fully consumed, never `Infinity`/`NaN`). `shouldNotifyPause(previous, current)` =
`current >= 8 && previous < 8` — the whole D-20 rule with zero stored state, so a top-up
lowers the bucket and the next crossing notifies again. `normalizeUsageTotal` falls back to
`promptTokens + completionTokens` when a provider omits `totalTokens`.

### Task 2 — `src/services/ai/office/teamRunRegistry.ts`

`createTeamRunRegistry(createDeps)` keyed by `agentId` only, returning
`{ get, peek, abort, abortAll, clear, getSnapshot }`. `get` lazily builds via
`createChatTurnRuntime(createDeps(agentId))` and caches. `abort(agentId)` is the per-agent
Stop; `abortAll()` the global Stop (D-14); `clear()` aborts and drops every entry. Shape
copied from `tabRuntimes.ts`, not imported (that registry is `(tabId, threadId)`-keyed).

### Task 3 — `src/services/ai/office/teamPrompts.ts`

Pure functions returning `{ systemMessages, history, text }`. No Dexie, no React.

- `wrapUntrusted(label, body)` — header and footer both name the label; a Vietnamese line
  states the content is data, never instructions; delimiter-shaped runs inside the body are
  redacted so injected text cannot close the block early (T-34-16).
- `buildEmployeeTurnRequest` — persona + role + read-only policy first, then skill
  `description` (never `body`) plus a `read_skill` pointer, then the original request and any
  prior-batch results inside `wrapUntrusted`, then the `search_team_history` escape hatch.
  History = own `instruction`/`report` rows (instruction → `user`, report → `assistant`),
  filtered by `agentId`, capped at `ASSIGNMENT_HISTORY_CAP`, reversed to chronological, then
  the `sanitizeHistoryTurns(recentTurns)` window.
- `buildLeadTurnRequest` — lead persona + operating rules (decompose, `delegate_batch` with at
  most `MAX_BATCH_SIZE`, wait for the whole batch, synthesize after, never claim employee
  reasoning, only the lead mutates) + roster of `name`/`role`/`capability` only + linked-item
  index + write-authority and Vietnamese-language rules. History = sanitized recent window.

## Verification

- `npx vitest run tests/services/ai/office/budgetGate.test.ts tests/services/ai/office/teamRunRegistry.test.ts tests/services/ai/office/teamPrompts.test.ts` → 3 files, 26 tests passed
- `npx tsc --noEmit` → clean
- `git diff --stat package.json package-lock.json` → empty (T-34-SC: no packages installed)
- Neither new module imports React or the Dexie database

## TDD Gate Compliance

Each task ran RED then GREEN:

- Task 1: `49f5c8af` (test, module missing) → `f5496b94` (feat)
- Task 2: `d9af2de8` (test) → `5e6e9094` (feat)
- Task 3: `1d080df2` (test) → `36c73762` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test fixture ordering contradicted the documented repo contract**
- **Found during:** Task 3
- **Issue:** The "never includes another agent row" test fed `assignmentHistory` oldest-first, but `listAssignmentHistory` returns newest-first. The implementation correctly reverses, so the fixture produced a report-before-instruction order that `sanitizeHistoryTurns` legitimately dropped.
- **Fix:** Reordered the fixture to newest-first and added a comment naming the contract.
- **Files modified:** `tests/services/ai/office/teamPrompts.test.ts`
- **Commit:** `36c73762`

## Known Stubs

None.

## Threat Flags

None — all three modules implement mitigations already registered as T-34-16 through T-34-20.

## Self-Check: PASSED

- `src/services/ai/office/budgetGate.ts` — FOUND
- `src/services/ai/office/teamRunRegistry.ts` — FOUND
- `src/services/ai/office/teamPrompts.ts` — FOUND
- `tests/services/ai/office/budgetGate.test.ts` — FOUND
- `tests/services/ai/office/teamRunRegistry.test.ts` — FOUND
- `tests/services/ai/office/teamPrompts.test.ts` — FOUND
- Commits `49f5c8af`, `f5496b94`, `d9af2de8`, `5e6e9094`, `1d080df2`, `36c73762` — FOUND
