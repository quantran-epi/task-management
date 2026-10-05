---
phase: quick
plan: 261005-fxw
type: execute
prefix: quick-261005-fxw
wave: 1
depends_on: []
files_modified:
  - src-tauri/capabilities/default.json
  - src/hooks/useLocalSqlitePersistence.ts
  - tests/tauriConfig.test.ts
autonomous: true
requirements: [DESKTOP-WINDOW-CLOSE-01]

must_haves:
  truths:
    - "Desktop capability permits window destroy action via core:window:allow-destroy"
    - "Local SQLite persistence close-request handler catches flush errors without blocking or crashing window close lifecycle"
  artifacts:
    - path: "src-tauri/capabilities/default.json"
      provides: "Tauri default capabilities including core:window:allow-destroy"
    - path: "src/hooks/useLocalSqlitePersistence.ts"
      provides: "Defensive close request listener wrapping flushLocalSqliteNow in try/catch"
    - path: "tests/tauriConfig.test.ts"
      provides: "Automated assertion verifying core:window:allow-destroy is declared in default.json capabilities"
  key_links:
    - from: "src/hooks/useLocalSqlitePersistence.ts"
      to: "src/services/localSqlitePersistence.ts"
      via: "flushLocalSqliteNow wrapped in try/catch inside onCloseRequested handler"
      pattern: "try\\s*\\{\\s*await flushLocalSqliteNow\\(db\\);\\s*\\}\\s*catch"
    - from: "src-tauri/capabilities/default.json"
      to: "Tauri runtime window management"
      via: "core:window:allow-destroy permission"
      pattern: "core:window:allow-destroy"
---

<objective>
Fix desktop window close failure in Tauri by adding `core:window:allow-destroy` permission and defensively handling errors during SQLite flush on window close.

Purpose: Prevent Tauri window close failures when windows are destroyed or when flush errors throw inside the onCloseRequested callback.
Output: Updated `src-tauri/capabilities/default.json`, resilient `src/hooks/useLocalSqlitePersistence.ts`, and capability unit test in `tests/tauriConfig.test.ts`.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src-tauri/capabilities/default.json
@src/hooks/useLocalSqlitePersistence.ts
@tests/tauriConfig.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add core:window:allow-destroy capability and verify config</name>
  <files>src-tauri/capabilities/default.json, tests/tauriConfig.test.ts</files>
  <action>
    Add "core:window:allow-destroy" to the "permissions" array in "src-tauri/capabilities/default.json" alongside "core:window:allow-close".
    In "tests/tauriConfig.test.ts", import defaultCapabilities from "../src-tauri/capabilities/default.json" and add an assertion that default capabilities include "core:window:allow-destroy" and "core:window:allow-close".
  </action>
  <verify>
    <automated>npm test -- tests/tauriConfig.test.ts</automated>
  </verify>
  <done>src-tauri/capabilities/default.json contains "core:window:allow-destroy" and tests/tauriConfig.test.ts verifies it passes.</done>
</task>

<task type="auto">
  <name>Task 2: Wrap flushLocalSqliteNow in try/catch on window close request</name>
  <files>src/hooks/useLocalSqlitePersistence.ts</files>
  <action>
    Inside "src/hooks/useLocalSqlitePersistence.ts", inspect the `onCloseRequested` callback.
    Wrap the `await flushLocalSqliteNow(db)` call inside a `try { ... } catch (err) { console.warn('Local SQLite close flush failed:', err); }` block.
    This guarantees that any SQLite flush failure (e.g. database unconfigured, closed, or throwing) during window close request is safely handled and does not reject or prevent window closure.
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>flushLocalSqliteNow is wrapped in try/catch inside onCloseRequested, preventing unhandled rejections on desktop window close, and TypeScript build passes cleanly.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Desktop Window Lifecycle -> Local SQLite persistence | Close events trigger final persistence flush |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Denial of Service | useLocalSqlitePersistence | medium | mitigate | Catch flush errors inside onCloseRequested so window close does not hang or crash application |
| T-quick-02 | Elevation of Privilege | src-tauri/capabilities/default.json | low | accept | core:window:allow-destroy is standard Tauri v2 capability scoped to internal desktop window destruction |
| T-quick-SC | Tampering | npm packages | high | mitigate | package-legitimacy gate + no new packages added |
</threat_model>

<verification>
1. `npm test -- tests/tauriConfig.test.ts` passes.
2. `npm run build` succeeds without type or bundle errors.
</verification>

<success_criteria>
- `core:window:allow-destroy` added to `src-tauri/capabilities/default.json`.
- `flushLocalSqliteNow(db)` wrapped in `try/catch` inside `src/hooks/useLocalSqlitePersistence.ts`.
- Tests and build pass cleanly.
</success_criteria>

<output>
Create `.planning/quick/261005-fxw-fix-desktop-window-close-failure-by-addi/quick-261005-fxw-SUMMARY.md` when done.
</output>
