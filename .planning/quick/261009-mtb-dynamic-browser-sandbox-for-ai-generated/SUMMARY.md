---
task_id: 261009-mtb
slug: dynamic-browser-sandbox-for-ai-generated
date: 2026-10-09
type: quick
status: complete
commit: pending
---

# Quick Task Summary: Dynamic Browser Sandbox for AI Generated Files using ExcelJS, docx, and pptxgenjs

## Root Cause & Need
Hardcoded static markdown parsers cannot accommodate complex layouts, custom column widths, cell colors, merged ranges, Excel formulas, or styled PowerPoint tables. Similar to how Claude Code writes Python/Node scripts to generate rich documents dynamically, the browser application needed an in-browser JavaScript sandbox with access to top-tier client libraries (`exceljs`, `docx`, and `pptxgenjs`).

## Key Changes
- `src/utils/dynamicFileSandbox.ts`:
  - Implemented `executeDynamicFileScript`: executes AI-generated JavaScript in a client-side `AsyncFunction` sandbox with `ExcelJS`, `docx`, and `pptxgen` pre-injected.
  - Implemented `generateXlsxBlobWithExcelJS`: generates styled `.xlsx` workbooks with bold headers, light gray fills, auto-fitted column widths, and proper cell types.
  - Implemented `generateDocxBlobWithDocx`: generates clean `.docx` Word documents with headings, bullet lists, code blocks with Consolas font, blockquotes with border bars, and formatted tables.
- `src/utils/fileExport.ts`:
  - Connected `exportContentAsFile` to use `generateDocxBlobWithDocx` and `generateXlsxBlobWithExcelJS`.
  - Exported `extractGridFromText` and `parseMarkdownTable`.
- `src/utils/pptxExport.ts`:
  - Added support for native PowerPoint tables (`slide.addTable`) when markdown tables or structured table data are present in slides.
- `src/services/ai/aiTools.ts`:
  - Updated `generate_file` tool schema with optional `script` parameter.
  - Handled dynamic execution via `executeDynamicFileScript` when `script` is passed by AI, or standard library conversion when `content` is passed.
- `src/components/ai/ChatMessageBubble.tsx`:
  - Updated `handleDownloadGeneratedFile` to execute dynamic scripts using `executeDynamicFileScript` if content contains library calls.
- `vite.config.ts`:
  - Increased `workbox.maximumFileSizeToCacheInBytes` to 10 MiB to accommodate rich document libraries in PWA precache.

## Verification
- Added `src/utils/__tests__/dynamicFileSandbox.test.ts` (6/6 tests passed).
- Executed related test suites: `dynamicFileSandbox.test.ts`, `fileExport.test.ts`, `fileGenerationTool.test.ts`, `ChatMessageBubble.test.tsx`, `AIChatDrawer.test.tsx` (65/65 tests passed).
- `npx tsc --noEmit` passed with 0 errors.
- `npm run build` compiled client bundle and PWA service worker successfully.
