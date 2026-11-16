---
status: verifying
trigger: "Subsystem path input empty after picker; SSH terminal ignores subsystem cwd; system type labels differ; Search Everywhere actions silently do nothing."
created: 2026-11-16
updated: 2026-11-16
---

## Current Focus

hypothesis: confirmed form bindings, unused backend cwd, and missing action consumers
next_action: native Tauri SSH UAT — reopen subsystem terminal and verify pwd; Cargo compilation blocked by offline cache

## Symptoms

expected: Selected subsystem path appears immediately in input; terminal opens in subsystem directory; system type option and selected label match; Search Everywhere actions execute or clearly explain unavailability.
actual: Path saves correctly but input stays empty; SSH terminal remains in /home/quantd despite printed cd command; Frontend UI option becomes UI after selection; some search actions have no visible effect.
errors: User SSH log showed cd before first shell prompt; subsequent pwd remained /home/quantd.
timeline: unknown
repro: Create subsystem and choose directory; open terminal from subsystem and run pwd; choose Frontend UI system type; invoke Search Everywhere actions.

## Constraints

- Existing worktree only; preserve all preexisting changes.
- Focused tests only; no full suite. Tauri only, no PWA/GitHub Pages work.
- No commits or pushes requested or made.

## Evidence

- Form.Item named remoteRepoPath wrapped Space.Compact, so Form injected value/onChange into layout wrapper instead of Input.
- AutoComplete uses option value as text; persisted UI therefore displayed instead of Frontend UI.
- RemoteTerminalPanel omitted workingDir and sent cd keystrokes after connection; backend parameter was named _working_dir and unused. Shell startup can discard early input. PTY event listeners were installed after startup, also risking lost prompts/errors.
- task.create and timer.toggle emitted events with no consumers anywhere in app.
- Search results captured registry without subscribing; existing useSyncExternalStore hook returned a fresh array every read and required stable snapshot before use.
- Search executed actions before closing itself, closing a Search Everywhere action immediately after reopening.
- Alt+M advertised but not handled; Remote Git Explorer stripe duplicated Notifications Alt+4; Alt+7/8 stripe labels had no global handlers.
- First focused run: 32 passed, 2 failed due to test mock returning [] for type options and synchronous Disconnected assertion after added listener awaits. Corrected mock and async assertion; rerun passed.
- Second run: 43 tests across 7 files passed. TypeScript caught unused React test import; removed and subsequent npx tsc --noEmit passed.
- cargo test --manifest-path src-tauri/Cargo.toml --lib ssh_pty_service::tests::working_directory_is_quoted_before_shell_starts --offline blocked before compilation: missing openssl-src dependency in local cache.
- Compiled exact shell_start_command helper and its cfg(test) module with rustc --test, without Cargo dependencies: 2/2 passed. Includes real /bin/sh process checking cwd path with spaces, apostrophe, and literal $(false). Host login profile emitted unrelated awk warning; process/test succeeded.
- Final focused run: 45/45 tests passed across 7 files; npx tsc --noEmit and git diff --check both passed (combined command exit 0). Non-failing jsdom warnings for canvas/getComputedStyle remain. No native Tauri SSH connection attempted.

## Resolution

root_cause: incorrect Ant Design field binding/display mapping; ignored backend workingDir and early shell input race; event-only actions lacked consumers and feedback; registry snapshot/lifecycle and shortcut inconsistencies.
fix: Bind Input through nested noStyle Form.Item; map type values to labels for display while persisting canonical codes; pass workingDir to Rust and use safely quoted SSH exec cd before login shell; subscribe to PTY events before start; directly open task/diagram tabs; consume timer action in TasksView with selection feedback; issue quick-add focus requests and explain missing CR; stable reactive action snapshot; close search before action execution; feedback on unknown/unavailable/reload actions; align advertised shortcuts and tool-window actions.
verification: Focused Vitest, TypeScript, diff whitespace checks; isolated Rust helper and real shell tests. Full Cargo compilation blocked by unavailable offline dependency. Native Tauri SSH remains unverified.
files_changed:
  - src/components/systems/SystemModal.tsx
  - src/components/systems/SystemModal.test.tsx
  - src-tauri/src/ssh_pty_service.rs
  - src/views/TasksView.tsx
  - src/views/__tests__/TasksViewActions.test.tsx
  - src/workbench/EditorArea.tsx
  - src/workbench/WorkbenchLayout.tsx
  - src/workbench/actions/actionRegistry.ts
  - src/workbench/hooks/useGlobalKeymap.ts
  - src/workbench/search/SearchEverywhereModal.tsx
  - src/workbench/search/__tests__/SearchEverywhereModal.test.tsx
  - src/workbench/toolwindows/RemoteTerminalPanel.tsx
  - src/workbench/__tests__/RemoteTerminal.test.tsx
  - src/workbench/__tests__/actionRegistry.test.ts
