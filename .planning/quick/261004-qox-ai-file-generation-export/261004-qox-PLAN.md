---
phase: quick
plan: 261004-qox
type: execute
wave: 1
depends_on: []
files_modified:
  - src/utils/fileExport.ts
  - src/utils/__tests__/fileExport.test.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/__tests__/fileGenerationTool.test.ts
  - src/components/ai/ChatMessageBubble.tsx
autonomous: true
requirements:
  - AI-FILE-EXPORT
must_haves:
  truths:
    - "AI assistant can call generate_file tool to create and trigger client-side download of files in .md, .txt, .docx, .xlsx, and .csv formats"
    - "ChatMessageBubble displays an Export action on assistant messages allowing users to directly download the response as DOCX, XLSX, CSV, MD, or TXT"
    - "DOCX and XLSX files are generated client-side using pure TypeScript uncompressed OpenXML packages without server dependencies"
    - "CSV export includes UTF-8 BOM so spreadsheet applications correctly open international characters"
  artifacts:
    - path: "src/utils/fileExport.ts"
      provides: "Client-side file generation and browser download for MD, TXT, DOCX, XLSX, and CSV"
      exports: ["exportContentAsFile", "downloadBlob", "generateDocxBlob", "generateXlsxBlob", "generateCsvBlob", "inferFormatFromFilename"]
    - path: "src/utils/__tests__/fileExport.test.ts"
      provides: "Unit tests verifying file generators, headers, and OpenXML structures"
    - path: "src/services/ai/aiTools.ts"
      provides: "generate_file tool definition and execution handler"
      contains: "generate_file"
    - path: "src/services/ai/__tests__/fileGenerationTool.test.ts"
      provides: "Unit tests verifying generate_file tool schema and execution"
    - path: "src/components/ai/ChatMessageBubble.tsx"
      provides: "Export dropdown menu on assistant chat bubbles for instant file downloads"
      contains: "exportContentAsFile"
  key_links:
    - from: "src/services/ai/aiTools.ts"
      to: "src/utils/fileExport.ts"
      via: "exportContentAsFile invocation on tool call"
    - from: "src/components/ai/ChatMessageBubble.tsx"
      to: "src/utils/fileExport.ts"
      via: "Export menu triggers file export and download"
---

<objective>
Enable AI assistant file generation and user message export across multiple document and spreadsheet formats (Markdown .md, Plain Text .txt, Word .docx, Excel .xlsx, and .csv) using pure client-side OpenXML and text generators with zero backend dependencies.

Purpose: Allow the AI assistant to programmatically produce downloadable reports, tables, notes, and spreadsheets upon request, while giving users 1-click export actions on any AI response.
Output: `src/utils/fileExport.ts`, updated `aiTools.ts`, updated `ChatMessageBubble.tsx`, and accompanying automated test suites.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/utils/documentExport.ts
@src/services/ai/aiTools.ts
@src/components/ai/ChatMessageBubble.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure Client-Side Multi-Format File Generation Utility</name>
  <files>src/utils/fileExport.ts, src/utils/__tests__/fileExport.test.ts</files>
  <behavior>
    - Test 1: generates valid Markdown (.md) and Plain Text (.txt) blobs with UTF-8 encoding.
    - Test 2: generates valid CSV (.csv) blob with UTF-8 BOM (\uFEFF) and RFC 4180 quotation escaping for commas, quotes, and newlines.
    - Test 3: generates valid uncompressed OpenXML Word (.docx) ZIP container with [Content_Types].xml, _rels/.rels, and word/document.xml with paragraphs, headings, and table cells.
    - Test 4: generates valid uncompressed OpenXML Excel (.xlsx) ZIP container with [Content_Types].xml, workbook.xml, and sheet1.xml parsed from markdown tables or delimited lines.
    - Test 5: inferFormatFromFilename detects format from extension (.docx -> docx, .xlsx -> xlsx, .csv -> csv, .md -> md, .txt -> txt) with fallback.
    - Test 6: sanitizeFilename cleans directory traversal and illegal characters.
  </behavior>
  <action>
Create `src/utils/fileExport.ts` implementing client-side document and spreadsheet generation:
1. Pure TypeScript store-mode ZIP builder (CRC-32 checksum table, local file headers, central directory, end of central directory record) capable of assembling valid uncompressed ZIP archives without external packages.
2. Word (.docx) generator:
   - Packages `[Content_Types].xml`, `_rels/.rels`, `word/_rels/document.xml.rels`, and `word/document.xml`.
   - Parses markdown/plain text into Word XML structures:
     - Headings (`# `, `## `, `### `) mapped to styled heading paragraphs or bold runs with larger font sizes (`<w:sz w:val="36"/>`).
     - Bullet lists (`- `, `* `, `1. `) mapped to bulleted paragraphs with indentation.
     - Tables (`| col1 | col2 |`) parsed into `<w:tbl><w:tr><w:tc>...` with borders and cell padding.
     - Regular paragraphs with bold (`**text**`) and italic (`*text*`) formatting.
3. Excel (.xlsx) generator:
   - Packages `[Content_Types].xml`, `_rels/.rels`, `xl/_rels/workbook.xml.rels`, `xl/workbook.xml`, and `xl/worksheets/sheet1.xml`.
   - Parses markdown tables or newline/comma/tab-delimited lines into worksheet rows (`<row r="1">`) and inline string cells (`<c r="A1" t="inlineStr"><is><t>...</t></is></c>`).
4. CSV generator:
   - Generates UTF-8 BOM (`\uFEFF`) string with RFC 4180 escaping.
5. In-browser download helper `downloadBlob(filename: string, blob: Blob)` using anchor tag object URL creation and revocation.
6. Unified helper `exportContentAsFile(content: string, filename: string, format?: 'md' | 'txt' | 'docx' | 'xlsx' | 'csv'): { filename: string; format: string; sizeBytes: number; blob: Blob }`.
Write comprehensive unit tests in `src/utils/__tests__/fileExport.test.ts`.
  </action>
  <verify>
    <automated>npm test -- src/utils/__tests__/fileExport.test.ts</automated>
  </verify>
  <done>All multi-format generators (MD, TXT, DOCX, XLSX, CSV) pass tests, verify ZIP PK signatures, and handle table parsing without external dependencies.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: AI Tool generate_file in aiTools.ts</name>
  <files>src/services/ai/aiTools.ts, src/services/ai/__tests__/fileGenerationTool.test.ts</files>
  <behavior>
    - Test 1: AI_DATABASE_TOOLS includes generate_file with filename, format, content, and title parameters.
    - Test 2: executeAiTool('generate_file', ...) rejects missing filename or content with descriptive error.
    - Test 3: executeAiTool('generate_file', { filename: 'summary.docx', content: '# Summary\nTest content' }) invokes export utility, creates file, and returns success JSON with sizeBytes, format, and filename.
    - Test 4: executeAiTool('generate_file', { filename: 'data.xlsx', content: '| Name | Hours |\n| Task A | 5 |' }) correctly generates spreadsheet format.
  </behavior>
  <action>
1. In `src/services/ai/aiTools.ts`, add `generate_file` tool definition to `AI_DATABASE_TOOLS`:
   - Name: `generate_file`
   - Description: "Generate and trigger immediate browser download of a file in specified format (Markdown .md, plain text .txt, Word .docx, Excel .xlsx, or .csv). Useful when the user asks to export or save a document, report, table, summary, or spreadsheet to a file."
   - Parameters:
     - `filename` (string, required): e.g. "report.docx", "tasks.xlsx", "notes.md", "data.csv".
     - `format` (string, enum ['md', 'txt', 'docx', 'xlsx', 'csv'], optional): if omitted, infer from filename.
     - `content` (string, required): document text, markdown, report, or tabular data.
     - `title` (string, optional): document title or header.
2. In `executeAiTool` switch statement:
   - Add `case 'generate_file':`
   - Validate `args.filename` and `args.content`.
   - Call `exportContentAsFile` from `src/utils/fileExport.ts`.
   - Return formatted JSON:
     `{ success: true, message: `Đã tạo và tải xuống tệp "${result.filename}" thành công.`, filename: result.filename, format: result.format, sizeBytes: result.sizeBytes }`
3. Add unit test suite in `src/services/ai/__tests__/fileGenerationTool.test.ts` verifying tool schema, error branches, and successful file generation execution.
  </action>
  <verify>
    <automated>npm test -- src/services/ai/__tests__/fileGenerationTool.test.ts</automated>
  </verify>
  <done>AI tool generate_file is registered in tool catalogue and executes multi-format file generation and download with error handling.</done>
</task>

<task type="auto">
  <name>Task 3: Export Action Options on AI Message Bubble</name>
  <files>src/components/ai/ChatMessageBubble.tsx</files>
  <action>
Update `src/components/ai/ChatMessageBubble.tsx` to add direct file export capabilities on assistant message bubbles:
1. Import `exportContentAsFile` and format helpers from `../../utils/fileExport`.
2. Import Ant Design `Dropdown`, `MenuProps`, and relevant icons (`DownloadOutlined`, `FileWordOutlined`, `FileExcelOutlined`, `FileTextOutlined`, `FileMarkdownOutlined`).
3. Add an "Xuất tệp" action chip / dropdown button in the assistant message action area (beside Checklist, Sticky Notes, Claude Code buttons):
   - Dropdown options:
     - `Word Document (.docx)`
     - `Excel Spreadsheet (.xlsx)`
     - `CSV Data (.csv)`
     - `Markdown (.md)`
     - `Văn bản (.txt)`
   - Auto-derive clean base filename:
     - Check first markdown heading in `msg.content` (e.g. `# Daily Standup` -> `Daily-Standup`)
     - Fallback to `plannermate-ai-${new Date().toISOString().slice(0, 10)}`
   - Handle download click:
     - Calls `exportContentAsFile(msg.content, `${baseFilename}.${format}`, format)`
     - Displays `message.success(`Đã tải xuống ${filename}`)`
4. If content contains markdown table pattern (`| ... |`), highlight or prioritize `.xlsx` and `.csv` in the menu.
5. Ensure responsive mobile/compact styling consistent with Ant Design theme tokens.
  </action>
  <verify>
    <automated>npm run build && npm test -- src/utils/__tests__/fileExport.test.ts src/services/ai/__tests__/fileGenerationTool.test.ts</automated>
  </verify>
  <done>ChatMessageBubble offers sleek multi-format export dropdown for assistant responses, correctly deriving filenames and triggering downloads.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| AI tool / user content → File download | Untrusted text, markdown, or generated data rendered into downloadable files on user device |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QOX-01 | Tampering | Filename generation | mitigate | Apply sanitizeFilename to strip directory traversal (../, ..\) and illegal filesystem characters |
| T-QOX-02 | Information Disclosure | Client-side export | mitigate | Perform 100% client-side file generation via in-memory Blobs and object URLs without transmitting content to external servers |
| T-QOX-03 | Denial of Service | OpenXML ZIP construction | mitigate | Limit maximum cell and paragraph iterations, prevent runaway string allocations |
| T-QOX-04 | Tampering | CSV injection in Excel | mitigate | Prefix CSV files with UTF-8 BOM, escape dangerous leading formula triggers (=, +, -, @) when exported if needed |
</threat_model>

<verification>
1. Run Vitest test suites:
   `npm test -- src/utils/__tests__/fileExport.test.ts src/services/ai/__tests__/fileGenerationTool.test.ts`
2. Run full TypeScript and Vite build:
   `npm run build`
</verification>

<success_criteria>
- File generation utility in `src/utils/fileExport.ts` generates valid MD, TXT, DOCX, XLSX, and CSV files client-side.
- AI assistant tool `generate_file` is defined in `AI_DATABASE_TOOLS` and executes in `executeAiTool`.
- `ChatMessageBubble.tsx` presents an Export button with format choices (DOCX, XLSX, CSV, MD, TXT) and triggers client-side download.
- Full test pass and successful build.
</success_criteria>

<output>
Create `.planning/quick/261004-qox-ai-file-generation-export/261004-qox-SUMMARY.md` when execution completes.
</output>
