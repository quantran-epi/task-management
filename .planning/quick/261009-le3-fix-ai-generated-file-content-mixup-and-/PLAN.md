# Quick Plan: Fix AI Generated File Content Mixup and Upgrade File Generation Engine

## Problem Statement
1. In `ChatMessageBubble.tsx`, when the user clicks to save an AI-generated file (`handleDownloadGeneratedFile`), if `file.content` is empty or undefined, it fell back to `file.content || msg.content`. This caused the assistant's conversation text (greetings, explanations, system prompt summaries) to be written into the saved file rather than the actual document/table/slide content.
2. In `aiTools.ts` for `generate_pptx`, when `contentOrSlides` is an array of `SlideData[]`, `content` was returned as `undefined`, triggering the fallback bug in `ChatMessageBubble.tsx`.
3. In `aiTools.ts` for `generate_file`, the tool definition did not strictly instruct the model to populate 100% of the document content inside `args.content`, leading models to write file content only in chat text while leaving tool parameters empty or abbreviated.
4. In `ChatMessageBubble.tsx`, the bottom assistant message action bar had export buttons labeled "Lưu tệp..." and "Tải về", causing visual confusion with the file card's "Lưu tệp..." / "Tải về" buttons.
5. In `fileExport.ts`, `.xlsx` files did not specify `<cols>` column widths, causing columns to appear cramped in Excel.

## Execution Steps

### Step 1: Fix Core Content Leak & Fallback in `ChatMessageBubble.tsx`
- In `handleDownloadGeneratedFile`:
  - Completely remove `|| msg.content` fallback.
  - If `file.content` is missing or empty, attempt fallback extraction of markdown code blocks (```` ```...``` ````) from `msg.content`. If still empty, display an error message (`message.error('Không tìm thấy nội dung tệp đã tạo để lưu...')`) rather than saving conversation text.
- In assistant message bottom action toolbar:
  - Update export buttons from generic "Tải về" / "Lưu tệp..." to "Xuất đoạn chat" / "Lưu đoạn chat..." with clear tooltips to distinguish from generated file cards.

### Step 2: Ensure Tool Results Preserve Full Content in `aiTools.ts` & `AIChatDrawer.tsx`
- In `src/services/ai/aiTools.ts`:
  - Enhance `generate_file` and `generate_pptx` tool descriptions with strict prompt guidance requiring full content in parameters.
  - In `generate_pptx`, serialize structured `SlideData[]` to markdown representation if string content is not provided, ensuring `content` in tool result is never `undefined`.
- In `src/components/ai/AIChatDrawer.tsx`:
  - In tool execution handling, ensure `turnGeneratedFiles` captures content from tool result or falls back to raw tool call arguments `args.content` / `args.markdownContent`.

### Step 3: Upgrade File Generation Engine in `fileExport.ts`
- In `generateXlsxBlob`:
  - Calculate max text length per column and generate `<cols>` tags with custom widths (`Math.max(10, Math.min(50, maxLen + 3))`) before `<sheetData>` so spreadsheets look formatted and readable.
- In `generateDocxBlob`:
  - Support code block styling and improve blockquote formatting in OpenXML Word documents.

### Step 4: Verification
- Run relevant unit tests:
  - `npm test tests/ai/ChatMessageBubble.test.tsx`
  - `npm test src/services/ai/__tests__/fileGenerationTool.test.ts`
  - `npm test tests/ai/AIChatDrawer.test.tsx`
- Verify TypeScript check (`npx tsc --noEmit`).
