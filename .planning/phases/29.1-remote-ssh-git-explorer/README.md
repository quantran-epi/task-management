# Phase 29.1: Remote SSH Git Explorer & Headful Claude Code Terminal Flow

## Context & Architecture
Provide an IDE-grade Remote File Explorer on Workbench Left Stripe (below Diagram Explorer) that connects over SSH, sets repository working directory, lazy-loads git directory trees and views file contents strictly read-only by branch (`git ls-tree`, `git show`), embeds an interactive xterm.js remote terminal in Workbench bottom panel connected via Tauri SSH PTY streaming session, allowing the user to run headful `claude` CLI or any shell commands in the repository working directory, inspect generated files/diagrams in Explorer or terminal, and bridge Mermaid diagrams to Diagram Studio.

### Critical Invariants
1. **100% Read-Only Remote Git Operations for Explorer**: No `git checkout`, no changing index/working tree in the Explorer view. Use `git ls-tree` for directory listing and `git show <ref>:<path>` for file content retrieval.
2. **Headful Claude Code via Remote SSH PTY**: Full interactive terminal session using `xterm.js` and Tauri SSH PTY streaming channel (`request_pty`), supporting user prompts, cursor navigation, ANSI escape sequences, and arbitrary commands in the repo directory.
3. **Repository Working Directory Anchor**: When user opens a remote repo, working directory is anchored to that repository root for both Explorer and Terminal.
4. **Mermaid & File Inspection Bridge**: User can open any generated files in the Explorer, inspect them in read-only editor tabs, and copy/save Mermaid blocks to Diagram Studio.
5. **Clean ExpUI Integration**: Left Stripe icon below Diagram Explorer, docked Left Tool Window panel, read-only center editor tabs, and docked Bottom Terminal panel.

## Wave Breakdown
- **Wave 1 (29.1-01)**: Remote git read-only tree service (`ls-tree`, `show`), branch switcher, and Tauri SSH PTY streaming backend + xterm.js terminal integration service.
- **Wave 2 (29.1-02)**: `RemoteFileExplorer` Left Tool Window, Stripe integration, branch selector, and read-only Center Editor Tab.
- **Wave 3 (29.1-03)**: Workbench Bottom Terminal Tool Window with SSH PTY session, Claude Code interactive workflow, and Diagram Studio bridge.
