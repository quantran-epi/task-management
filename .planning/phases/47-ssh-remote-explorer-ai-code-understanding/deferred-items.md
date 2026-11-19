# Phase 47 deferred / out-of-scope items

## Out-of-scope pre-existing test failures (47-03)

`tests/ai/AIChatDrawerIsolation.test.tsx` has 8 failing cases at HEAD (verified by restoring
HEAD versions of `AIChatDrawer.tsx`, `chatTurnTools.ts`, and `contextGrounding.ts` and running
the file — 8 failed / 5 passed). The failures are `streamSignals`/`streamPayloads` remaining
empty because the drawer send path does not reach the orchestrator loop under the current
grounded-router setup; they predate Phase 47 plan 03 and are unrelated to the remote-target
wiring.

This affects the plan's stated `<verify>` union command, which lists that file. It is NOT fixed
here: per the executor scope boundary, pre-existing failures in unrelated behavior are logged,
not silently patched. The remote-scope wiring from 47-03 is proven instead by deterministic
focused tests that all pass:

- `tests/ai/chatTurnTools.test.ts` — dispatch target precedence, git_read team-adapter routing,
  remote tool gating (git_read advertisement + SSH-ready without global config).
- `tests/ai/chatTurnRemoteTarget.test.ts` — `ChatTurnRequest.remoteTarget` reaches
  `dispatchAiToolCall` options through `executeToolFn`.
- `tests/ai/chatTurnRuntime.test.ts` — remoteTarget forwarded into loop options.
- `tests/ai/contextGrounding.test.ts` — bounded remote target/anchor serializer.
- `tests/services/__tests__/gitRemoteReadPipeline.test.ts` — confinement/escape regressions.

Union of these five focused files: 107/107 pass; `npx tsc --noEmit` clean.

**Follow-up:** repair `AIChatDrawerIsolation.test.tsx` send-path harness in a dedicated fix pass
(e.g. mock `executeGroundedTurn` fallthrough and ensure the loop is reached) — not part of the
read-only remote-target contract.
