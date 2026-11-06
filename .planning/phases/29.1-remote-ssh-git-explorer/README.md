# Phase 29.1: Remote SSH Git Explorer & Headless Claude Code Trace Flow

## Context & Architecture
Provide an IDE-grade Remote File Explorer on Workbench Left Stripe (below Diagram Explorer) that connects over SSH, lazy-loads git directory trees and views file contents strictly read-only by branch without altering the remote working tree, triggers Claude Code headless tracing over targeted folders/files, renders Mermaid sequence/flow diagrams, and saves them directly into TaskMate's Diagram Studio.

### Critical Invariants
1. **100% Read-Only Remote Git Operations**: No `git checkout`, no changing index/working tree. Use `git ls-tree` for directory listing and `git show <ref>:<path>` for file content retrieval.
2. **Claude Code Headless Harness**: TaskMate passes targeted folder/file context, selected model, and custom prompt to remote `claude` CLI via SSH exec channel.
3. **Mermaid Diagram Extraction**: Extract Mermaid syntax inside ````mermaid blocks from Claude Code output and provide direct saving to Dexie diagrams.
4. **Clean ExpUI Integration**: Left Stripe icon below Diagram Explorer, docked Left Tool Window panel, and center editor tabs for remote file viewing.

## Wave Breakdown
- **Wave 1 (29.1-01)**: Remote git read-only tree service (`ls-tree`, `show`), branch switcher, and Claude Code headless SSH execution runner.
- **Wave 2 (29.1-02)**: `RemoteFileExplorer` Left Tool Window, Stripe integration, branch selector, and read-only Center Editor Tab.
- **Wave 3 (29.1-03)**: Trace Flow modal, Claude model selection, Mermaid block extractor, live diagram preview, and Diagram Studio save bridge.
