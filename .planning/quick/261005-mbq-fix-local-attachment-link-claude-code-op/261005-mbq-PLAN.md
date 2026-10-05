---
phase: quick
plan: 261005-mbq
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/jira_proxy.rs
  - src-tauri/src/lib.rs
  - src/utils/documentLinks.tsx
  - tests/utils/documentLinks.test.ts
autonomous: true
requirements:
  - QUICK-261005-MBQ
user_setup: []
must_haves:
  truths:
    - "Selecting Claude Code for a local path in Tauri opens Claude Code from Windows cmd.exe at that local path."
    - "The Claude Code local-path flow never routes through Windows Terminal, PowerShell, open::that, or another terminal host on Windows."
    - "The existing File Explorer option remains available and still invokes open_local_path."
    - "Browser fallback still copies a runnable Claude command instead of trying native launch."
  artifacts:
    - path: "src-tauri/src/jira_proxy.rs"
      provides: "Native Tauri command that launches Claude Code at a local path using cmd.exe on Windows"
      contains: "launch_claude_at_local_path"
    - path: "src-tauri/src/lib.rs"
      provides: "Tauri invoke registration for launch_claude_at_local_path"
      contains: "jira_proxy::launch_claude_at_local_path"
    - path: "src/utils/documentLinks.tsx"
      provides: "Local attachment link action wiring for File Explorer and Claude Code choices"
      contains: "launch_claude_at_local_path"
    - path: "tests/utils/documentLinks.test.ts"
      provides: "Targeted regression coverage for Tauri Claude Code local-path invoke"
      contains: "launch_claude_at_local_path"
  key_links:
    - from: "src/utils/documentLinks.tsx"
      to: "src-tauri/src/jira_proxy.rs"
      via: "Tauri invoke command name launch_claude_at_local_path"
      pattern: "launch_claude_at_local_path"
    - from: "src-tauri/src/lib.rs"
      to: "src-tauri/src/jira_proxy.rs"
      via: "invoke_handler registration"
      pattern: "launch_claude_at_local_path"
---

<objective>
Fix local attachment link Claude Code option so desktop Tauri launches Claude Code in Windows Command Prompt (`cmd.exe`) at the selected local path, never Windows Terminal, PowerShell, or another terminal host. Preserve File Explorer option.

Purpose: The user expects local path links to either open in File Explorer or open Claude Code in the selected directory using `cmd.exe` on Windows.
Output: One native Tauri command, one frontend wiring change, and targeted tests.
</objective>

<execution_context>
@C:/Users/quantd/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/quantd/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@src/utils/documentLinks.tsx
@src-tauri/src/jira_proxy.rs
@src-tauri/src/lib.rs
@tests/utils/documentLinks.test.ts
</context>

<source_audit>
| Source | Item | Coverage |
|--------|------|----------|
| GOAL | Fix local attachment link Claude Code option to launch Claude Code in Windows Command Prompt at selected local path | Task 1 creates native cmd.exe launch path; Task 2 wires UI to it |
| GOAL | Never use Windows Terminal, PowerShell, or another terminal host | Task 1 uses fixed `cmd.exe` program and forbids `wt`, `powershell`, `open::that`, and `cmd /c start` for this flow |
| GOAL | Preserve File Explorer option | Task 2 keeps modal File Explorer button and `openLocalPathInExplorer` behavior |
| REQ | QUICK-261005-MBQ | Task 1 and Task 2 |
| RESEARCH | No research phase requested; existing code pattern uses Tauri invoke plus browser clipboard fallback | Task 2 follows existing `documentLinks.tsx` pattern |
| CONTEXT | No CONTEXT.md decisions provided for this quick task | Not applicable |
</source_audit>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add native local-path Claude Code launcher using Windows cmd.exe</name>
  <files>src-tauri/src/jira_proxy.rs, src-tauri/src/lib.rs</files>
  <behavior>
    - Test 1: Windows launch spec for local-path Claude Code uses program `cmd.exe` and args containing `/d`, `/k`, and `claude`.
    - Test 2: Windows launch spec for local-path Claude Code contains no `wt`, `WindowsTerminal`, `powershell`, `pwsh`, `open::that`, or `start` host hop.
    - Test 3: Path resolution trims `file://`, rejects empty/missing paths, uses directory paths directly, and for file paths uses the parent directory as `current_dir`.
  </behavior>
  <action>Add Tauri command `launch_claude_at_local_path(path: String) -> Result<(), String>` in `src-tauri/src/jira_proxy.rs`. Reuse the same file-URI cleanup rules as `open_local_path`. Resolve a working directory before spawning: existing directory stays as-is; existing file uses its parent directory; empty, missing, or parentless paths return a clear error. On Windows, spawn `std::process::Command::new("cmd.exe")` directly with args `/d`, `/k`, `claude` and `.current_dir(working_dir)`. Do not use `open::that`, `wt`, `WindowsTerminal`, `powershell`, `pwsh`, or `cmd /c start` for this local-path Claude flow. Keep existing `launch_claude_terminal` for AI prompt launches unless needed by tests. Add small pure helper(s) so unit tests verify Windows command spec without spawning a terminal. Register `launch_claude_at_local_path` in `src-tauri/src/lib.rs` invoke handler.</action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml launch_claude_local_path --lib</automated>
    <automated>cargo check --manifest-path src-tauri/Cargo.toml</automated>
  </verify>
  <done>Rust command exists, is registered, validates/resolves the local path, and Windows local-path launch uses direct `cmd.exe /d /k claude` with selected path as `current_dir`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire local attachment Claude option to dedicated native launcher</name>
  <files>src/utils/documentLinks.tsx, tests/utils/documentLinks.test.ts</files>
  <behavior>
    - Test 1: In Tauri mode, `launchClaudeAtLocalPath('C:\\Users\\john\\project')` invokes `launch_claude_at_local_path` with `{ path: 'C:\\Users\\john\\project' }`.
    - Test 2: In Tauri mode, local-path Claude launch no longer invokes `launch_claude_terminal` with a shell-built `cd ... && claude` command.
    - Test 3: Browser mode still copies the existing terminal command to clipboard.
    - Test 4: Default local path click still opens choice modal and preserves File Explorer action through `openLocalPathInExplorer`.
  </behavior>
  <action>Update `launchClaudeAtLocalPath` in `src/utils/documentLinks.tsx` so Tauri mode invokes `launch_claude_at_local_path` with the normalized path and shows success text mentioning Command Prompt / Claude Code, not generic Terminal. Keep browser fallback clipboard behavior. Do not change `openLocalPathInExplorer`, `browseLocalFolder`, `browseLocalFile`, or web URL handling. Keep the modal button for `Mở File Explorer`; keep the Claude button but wire it through updated `launchClaudeAtLocalPath`. In `tests/utils/documentLinks.test.ts`, mock `@tauri-apps/api/core`, set `window.__TAURI_INTERNALS__ = {}` for Tauri cases, assert command name/args exactly, and keep existing browser clipboard tests passing.</action>
  <verify>
    <automated>npx vitest run tests/utils/documentLinks.test.ts</automated>
  </verify>
  <done>Local path Claude Code option calls the dedicated native local-path launcher in Tauri, File Explorer option remains unchanged, and browser fallback remains clipboard-only.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| React UI to Tauri IPC | User-controlled local path crosses from WebView into native process |
| Native process to OS process spawn | Native command starts an OS shell process |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261005-MBQ-01 | Elevation of Privilege | `launch_claude_at_local_path` | mitigate | Use fixed `cmd.exe` program and fixed args; pass local path only as `current_dir`, never interpolate path into shell command |
| T-261005-MBQ-02 | Tampering | local path input | mitigate | Trim and normalize `file://`; require path exists; use file parent directory for file paths |
| T-261005-MBQ-03 | Spoofing | terminal host selection | mitigate | Windows branch must not call `wt`, `WindowsTerminal`, `powershell`, `pwsh`, `open::that`, or `cmd /c start` for local-path Claude launch |
| T-261005-MBQ-SC | Tampering | npm/pip/cargo installs | accept | No package installs in this quick task |
</threat_model>

<verification>
Run targeted checks only:
- `npx vitest run tests/utils/documentLinks.test.ts`
- `cargo test --manifest-path src-tauri/Cargo.toml launch_claude_local_path --lib`
- `cargo check --manifest-path src-tauri/Cargo.toml`
</verification>

<success_criteria>
- `launchClaudeAtLocalPath` in Tauri invokes `launch_claude_at_local_path`, not `launch_claude_terminal`.
- Windows native local-path launch uses direct `cmd.exe` with selected path as working directory.
- File Explorer option remains visible in the local path modal and still uses `open_local_path`.
- Targeted Vitest and Cargo checks pass.
</success_criteria>

<output>
Create `.planning/quick/261005-mbq-fix-local-attachment-link-claude-code-op/261005-mbq-SUMMARY.md` when done.
</output>
