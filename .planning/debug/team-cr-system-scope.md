---
status: fixing
trigger: "AI chat team không nhận system liên kết gián tiếp qua CR; agent dừng giữa chừng với stopped/tool-limit."
created: 2026-11-17
updated: 2026-11-17
---

## Current Focus

hypothesis: Confirmed for issue 2 — a hard 50-round default ceiling in the orchestrator loop cut long evidence-gathering turns. Issue 1 (CR -> system) is a separate scope-resolution gap, not yet fixed.
test: Remove the default ceiling; keep an opt-in one only when a caller passes it.
expecting: A turn runs until the model stops calling tools or the user aborts.
next_action: Verify the flaky AIChatDrawer suite is not made worse by the uncapped loop.

## Symptoms

expected: Group linked to CR EN-STRD-AACCT, itself linked to auto-accounting-starter (AACCT-STTR), should expose that system for branch code reading. A long repo-reading turn should finish.
actual: Leader reported only the directly linked CR and asked the user to link AACCT-STTR directly. After a direct link the employee ran, used explore_repo then git_read, and stopped with `stopped/tool-limit`; leader reported the assignment incomplete with `returnedCount: 0`.
error: Leader text: "Vidic dừng giữa chừng do chạm giới hạn lượt gọi công cụ (stopped/tool-limit)."
timeline: Unknown; the ceiling is long-standing (`DEFAULT_MAX_TOOL_ROUNDS = 50`).
repro: Assign a broad code-reading task to an employee; the turn exhausts 50 tool rounds before writing any document.

## Constraints

Tauri-only runtime. Grounded synthesis flow (AI chat panel) must stay unchanged. Analysis mode and AI chat team must have no tool/loop ceiling. Preserve abort, provider errors, timeouts, permissions.

## Eliminated

- hypothesis: The employee simply never used `explore_repo`. Eliminated by the user's experiment: it did use `explore_repo`, then `git_read`, and still hit the limit.
- hypothesis: `tool-limit` means git access was refused. Eliminated: `tool-limit` is a loop-round outcome, independent of `resolveGitRepo` refusals (`SYSTEM_NOT_LINKED` / `NO_LINKED_REPO`).

## Evidence

- `src/services/ai/aiOrchestratorLoop.ts:48` — `export const DEFAULT_MAX_TOOL_ROUNDS = 50;`
- `src/services/ai/aiOrchestratorLoop.ts:387-390` — `if (lastHadToolCalls && loopCount >= maxLoops) { loopLimitReached = true; break; }`
- `src/components/ai/runtime/chatTurnRuntime.ts:235-238` — the runtime defaulted `maxToolRounds` to 50 and always passed `maxLoops`.
- `src/components/ai/runtime/chatTurnRuntime.ts:488-495` — maps `loopLimitReached` to phase `tool-limit`.
- `src/services/ai/office/teamRunCoordinator.ts:404,412` — `'tool-limit': 'error'` / `'tool-limit': 'tool-limit'`, so the ledger records `stopped` + `tool-limit`.
- `src/services/ai/office/teamRunCoordinator.ts:416-417` — `STOPPED_REPORT_COPY` is the exact bubble the user saw.
- `src/services/ai/office/teamRunCoordinator.ts:2073` and `:2254` — leader and employees share the same `registry.get(...).start(request)`, so both were capped.
- `src/services/ai/office/teamTools.ts:1082-1146` — `resolveGitRepo` reads ONLY direct `link.itemType === 'system'` links; a system reached through a linked CR is never considered.
- `src/services/ai/office/teamPrompts.ts:419-431` — the leader's `[MỤC LIÊN KẾT]` block lists direct links only.
- `src/services/ai/groundedSynthesis.ts:429-430` — the grounded flow has its own unrelated bounds (`MAX_RECORD_RETRIES`, `MAX_DIGEST_BATCHES`) and does not use `runAiOrchestratorLoop`.

## Resolution

root_cause:
Issue 2 (fixed): `runAiOrchestratorLoop` defaulted `maxLoops` to a hard 50 and `chatTurnRuntime` always forwarded that default, so any turn needing more than 50 tool rounds was terminated with `loopLimitReached`, surfaced as `stopped/tool-limit`. Leader and employees share this path, so both were affected.
Issue 1 (open): group scope resolution is direct-link only — `resolveGitRepo` and the leader's linked-items prompt never expand a linked CR to its `targets`.

fix:
- `src/services/ai/aiOrchestratorLoop.ts`: removed `DEFAULT_MAX_TOOL_ROUNDS`; `maxLoops` is now `Number.POSITIVE_INFINITY` unless the caller passes a finite positive value.
- `src/components/ai/runtime/chatTurnRuntime.ts`: `maxToolRounds` is opt-in; the runtime omits `maxLoops` entirely when unset. Added `TOOL_LIMIT_UNCAPPED_MESSAGE` for the defensive branch where an injected loop reports a limit the runtime never set.
- `src/components/ai/AiChatWidget.tsx`: renders the tool-limit alert for both capped and uncapped cases.
- Tests updated: `tests/services/ai/aiOrchestratorLoop.test.ts` (ceiling only when requested; 60 rounds complete when uncapped), `tests/ai/chatTurnRuntime.test.ts` (no `maxLoops` key when unset).

verification:
`npx tsc --noEmit` clean. `npx vitest run tests/services/ai/aiOrchestratorLoop.test.ts tests/ai/chatTurnRuntime.test.ts tests/ai/useChatTurn.test.tsx tests/ai/AiChatWidget.test.tsx` → 4 files, 115 tests passed.
`tests/ai/AIChatDrawer.test.tsx` is flaky on this machine: a different subset fails on each run. Clean A/B (2 runs each, swapping only these three source files): unmodified HEAD → 5 and 2 failures; patched → 4 and 5 failures. Both are random subsets and the ranges overlap, so no evidence that removing the default ceiling causes the failures; the suite is independently unstable here. The four deterministic files covering the change all pass (115/115).

files_changed:
- src/services/ai/aiOrchestratorLoop.ts
- src/components/ai/runtime/chatTurnRuntime.ts
- src/components/ai/AiChatWidget.tsx
- tests/services/ai/aiOrchestratorLoop.test.ts
- tests/ai/chatTurnRuntime.test.ts
