---
phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
plan: 03
subsystem: ai-office, chat-runtime
tags: [chat-turn-runtime, orchestrator-loop, tool-allowlist, attribution, mutation-policy]
requires:
  - 34-01
provides:
  - ChatTurnRequest.mutationPolicy
  - ChatTurnRequest.persistUserMessage
  - ChatTurnRequest.beforeToolRound
  - ChatTurnRequest agent attribution fields
  - ChatTurnRuntimeDeps.onUsage
  - AiOrchestratorLoopOptions.beforeToolRound
  - READ_ONLY_REFUSAL
  - EMPLOYEE_READ_ONLY_ALLOWLIST
  - LEAD_TOOL_ALLOWLIST
  - payloadHasMutationTool
  - SaveMessageInput attribution fields
affects:
  - src/components/ai/runtime/chatTurnRuntime.ts
  - src/services/ai/aiOrchestratorLoop.ts
  - src/services/ai/chatTurnTools.ts
  - src/db/repositories/chatRepo.ts
tech-stack:
  added: []
  patterns:
    - additive optional request fields with exactOptionalPropertyTypes
    - refusal branch ordered before every approval path
    - awaited round-boundary hook carrying the loop AbortSignal
    - explicit allowlist as the structural read-only boundary
key-files:
  created:
    - tests/ai/chatTurnTools.test.ts
  modified:
    - src/components/ai/runtime/chatTurnRuntime.ts
    - src/services/ai/aiOrchestratorLoop.ts
    - src/services/ai/chatTurnTools.ts
    - src/db/repositories/chatRepo.ts
    - tests/ai/chatTurnRuntime.test.ts
    - tests/ai/chatRepo.test.ts
    - tests/services/ai/aiOrchestratorLoop.test.ts
decisions:
  - mutationPolicy read-only refuses as the first statement in onMutationCheck, before the artifact branch and autoApprove
  - beforeToolRound takes the turn AbortSignal as a required second argument so a parked gate can reject on Stop
  - attribution is declared on SaveMessageInput and written into the row literal, because the literal drops unknown keys
  - Analysis Mode stays a prompt preference; the two stale hard-block tests were rewritten to the merged behavior
metrics:
  duration: ~10m
  completed: 2026-11-08
---

# Phase 34 Plan 03: Runtime Seams for AI Office Team Turns Summary

Three shared-runtime seams opened additively: a request-level read-only mutation policy that refuses before any approval path, an opt-out from the automatic user-message write plus attribution that survives into the stored row, and an abortable round-boundary hook for the budget gate — with two mutation-free tool allowlists.

## What Was Built

**`src/db/repositories/chatRepo.ts`.** `SaveMessageInput` gains `agentId`, `agentName`, `agentKind`, `messageKind` (all `| undefined`). The `message: ChatMessage` literal spreads each with the existing conditional-spread style. This is load-bearing: the literal builds the row field by field, so an undeclared key on the input object is silently dropped and attribution would die at the call.

**`src/components/ai/runtime/chatTurnRuntime.ts`.** `ChatTurnRequest` gains seven optional fields (`agentId`, `agentName`, `agentKind`, `messageKind`, `persistUserMessage`, `mutationPolicy`, `beforeToolRound`); `ChatTurnRuntimeDeps` gains `onUsage`. Five edits:

1. The user-message write is wrapped in `request.persistUserMessage !== false`; when skipped, `userMessageId` stays `null` and `lastUserMessageId` is not set.
2. `mutationPolicy: 'read-only'` returns `{ proceed: false, cancellationResult: READ_ONLY_REFUSAL }` as the first statement of `onMutationCheck` — before the artifact-patch branch, before `autoApprove`, before any `awaiting-approval` publish. Withholding the tool from the payload is not enough: a hallucinated `update_task` still matches `isMutationTool`.
3. `deps.onUsage?.(tokenUsage)` fires after the re-sum, passing the cumulative value.
4. The assistant save spreads all four attribution fields.
5. `beforeToolRound` is forwarded into `deps.runLoop` as `(r) => request.beforeToolRound!(r, turnController.signal)`, so the hook and the loop observe the same abort. The key is absent when the request has no hook.

`READ_ONLY_REFUSAL` is exported next to `DECLINED_CANCELLATION` and carries `code: 'READ_ONLY_EMPLOYEE'`. `ChatTurnStatus` is untouched (D-35) — the diff contains no change to the union.

**`src/services/ai/aiOrchestratorLoop.ts`.** `AiOrchestratorLoopOptions.beforeToolRound?: (round, signal?) => Promise<void>`, awaited immediately after `loopCount++` when `loopCount > 1`, followed by `signal?.throwIfAborted()`. The position is after the previous round appended every tool result and emitted the synthesis status, so parking there resumes exactly where it stopped. Passing the signal in is what makes a parked gate settle on Stop; the trailing `throwIfAborted()` covers a hook that resolves normally after an abort.

**`src/services/ai/chatTurnTools.ts`.** `EMPLOYEE_READ_ONLY_ALLOWLIST` (16 verified `AI_DATABASE_TOOLS` read names), `LEAD_TOOL_ALLOWLIST` (employee set plus `list_linked_items`, `get_linked_context`, `delegate_batch`), and `payloadHasMutationTool`. `delegate_batch` is lead-only, so an employee cannot spawn a nested batch. Team-scoped tools (`search_team_history`, `read_team_turn`, `read_skill`) are deliberately absent — they are not `AI_DATABASE_TOOLS` members and are appended by the coordinator from `TEAM_TOOL_DEFINITIONS`.

## Verification

```
npx vitest run tests/ai/chatTurnRuntime.test.ts tests/ai/chatRepo.test.ts \
  tests/services/ai/aiOrchestratorLoop.test.ts tests/ai/chatTurnTools.test.ts \
  tests/ai/aiTools.test.ts
→ 5 files passed, 158 tests passed
npx tsc --noEmit → exit 0
git diff --stat 2cc78790 -- package.json package-lock.json → empty
```

Acceptance greps: `READ_ONLY_REFUSAL` 2 hits, `beforeToolRound` 3 hits in the runtime and 4 in the loop, `delegate_batch` appears in `chatTurnTools.ts` only in the lead list (plus two comments), `ChatTurnStatus =` unchanged at its original declaration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two stale Analysis Mode hard-block tests failed on the base commit**
- **Found during:** Task 1 baseline run
- **Issue:** `tests/ai/chatTurnRuntime.test.ts` still asserted that Analysis Mode cancels mutations and hard-blocks unsolicited patch calls. The merged refactor (base `2cc78790`) made Analysis Mode a prompt preference, so the first test timed out waiting for a park that never came and the second read `undefined`. Both were pre-existing failures, not caused by this plan.
- **Fix:** Rewrote both to the current contract — Analysis Mode with `autoApprove: true` proceeds; an unsolicited patch in Analysis Mode parks on the approval card and proceeds once approved. No production behavior was changed to satisfy them.
- **Files modified:** `tests/ai/chatTurnRuntime.test.ts`
- **Commit:** `17470221`

## TDD Gate Compliance

Each of the three tasks is `tdd="true"` and ran RED then GREEN:

| Task | RED commit | GREEN commit |
|------|-----------|--------------|
| 1 | `17470221` test(34-03): cover read-only policy, persistence opt-out, attribution and usage forwarding | `df125a6d` feat(34-03): open the runtime seams for AI Office team turns |
| 2 | `11d426bd` test(34-03): cover the loop round-boundary hook | `4131a497` feat(34-03): await an abortable round-boundary hook in the loop |
| 3 | `07ce62be` test(34-03): prove the employee payload is mutation-free | `8900ffb8` feat(34-03): export employee read-only and lead tool allowlists |

Task 1's RED run showed 7 new failures before any production edit; Task 2's showed 4; Task 3's test file was written against the not-yet-exported symbols.

## Known Stubs

None. Every field added here is consumed by the coordinator in plan 34-05; nothing renders an empty placeholder.

## Threat Flags

None beyond the plan's own threat register (T-34-11 through T-34-15, all mitigated). No new network endpoint, auth path, or trust boundary was added.

## Commits

- `17470221` test(34-03): cover read-only policy, persistence opt-out, attribution and usage forwarding
- `df125a6d` feat(34-03): open the runtime seams for AI Office team turns
- `11d426bd` test(34-03): cover the loop round-boundary hook
- `4131a497` feat(34-03): await an abortable round-boundary hook in the loop
- `07ce62be` test(34-03): prove the employee payload is mutation-free
- `8900ffb8` feat(34-03): export employee read-only and lead tool allowlists

## Self-Check: PASSED

All eight files in `files_modified` exist and are reachable from the worktree branch. All six commits are in `git log 2cc78790..HEAD`. The five-file verification set is green and `tsc --noEmit` is clean.
