# Quick Plan: Fix AI File Download, Add Browser Download Action, and Fix Metric Tooltip Z-Index

## Problem Statement
1. In `AIChatDrawer`, downloading generated files or exporting messages uses `saveFileWithPicker` which invokes `showSaveFilePicker`. On certain browsers or platforms, users hit permission errors when saving, and there is no direct browser download button (`downloadBlob`) available as an alternative.
2. In assistant messages, hovering over duration time (`durationMs`) or token usage displays a Tooltip that is mounted behind or hidden by `AIChatDrawer` because `AIChatDrawer` has `zIndex: 1200` while Ant Design's `Tooltip` defaults to `zIndex: 1070`.
3. OS notification headers in macOS/Windows may still display "PlannerMate" if the user has an existing notification permission or app registration from before the app was renamed to TaskMate.

## User Requirements
- Provide an extra feature button to trigger direct browser download for BOTH:
  1. Generated files rendered in AI chat response (file cards)
  2. The export file tool in AI response action bar ("Xuất tệp")
- Fix duration time and token usage tooltips so they do not hide behind the drawer.

## Execution Steps

### Step 1: Add Direct Browser Download to Generated File Cards in `ChatMessageBubble.tsx`
- In `ChatMessageBubble.tsx`:
  - Update `handleDownloadGeneratedFile(file, directDownload = false)`:
    - When `directDownload: true`, call `downloadBlob(file.filename, blob)` directly without opening the save file picker.
  - In the file card UI, provide two buttons:
    - `Tải về (Trình duyệt)` / `Tải trực tiếp`: triggers direct browser download (`downloadBlob`).
    - `Lưu tệp... (Save As)`: triggers location picker (`saveFileWithPicker`).

### Step 2: Add Direct Browser Download to Message Export Tool in `ChatMessageBubble.tsx`
- In `ChatMessageBubble.tsx`:
  - Update `handleExportFile(format, directDownload = false)`:
    - When `directDownload: true`, export blob and immediately call `downloadBlob(result.filename, result.blob)`.
  - In the assistant message actions toolbar, provide both options:
    - Button 1: "Tải về (Trình duyệt)" with format dropdown (PPTX, DOCX, XLSX, Markdown, Text).
    - Button 2: "Lưu tệp (Save As)" with format dropdown to choose location via file picker.
  - Ensure dropdowns have `overlayStyle={{ zIndex: 1500 }}` and `getPopupContainer={(node) => node.parentElement || document.body}`.

### Step 3: Fix Tooltip Z-Index for Metrics & Actions
- In `ChatMessageBubble.tsx`:
  - Add `zIndex={1500}` and `getPopupContainer={(node) => node.parentElement || document.body}` to:
    - Duration time tooltip (`⏱ Xs`)
    - Token usage tooltip (`🪙 X tokens`)
    - Copy content tooltip (`Sao chép nội dung`)

### Step 4: Verification
- Run tests (`npm test`) to ensure no regressions in AI drawer or chat message bubble tests.
- Verify TypeScript compilation (`npx tsc --noEmit`).
