---
status: complete
date: 2026-10-09
slug: 261009-exp-fix-ai-export-dropdown-metrics-save-as
---

# Quick Task Summary: Fix AI Export Dropdown, Execution Metrics, and Save As Location Picker

## Delivered Changes
1. **Fix AI Export Dropdown in ChatMessageBubble (`src/components/ai/ChatMessageBubble.tsx`)**:
   - Added `getPopupContainer={(node) => node.parentElement || document.body}` and `overlayStyle={{ zIndex: 1500 }}` to `<Dropdown>` so the export menu renders above `AIChatDrawer` (`z-index: 1200`) instead of being trapped behind it.
   - Connected export menu actions to `saveFileWithPicker` so files can be saved with location browsing on Windows/Tauri and Web.

2. **Total Execution Duration & Token Usage Metrics**:
   - Extended `ChatMessage` model (`src/types/models.ts`), Dexie repo (`src/db/repositories/chatRepo.ts`), and backup schemas (`src/validation/backupSchemas.ts`) to store `durationMs?: number` and `tokenUsage?: ChatTokenUsage`.
   - Updated `src/services/ai/nineRouterClient.ts` to request `stream_options: { include_usage: true }` and parse usage chunks (`promptTokens`, `completionTokens`, `totalTokens`).
   - Updated `src/components/ai/AIChatDrawer.tsx` to measure turn execution time and capture token usage on SSE stream completion.
   - Updated `ChatMessageBubble.tsx` to display duration tag (`⏱ 2.4s`) and token usage tag (`🪙 1,240 tokens` with prompt/completion breakdown tooltip) in message footer.

3. **AI File Generation Save As & Location Picker**:
   - Added `save_file_dialog` Tauri command in Rust (`src-tauri/src/jira_proxy.rs`, `src-tauri/src/lib.rs`) using native `rfd::FileDialog`.
   - Added `saveFileWithPicker` utility (`src/utils/fileExport.ts`) with native Tauri file dialog support, browser `window.showSaveFilePicker()` support, and graceful fallback.
   - Updated `aiTools.ts` to stop auto-downloading generated files in the background (`autoDownload: false`).
   - Rendered an interactive File Download card in assistant chat messages with icon, filename, size, and "Lưu tệp (Save As)" button to browse destination folder.

## Verification
- `npx tsc --noEmit`: 0 type errors.
- `npx vitest run src/utils/__tests__/fileExport.test.ts src/services/ai/__tests__/fileGenerationTool.test.ts src/utils/__tests__/pptxExport.test.ts`: All 17 tests passed.
