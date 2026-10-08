import { describe, expect, it } from 'vitest';
import {
  chunkMarkdownSnapshot,
  OversizedAtomicBlockError,
} from '../src/parser/sectionChunker.js';
import {
  normalizeNewlines,
  buildChunkHashInput,
  buildDocumentHashInput,
} from '../src/indexing/chunkHashPolicy.js';
import {
  TARGET_CHUNK_SIZE,
  HARD_ATOMIC_BLOCK_LIMIT,
  CHUNKING_POLICY_VERSION,
} from '../src/types/protocol.js';

describe('sectionChunker & chunkHashPolicy', () => {
  const docId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  // Real representative 60000006 pilot fixtures representing all 7 documentation domains
  const pilotFixtures = {
    '00-sources.md': `# Process 60000006 Sources & Technical Lineage

## System Identifiers
The core calculation system runs as batch process \`60000006\` under banking core.
- Batch Name: \`SHB_BATCH_CR_CALC_DAILY\`
- Job Schedule: \`01:30 AM\` daily

## Source Repositories
Source repositories and stored procedure definitions:
- \`SP_CALC_INTEREST_ACCRUAL\`
- \`SP_RECONCILE_LIMITS\`
`,
    '01-wiring.md': `# Process 60000006 Wiring & Config

## Spring Batch XML Config
Fenced configuration XML:
\`\`\`xml
<batch:job id="60000006-credit-calc">
  <batch:step id="step-accrual">
    <batch:tasklet ref="accrualTasklet" />
  </batch:step>
</batch:job>
\`\`\`

## Parameter Mappings
Configuration parameters passed via environment:
- \`CALC_DATE\`: YYYYMMDD
- \`BRANCH_CODE\`: ALL
`,
    '02-data-objects.md': `# Process 60000006 Data Objects

## Table Schema: T_LN_ACCT
Master loan account table:
| Column | Type | Nullable | Description |
|---|---|---|---|
| ACCT_NO | VARCHAR2(20) | N | Loan Account Number |
| CUST_ID | VARCHAR2(15) | N | Customer CIF |
| INT_RATE | NUMBER(8,4) | N | Effective Interest Rate |
| BAL_DUE | NUMBER(18,2) | N | Principal Balance Due |

### Table Schema: T_LN_SCHED
Repayment schedule table:
| Column | Type | Nullable | Description |
|---|---|---|---|
| SCHED_ID | VARCHAR2(30) | N | Schedule Primary Key |
| ACCT_NO | VARCHAR2(20) | N | Loan Account Number |
| DUE_DATE | DATE | N | Installment Due Date |
`,
    '03-call-chain.md': `# Process 60000006 Call Chain & Workflow

## Daily Execution Sequence
Sequential execution pipeline:
\`\`\`
[Trigger: Control-M]
         │
         ▼
[Step 1: Check EOD Flags] ──► [Step 2: Lock Accounts]
                                         │
                                         ▼
                             [Step 3: Accrual SQL SP]
\`\`\`

## PL/SQL Call Chain
Main procedure invocation:
\`\`\`sql
CREATE OR REPLACE PROCEDURE PKG_CR_CALC.PROCESS_DAILY(
    p_run_date IN DATE,
    p_status   OUT VARCHAR2
) AS
BEGIN
    SP_VALIDATE_ACCOUNTS(p_run_date);
    SP_CALC_INTEREST_ACCRUAL(p_run_date);
    COMMIT;
END PROCESS_DAILY;
\`\`\`
`,
    '04-cycles.md': `# Process 60000006 Billing Cycles & Interest Accrual

## Calendar Rules
Interest accrual follows 365-day convention:
\`\`\`
Daily Accrual = (Principal × Annual Rate) / 365
\`\`\`

## Holiday Adjustments
When accrual date falls on Sunday, interest is accrued on next business day.
`,
    '05-breadcrumbs.md': `# Process 60000006 Breadcrumbs & Diagnostics

## Log Locations
System log directories:
- \`/var/log/banking/batch/60000006/daily.log\`
- \`/var/log/banking/batch/60000006/error.log\`

## Diagnostic Queries
Query to check failed accounts:
\`\`\`sql
SELECT acct_no, err_code, err_msg
FROM t_batch_err_log
WHERE batch_id = '60000006' AND run_date = TRUNC(SYSDATE);
\`\`\`
`,
    'README.md': `# Scheduled Process 60000006 Overview

## Business Purpose
Automated credit calculation for retail and SME lending products.

## SLA & Operations
- SLA: Execution must complete before 04:00 AM.
- Ops Owner: Team Core Banking Operations.
`,
  };

  it('all seven pilot files chunk losslessly: source.slice(startOffset, endOffset) === rawContent', () => {
    for (const [filename, source] of Object.entries(pilotFixtures)) {
      const chunks = chunkMarkdownSnapshot(docId, source);
      expect(chunks.length, `Expected chunks for ${filename}`).toBeGreaterThan(0);

      for (const chunk of chunks) {
        const slice = source.slice(chunk.startOffset, chunk.endOffset);
        expect(slice, `Mismatch in ${filename} chunk ${chunk.chunkIndex}`).toBe(chunk.rawContent);
      }
    }
  });

  it('preserves exact raw slices: source.slice(startOffset, endOffset) === rawContent', () => {
    const markdown = `# Title Preamble
Preamble body paragraph.

## Section 1
Content of section 1.

### SubSection 1.1
Content of subsection 1.1 with some details.

#### Deep H4
H4 text within subsection.

## Section 2
Final section content.
`;
    const chunks = chunkMarkdownSnapshot(docId, markdown);
    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      expect(markdown.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.rawContent);
    }
  });

  it('correctly maps preamble, H2, H3, and H4-H6 heading paths per D-20', () => {
    const markdown = `# Doc H1
Preamble text here.

## Section H2
Text in H2.

### Sub H3
Text in H3.

#### Deep H4
Text in H4.

##### Deep H5
Text in H5.
`;
    const chunks = chunkMarkdownSnapshot(docId, markdown);
    // Preamble chunk
    expect(chunks[0]?.headingPath).toEqual(['Doc H1']);
    expect(chunks[0]?.rawContent).toContain('Preamble text here.');

    // H2 chunk
    expect(chunks[1]?.headingPath).toEqual(['Section H2']);
    expect(chunks[1]?.rawContent).toContain('Text in H2.');

    // H3 chunk with H4/H5 subheadings
    expect(chunks[2]?.headingPath).toEqual(['Section H2', 'Sub H3']);
    expect(chunks[2]?.rawContent).toContain('Deep H4');
    expect(chunks[2]?.rawContent).toContain('Deep H5');
  });

  it('handles heading-less document using synthetic section per D-21', () => {
    const markdown = `Just paragraphs without any headings.
Line two of content.
Line three of content.`;
    const chunks = chunkMarkdownSnapshot(docId, markdown);
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.headingPath).toEqual([]);
    expect(chunks[0]?.rawContent).toBe(markdown);
    expect(markdown.slice(chunks[0]!.startOffset, chunks[0]!.endOffset)).toBe(markdown);
  });

  it('splits oversized sections only between top-level AST blocks over 6,000 characters per D-25', () => {
    // Generate a long document with 10 paragraphs each ~1000 characters
    const p1 = 'Paragraph one content. '.repeat(50) + '\n\n';
    const p2 = 'Paragraph two content. '.repeat(50) + '\n\n';
    const p3 = 'Paragraph three content. '.repeat(50) + '\n\n';
    const p4 = 'Paragraph four content. '.repeat(50) + '\n\n';
    const p5 = 'Paragraph five content. '.repeat(50) + '\n\n';
    const p6 = 'Paragraph six content. '.repeat(50) + '\n\n';
    const p7 = 'Paragraph seven content. '.repeat(50) + '\n\n';
    const p8 = 'Paragraph eight content. '.repeat(50);

    const markdown = `## Big Section\n\n${p1}${p2}${p3}${p4}${p5}${p6}${p7}${p8}`;
    expect(markdown.length).toBeGreaterThan(TARGET_CHUNK_SIZE);

    const chunks = chunkMarkdownSnapshot(docId, markdown);
    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.headingPath).toEqual(['Big Section']);
      expect(markdown.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.rawContent);
    }
  });

  it('keeps tables, fenced code/SQL, and blockquotes atomic without splitting', () => {
    const table = '| Col 1 | Col 2 |\n|---|---|\n' + '| Val 1 | Val 2 |\n'.repeat(20);
    const code = '```sql\nSELECT * FROM accounts WHERE id = 1;\n```\n';
    const blockquote = '> Quote line 1\n> Quote line 2\n';

    const markdown = `## Data Objects\n\n${table}\n\n${code}\n\n${blockquote}`;
    const chunks = chunkMarkdownSnapshot(docId, markdown);

    // Everything under one section with under 6000 chars should be 1 chunk containing table and code
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.rawContent).toContain('SELECT * FROM accounts');
    expect(chunks[0]?.rawContent).toContain('| Col 1 | Col 2 |');
  });

  it('handles CRLF vs LF preserving exact raw UTF-16 offsets per D-22 and D-23', () => {
    const crlfMarkdown = '# Title\r\n\r\nPreamble\r\n\r\n## Section 1\r\nCRLF body content\r\n';
    const chunks = chunkMarkdownSnapshot(docId, crlfMarkdown);

    for (const chunk of chunks) {
      expect(crlfMarkdown.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.rawContent);
    }
  });

  it('handles Unicode characters preserving exact raw UTF-16 offsets', () => {
    const unicodeMarkdown = `## Quy trình tính lãi tín dụng 60000006
Công thức tính lãi: Lãi = Số dư × Lãi suất × Số ngày / 365.
Đặc tả bảng dữ liệu:
| Mã tham số | Tên tham số | Giá trị |
|------------|-------------|---------|
| RATE_01    | Lãi suất cơ bản | 8.5% |
| TIER_MAX   | Ngưỡng tối đa | 100,000,000,000 ₫ |
`;
    const chunks = chunkMarkdownSnapshot(docId, unicodeMarkdown);
    expect(chunks.length).toBe(1);
    expect(unicodeMarkdown.slice(chunks[0]!.startOffset, chunks[0]!.endOffset)).toBe(chunks[0]!.rawContent);
    expect(chunks[0]!.rawContent).toContain('100,000,000,000 ₫');
  });

  it('gives duplicate equal-content sections independent occurrenceId per D-24', () => {
    const duplicateMarkdown = `## Status Codes\n200 OK\n400 Bad Request\n\n## Another Heading\nMiddle content.\n\n## Status Codes\n200 OK\n400 Bad Request\n\n`;
    const chunks = chunkMarkdownSnapshot(docId, duplicateMarkdown);
    expect(chunks.length).toBe(3);

    const first = chunks[0]!;
    const third = chunks[2]!;

    expect(first.occurrenceId).not.toBe(third.occurrenceId);
    expect(first.contentHash).toBe(third.contentHash);
    expect(first.chunkKey).not.toBe(third.chunkKey);
    expect(first.startOffset).not.toBe(third.startOffset);
  });

  it('normalizeNewlines only changes CRLF and CR to LF per D-22', () => {
    const input = 'Line 1\r\nLine 2\rLine 3\nLine 4';
    expect(normalizeNewlines(input)).toBe('Line 1\nLine 2\nLine 3\nLine 4');

    // Other whitespace, spaces, tabs, uppercase preserved
    const spaces = '  SELECT   *   FROM  tbl;  \t';
    expect(normalizeNewlines(spaces)).toBe(spaces);
  });

  it('buildChunkHashInput canonicalizes newlines without mutating content semantics', () => {
    const raw1 = 'SELECT * FROM table\r\nWHERE id = 1;';
    const raw2 = 'SELECT * FROM table\nWHERE id = 1;';

    expect(buildChunkHashInput(raw1)).toBe(buildChunkHashInput(raw2));
  });

  it('has zero side-effect imports (pure isomorphic modules)', async () => {
    // Read source code of parser/chunker files and ensure no node: or browser/dom/storage/network imports
    const fs = await import('node:fs');
    const path = await import('node:path');

    const files = [
      '../src/parser/markdownAst.ts',
      '../src/parser/sectionChunker.ts',
      '../src/parser/atomicBlockValidator.ts',
      '../src/indexing/chunkHashPolicy.ts',
    ];

    const forbiddenPatterns = [
      /import.*from\s+['"]node:/,
      /import.*from\s+['"]fastify/,
      /import.*from\s+['"]dexie/,
      /import.*from\s+['"]react/,
      /\bfetch\s*\(/,
      /\bwindow\b/,
      /\bdocument\.(?:querySelector|getElementById|createElement|addEventListener)\b/,
      /\blocalStorage\b/,
      /\bindexedDB\b/,
      /\bconsole\./,
    ];

    for (const rel of files) {
      const fullPath = path.resolve(__dirname, rel);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const pattern of forbiddenPatterns) {
          expect(pattern.test(content), `File ${rel} matched forbidden pattern ${pattern}`).toBe(false);
        }
      }
    }
  });
});
