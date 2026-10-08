---
phase: quick-261008-b3b
plan: 01
status: complete
date: 2026-10-08
subsystem: settings-and-agents
tags:
  - ghost-dev
  - claude-code
  - mcp
  - windows-cmd
  - settings
dependency_graph:
  requires: []
  provides:
    - claude-path-form-binding
    - windows-cmd-batch-spawning
    - mcp-config-card-settings
    - streamlined-mcp-modal
  affects:
    - src/components/settings/GhostDevConfigCard.tsx
    - src-tauri/src/agent_manager.rs
    - src/components/settings/McpConfigCard.tsx
    - src/views/SettingsView.tsx
    - src/App.tsx
    - src/components/ai/McpSettingsModal.tsx
    - src/components/ai/AIChatDrawer.tsx
    - src/components/shell/AppShell.tsx
actuals:
  tasks: 3
  commits: 3
---

# Quick Plan 261008-b3b: Fix Claude Executable Picker, Windows Cmd Execution, and MCP Settings Card Summary

## Substantive One-liner
Fixed claudePath input binding in GhostDevConfigCard, added Windows batch execution via `cmd.exe /c` with `CREATE_NO_WINDOW` in Rust agent_manager, and moved MCP server management to SettingsView with a streamlined toggle interface in AIChatDrawer.

## Key Changes
1. **GhostDevConfigCard Form Item Binding**:
   - Removed `name="claudePath"` from the outer Form.Item wrapping `Space.Compact`.
   - Nested a `Form.Item name="claudePath" noStyle` directly around the inner Input inside `Space.Compact`.
   - Enabled typing, pasting (.cmd paths), and file browsing (`browseLocalFile`) to update form state and persist to localStorage on save.
   - Added targeted test in `tests/components/settings/GhostDevConfigCard.test.tsx`.

2. **Windows .cmd/.bat & Bare 'claude' Spawning in Rust agent_manager**:
   - Added helper functions `is_windows_batch_script`, `resolve_agent_command_parts`, and `build_agent_tokio_command`.
   - On Windows, batch scripts (`.cmd`, `.bat`, or bare `claude`) are spawned via `cmd.exe` with arguments `["/c", program, ...args]` and `CREATE_NO_WINDOW`.
   - Native executables and Unix systems spawn the program directly without shell wrapping.
   - Master and worker agent spawns both use `build_agent_tokio_command` with piped stdin, stdout, and stderr for stream-json redirection.
   - Added Rust unit tests verifying batch script detection and argument resolution across Windows and Unix.

3. **McpConfigCard in SettingsView & Streamlined MCP Modal in AIChatDrawer**:
   - Created `src/components/settings/McpConfigCard.tsx` with full CRUD (Add, Edit, Delete, Test connection, Enable/Disable toggle) and HTTP/HTTPS URL validation.
   - Mounted `McpConfigCard` in `SettingsView.tsx` under the `ai` tab alongside `GhostDevConfigCard` and `NineRouterConfigCard`.
   - Updated `App.tsx` and `SettingsView.tsx` to handle `params.tab`, allowing navigation to `#/settings?tab=ai`.
   - Streamlined `McpSettingsModal.tsx` in `AIChatDrawer` to a lightweight toggle-only list with a direct link/button to Settings.
   - Added component test suite in `tests/components/settings/McpConfigCard.test.tsx`.

## Deviations from Plan
None - plan executed exactly as written.

## Verification
- Targeted vitest tests passed:
  - `npx vitest run tests/components/settings/GhostDevConfigCard.test.tsx` (3 tests passed)
  - `npx vitest run tests/components/settings/McpConfigCard.test.tsx` (4 tests passed)
- Targeted cargo tests passed:
  - `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_manager` (4 tests passed)
- TypeScript typecheck passed:
  - `npx tsc --noEmit` (0 errors)

## Commits
- `2fac7be`: fix(settings): fix claudePath Form.Item binding in GhostDevConfigCard
- `4c54001`: feat(ghost-dev): support Windows cmd.exe /c execution for batch scripts in agent_manager
- `68caa53`: feat(settings): move MCP server management to SettingsView and streamline AI chat drawer

## Self-Check: PASSED
- [x] src/components/settings/GhostDevConfigCard.tsx exists and is modified
- [x] src-tauri/src/agent_manager.rs exists and is modified
- [x] src/components/settings/McpConfigCard.tsx exists
- [x] src/views/SettingsView.tsx mounts McpConfigCard
- [x] tests/components/settings/GhostDevConfigCard.test.tsx passes
- [x] tests/components/settings/McpConfigCard.test.tsx passes
- [x] cargo test --manifest-path src-tauri/Cargo.toml --lib agent_manager passes
