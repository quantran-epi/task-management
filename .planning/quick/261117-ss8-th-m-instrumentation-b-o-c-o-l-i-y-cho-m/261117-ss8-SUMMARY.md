---
phase: quick-261117-ss8
plan: 01
status: complete
completed: 2026-11-17
---

# Quick Task 261117-ss8: Additive tool-call instrumentation

Every agent/leader team tool call now emits one structured `TOOL` log line with timestamp, identity, kind, duration and outcome, and each intentional abort source stamps the in-flight call so a source can be pinned after the fact. Purely observational: no abort/timeout/retry/tool-result, UI, schema or validation behavior changed.

## Changes made

1. **New runtime-only helper** — `src/services/ai/office/teamRunTelemetry.ts`
   - `ToolCallTelemetryEvent` (explicit `| undefined` optionals per `exactOptionalPropertyTypes`), `ToolCallAbortSource` union (seven values), `parseToolTelemetry` (same semantics as `deriveToolStatus`, 300-char caps), injectable `buildToolTelemetryEvent`, and `emitToolTelemetry` via the existing `structuredLog('TOOL', ...)` substrate. No Dexie/repo/DB import; no new dependency.

2. **Wired at the shared choke point** — `src/services/ai/office/teamRunCoordinator.ts`
   - `buildRuntimeDeps(agentId).onToolEvent`: records one in-flight call per agent, emits a `call` line (`running`), then on `result` emits a line with wall-clock duration and parsed error code/detail and clears the entry. A result with no prior call still logs.
   - `onCompleted`/`onError`: flush a `turn-end` abort line for a still-open call before the existing settle call.
   - `stampAbortSource(agentIds, source)` reads the map and logs only; called beside existing markers at `stopAgent` (`user-per-agent`), `abortAll` (`user-abort`), `dispose` (`team-deleted`/`app-exit`), batch settle deadline (`tool-limit`), and leader-amend cancel/rewrite (`leader-amend`). No in-flight entry means no emission.

3. **UAT abort documented** — `.planning/debug/explore-repo-headless-not-logged-in.md`
   - Append-only section records report `31fc8015` / detail id `f98eec3c`, the prior un-pinnable-source gap, the new structured log contract, all seven abort sources, the additive-only guarantee, and the two separate runs (`cbe1466b` success, `31fc8015` aborted). No historical cause fabricated.

## Task commits

1. **Task 1 — Pure additive telemetry helper** — `57333196` (feat)
2. **Task 2 — Wire telemetry + abort-source stamps** — `76d5b87d` (feat)
3. **Task 3 — Debug doc append-only** — uncommitted docs artifact (orchestrator commits docs in Step 8)

## Verification

- `npx vitest run tests/services/ai/office/teamRunTelemetry.test.ts` — 7/7 pass.
- `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` — focused suite run: 193/194 pass; the single failure was an existing timing-flaky scheduler test (`stops a QUEUED agent…`) that passes in isolation (1/1). All 4 new telemetry regression tests pass. No behavior regressions observed.
- `npx tsc --noEmit` — clean (strict / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`).
- Coordinator diff contains only additive lines; the 3 deletions are the two single-line `onCompleted`/`onError` handlers rewritten into equivalent blocks with the flush added. No existing abort/timeout/retry/status line edited or removed.
- `git diff -- package.json src-tauri/Cargo.toml` — empty (no new dependency).
- `grep "db\.|repo|Dexie" src/services/ai/office/teamRunTelemetry.ts` — no persistence code.
- Full vitest suite intentionally not run (project rule: over an hour).

## Deferred (per PLAN.md)

- DEFER-01: surfacing abort source/error detail in `AgentActivityPanel` (UI/type change).
- DEFER-02: persisting telemetry to Dexie/backup (schema change).
- DEFER-03: changing timeout/retry/transport to explain `31fc8015`.
- DEFER-04: instrumenting non-team chat runs.
- DEFER-05: per-tool-call provider correlation id threading.
