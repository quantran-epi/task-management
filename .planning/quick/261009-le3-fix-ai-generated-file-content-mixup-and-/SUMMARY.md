---
task_id: 261009-le3
slug: fix-ai-generated-file-content-mixup-and-
date: 2026-10-09
type: quick
status: complete
commit: pending
---

# Quick Task Summary: Fix AI Generated File Content Mixup and Upgrade File Generation Engine

## Root Cause
1. `ChatMessageBubble.tsx` had a fallback `file.content || msg.content` in `handleDownloadGeneratedFile`. When `file.content` was missing or empty, it dumped the full conversation text into the file.
2. In `aiTools.ts` for `generate_pptx`, when `slides` array was passed, `content` was returned as `undefined`.
3. In `aiTools.ts` for `generate_file`, the prompt description did not enforce that 100% of the document content must be in the `content` parameter.
4. Assistant message export buttons were ambiguously labeled "Lưu tệp..." and "Tải về", causing confusion with the generated file card's buttons.
5. In `fileExport.ts`, `.xlsx` generation did not specify `<cols>` column widths, causing columns to be cramped.

## Key Changes
- `src/components/ai/ChatMessageBubble.tsx`:
  - Removed `|| msg.content` fallback. Extracted fenced code block content if `file.content` is absent, or alerted an error.
  - Renamed assistant message export toolbar buttons to "Xuất đoạn chat" / "Lưu đoạn chat..." to distinguish them from file card downloads.
- `src/services/ai/aiTools.ts`:
  - Enforced strict parameter descriptions for `generate_file` and `generate_pptx`.
  - Serialized structured `slides` array into markdown format in `generate_pptx` so `content` is never undefined.
- `src/components/ai/AIChatDrawer.tsx`:
  - Captured content from tool result and fell back to raw tool arguments (`args.content` / `args.markdownContent`) in `turnGeneratedFiles`.
- `src/utils/fileExport.ts`:
  - Added code block formatting and blockquote styling to `generateDocxBlob`.
  - Added auto-calculated column widths (`<cols>`) to `generateXlsxBlob`.
- Tests:
  - Added unit test in `tests/ai/ChatMessageBubble.test.tsx` verifying `file.content` is strictly used without leaking `msg.content`.
  - Added unit test in `src/services/ai/__tests__/fileGenerationTool.test.ts` for `generate_pptx` slide serialization.

## Verification
- `npm test tests/ai/ChatMessageBubble.test.tsx src/services/ai/__tests__/fileGenerationTool.test.ts tests/ai/AIChatDrawer.test.tsx` passed (45/45 tests).
- `npx tsc --noEmit` passed with 0 errors.
