---
phase: 43-repo-reading-that-scales-grep-paged-read-and-remote-headless
plan: 03
subsystem: services/ai/office
tags: [agent-runtime, compaction, context-window, team-turns]
dependency_graph:
  requires:
    - ChatTurnRequest.contextWindowTokens (chatTurnRuntime.ts:72)
    - getNineRouterConfig().contextWindowTokens (nineRouterTokenService.ts:125)
  provides:
    - "TeamRunCoordinatorOptions.contextWindowTokens"
    - "context window forwarded into both employee and lead turn requests"
  affects:
    - src/services/ai/aiOrchestratorLoop.ts (tokenBudget now non-zero for team turns)
    - src/components/ai/runtime/chatTurnRuntime.ts (compaction reachable)
tech_stack:
  added: []
  patterns:
    - "conditional spread for an optional request field under exactOptionalPropertyTypes"
key_files:
  created: []
  modified:
    - src/services/ai/office/teamRunCoordinator.ts
    - src/components/ai/office/TeamWorkspace.tsx
    - tests/services/ai/office/teamRunCoordinator.test.ts
decisions:
  - "the window is read once at coordinator construction from getNineRouterConfig — no new state, prop, or settings row"
  - "both turn requests use the same `typeof === 'number' && > 0` guard, so a 0 or undefined option is omitted rather than sent"
metrics:
  duration: ~15 min
  completed: 2026-11-16
---

# Phase 43 Plan 03: Team turns carry the context window — Summary

Team turns now pass the provider context window into the chat-turn runtime, so `tokenBudget > 0` and in-loop compaction actually runs instead of the turn overflowing and discarding every tool result it collected.

## What was built

**Coordinator option** — `src/services/ai/office/teamRunCoordinator.ts`

- `TeamRunCoordinatorOptions` gained `contextWindowTokens?: number | undefined`, next to `apiKey`, documented with the failure it prevents.
- `startEmployeeTurn`'s `request` literal spreads it after `analysisMode: true`:
  `...(typeof options.contextWindowTokens === 'number' && options.contextWindowTokens > 0 ? { contextWindowTokens: options.contextWindowTokens } : {})`
- `startLeadTurn` carries the identical spread after its `analysisMode: true`. The conditional shape matters: `exactOptionalPropertyTypes` rejects an explicit `undefined`.

**Wiring** — `src/components/ai/office/TeamWorkspace.tsx`

- The existing construction effect already awaited `getNineRouterConfig(db)` into `config`; `contextWindowTokens: config.contextWindowTokens` is passed straight into `createTeamRunCoordinator({...})` after `apiKey`. No new state, prop, or settings control — `getNineRouterConfig` always returns a positive number (`DEFAULT_CONTEXT_WINDOW_TOKENS` when unset).

**Tests** — `tests/services/ai/office/teamRunCoordinator.test.ts`

- `HarnessOptions` gained a `contextWindowTokens` passthrough into the harness coordinator.
- New describe `context window reaches the loop (Phase 43 D-04)`:
  - `forwards the configured window into both the employee and the lead turn` — a recording `runLoop` captures `AiOrchestratorLoopOptions`; an employee mention turn and a lead turn both report `contextWindowTokens === 128000`.
  - `omits the field entirely when no window is configured` — asserts `'contextWindowTokens' in options` is `false` for every recorded loop, pinning the conditional spread rather than an `undefined` value.

## Deviations from Plan

None - plan executed exactly as written. One mechanical correction during typecheck: the new test cases destructured `skills` from `Harness`, which exposes the singular `skill`; changed to `skill` plus `skills: [skill]` in the construction call.

## Verification

- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` → **181/181 pass** (including the 2 new cases).
- `grep -c "contextWindowTokens" src/services/ai/office/teamRunCoordinator.ts` → 5 (option declaration, doc mention, two spreads, plus the `options.` reads within them).
- `grep -n "contextWindowTokens" src/components/ai/office/TeamWorkspace.tsx` → line 313, the construction argument.

## Self-Check: PASSED

- `src/services/ai/office/teamRunCoordinator.ts` — `contextWindowTokens` in `TeamRunCoordinatorOptions` and in both request literals.
- `src/components/ai/office/TeamWorkspace.tsx` — `contextWindowTokens: config.contextWindowTokens` present.
- Commits `3a3e8d7c`, `1909734a` present.
