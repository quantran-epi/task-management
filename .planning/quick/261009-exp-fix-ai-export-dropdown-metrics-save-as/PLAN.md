# Quick Plan: Fix AI Export Dropdown, Display Duration/Tokens, and Save As Location Picker

## Problem Statement
1. In `AIChatDrawer`, clicking "Xuất tệp" (Export file) button on an assistant message bubble does not show any dropdown menu because `AIChatDrawer` has `z-index: 1200` while Ant Design's `Dropdown` default z-index is `1050`, causing the menu to be mounted behind the drawer.
2. Users cannot see the total execution time (latency) and token usage (prompt, completion, total) for AI responses.
3. When AI generates files via `generate_file` / `generate_pptx`, files are auto-downloaded silently in the background, only returning a text confirmation to the user without a clickable file card or an option to browse the save location.

## Execution Steps

### Step 1: Fix AI Export Dropdown Visibility
- In `src/components/ai/ChatMessageBubble.tsx`:
  - Add `getPopupContainer={(node) => node.parentElement || document.body}`
  - Add `overlayStyle={{ zIndex: 1500 }}` to `<Dropdown>`
  - Ensure export menu items work with proper placement.

### Step 2: Total Execution Time & Token Usage
- Update `ChatMessage` in `src/types/models.ts` and Dexie schema / backup schemas to optionally store:
  - `durationMs?: number`
  - `tokenUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }`
- Update `nineRouterClient.ts`:
  - Add `stream_options: { include_usage: true }` in `streamChatEvents`
  - Yield `{ type: 'usage', usage: { ... } }` when returned in SSE chunks or non-streaming responses
- Update `AIChatDrawer.tsx`:
  - Track `startTime = Date.now()` when prompt is submitted
  - Capture duration and usage, persist into assistant `ChatMessage` via `updateChatMessage` or `addChatMessage`
- Update `ChatMessageBubble.tsx`:
  - Display execution time chip (e.g., `⏱ 2.4s`) and token usage chip (e.g., `🪙 1,240 tokens` with tooltip) in message footer next to timestamp.

### Step 3: AI File Generation with Download Link & Save Location Picker
- In `src-tauri/src/jira_proxy.rs` (or dedicated module) and `src-tauri/src/lib.rs`:
  - Add `save_local_file_bytes(default_name: String, filter_name: String, extensions: Vec<String>, data_base64: String) -> Result<Option<String>, String>` using `rfd::FileDialog::new().set_file_name(&default_name).save_file()`
- In `src/utils/fileExport.ts`:
  - Add `saveFileWithPicker(filename: string, blob: Blob)` supporting:
    - Native Tauri `save_local_file_bytes` when `isTauriApp()`
    - Browser `window.showSaveFilePicker()` when available
    - Standard `downloadBlob` fallback
- In `src/services/ai/aiTools.ts`:
  - Update `generate_file` and `generate_pptx` so they do NOT auto-download in the background (`autoDownload: false`)
  - Return structured metadata including download ready payload
- In `ChatMessageBubble.tsx` / `ChatMessageList.tsx`:
  - Render an interactive File Download Card whenever an AI message contains generated file metadata, with "Lưu tệp (Save As)" button allowing browsing location.

### Step 4: Verification
- Run targeted Vitest tests for file export and AI tools.
