---
task_id: 261009-j6f
slug: fix-ai-export-browser-download-and-toolt
date: 2026-10-09
type: quick
status: complete
commit: pending
---

# Quick Task Summary: Fix AI File Download, Add Browser Direct Download Action, and Fix Metric Tooltip Z-Index

## Root Cause
1. In `AIChatDrawer`, file download/export previously only used `saveFileWithPicker` (`showSaveFilePicker`). If the platform or browser denied filesystem write permissions, users had no alternate way to trigger a normal browser download (`downloadBlob`).
2. Duration time and token usage tooltips defaulted to Ant Design's tooltip z-index (1070), causing them to mount behind `AIChatDrawer` (`zIndex: 1200`).
3. OS notification headers: Explained OS-level bundle/permission caching mechanism for "PlannerMate" vs "TaskMate".

## Key Changes
- `src/components/ai/ChatMessageBubble.tsx`:
  - Added direct browser download action (`downloadBlob`) alongside `saveFileWithPicker` for both:
    - Generated file cards in chat responses (Buttons: "Tải về" via browser & "Lưu tệp..." via Save As file picker).
    - Assistant message action toolbar (Dropdowns: "Tải về" via browser & "Lưu tệp..." via Save As file picker for PPTX, DOCX, XLSX, CSV, MD, TXT).
  - Added `zIndex={1500}` and `getPopupContainer={(node) => node.parentElement || document.body}` to metric tooltips (durationMs, tokenUsage) and copy button.
- `tests/ai/ChatMessageBubble.test.tsx`:
  - Added unit tests verifying both browser download and save as buttons render for generated files and export actions.
  - Added unit tests for duration and token metric chips with tooltips.

## Verification
- `npx tsc --noEmit` passed with 0 errors.
- `npm test tests/ai/ChatMessageBubble.test.tsx` passed (11/11 tests).
- `npm test tests/ai/AIChatDrawer.test.tsx` passed (28/28 tests).
- `npm test tests/components/ai/AIChatDrawerNotification.test.ts` passed (4/4 tests).
