# Quick Plan: Dynamic Browser Sandbox for AI Generated Files using ExcelJS, docx, and pptxgenjs

## Problem Statement
Currently, file creation relies on fixed (hardcoded) parsers for markdown text. Users want a dynamic script execution approach (similar to how Claude Code writes Python/Node scripts to generate rich documents), but running 100% in the browser client sandbox using industry-standard frontend libraries (`exceljs`, `docx`, and `pptxgenjs`).

## Execution Steps

### Step 1: Create `src/utils/dynamicFileSandbox.ts`
- Implement dynamic browser sandbox runner `executeDynamicFileScript(script: string, format: ExportFormat, filename: string): Promise<Blob>`
- Expose `ExcelJS`, `docx` (all primitives: Document, Paragraph, TextRun, Table, etc.), and `pptxgen` (`pptxgenjs`).
- Support returning `workbook`, `doc`, `pptx`, `Blob`, `ArrayBuffer`, or `Uint8Array`.
- Provide high-quality frontend library default generators when `content` (text/markdown) is passed:
  - `generateXlsxBlobWithExcelJS(content: string, sheetTitle?: string): Promise<Blob>`
  - `generateDocxBlobWithDocx(content: string, title?: string): Promise<Blob>`

### Step 2: Integrate Sandbox into `fileExport.ts` and `aiTools.ts`
- In `fileExport.ts`:
  - Wire `generateDocxBlob` to use `generateDocxBlobWithDocx`
  - Wire `generateXlsxBlob` to use `generateXlsxBlobWithExcelJS`
- In `aiTools.ts`:
  - Enhance `generate_file` tool definition with `script` parameter so AI can write custom JavaScript using `ExcelJS`, `docx`, or `pptxgen` for complex styling/formulas/layouts.
  - Execute dynamic script if provided, or fallback to library converter.

### Step 3: Verification
- Run unit tests:
  - `tests/ai/ChatMessageBubble.test.tsx`
  - `src/services/ai/__tests__/fileGenerationTool.test.ts`
  - `tests/ai/AIChatDrawer.test.tsx`
- Run TypeScript check: `npx tsc --noEmit`.
