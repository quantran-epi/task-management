# Quick Task 261004-afr: AI Chat Local File Reference and Reading

## Goal
Implement an efficient, Claude-Code-style local file reference and reading capability for the AI chat drawer in the Tauri desktop app, including path autocompletion, file picker button, line-numbered paged reading, and an on-demand AI tool.

## Requirements
1. **Rust Backend Commands (`src-tauri/src/`)**:
   - `complete_local_path`: Autocomplete directory and file paths matching user input with `~` expansion, returning `{ path, name, is_dir }`.
   - `read_local_file_slice`: Efficiently read a slice of a file (`offset`, `limit` default 500 lines) with line numbers (`cat -n` style), truncation flags, and size safety guards.
2. **AI Tool Harness (`src/services/ai/`)**:
   - Add `read_file` function tool to `aiTools.ts` so LLM reads file content on-demand with paging (`offset`, `limit`) instead of blowing up context window eagerly.
   - Provide structured output: `{ filePath, linesRead, truncated, content, note }`.
3. **Chat Input UI (`src/components/ai/ChatInputBar.tsx`)**:
   - Add file picker button (Paperclip icon) calling native file chooser (`select_local_file`).
   - Support `@file:` mention prefix with real-time Tauri autocomplete suggestions.
4. **Verification & Testing**:
   - Vitest unit tests for file path parsing, tool definition, and autocomplete integration.
   - Ensure clean TypeScript build and backwards-compatibility for Web/PWA mode.

## Tasks
- [ ] Task 1: Tauri Rust backend commands for path autocomplete & paged file reading (`src-tauri/src/jira_proxy.rs`, `src-tauri/src/lib.rs`).
- [ ] Task 2: AI `read_file` on-demand tool definition and executor (`src/services/ai/aiTools.ts`).
- [ ] Task 3: ChatInputBar UI: `@file:` autocomplete prefix & paperclip file picker button (`src/components/ai/ChatInputBar.tsx`).
- [ ] Task 4: Unit tests & verification (`src/services/ai/__tests__/fileReference.test.ts`).
