import { describe, expect, it } from 'vitest';
import {
  chunkMarkdownSnapshot,
  OversizedAtomicBlockError,
} from '../src/parser/sectionChunker.js';
import { validateAtomicBlockNode } from '../src/parser/atomicBlockValidator.js';
import { HARD_ATOMIC_BLOCK_LIMIT } from '../src/types/protocol.js';

describe('atomicBlockValidator & over-limit rejection per D-25', () => {
  const docId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  it('rejects table exceeding 50,000 characters with typed error and zero chunks', () => {
    // Generate table over 50,000 characters
    const header = '| C1 | C2 | C3 |\n|---|---|---|\n';
    const row = '| Cell One Data | Cell Two Long Content | Cell Three Extra Info |\n';
    const rowCount = Math.ceil((HARD_ATOMIC_BLOCK_LIMIT + 100) / row.length);
    const hugeTable = header + row.repeat(rowCount);

    expect(hugeTable.length).toBeGreaterThan(HARD_ATOMIC_BLOCK_LIMIT);

    const markdown = `# Title\n\n## Big Table Section\n\n${hugeTable}\n\n## Normal Section\nNormal text.`;

    expect(() => chunkMarkdownSnapshot(docId, markdown)).toThrow(OversizedAtomicBlockError);

    try {
      chunkMarkdownSnapshot(docId, markdown);
    } catch (e: any) {
      expect(e).toBeInstanceOf(OversizedAtomicBlockError);
      expect(e.code).toBe('OVERSIZED_ATOMIC_BLOCK');
      expect(e.documentId).toBe(docId);
      expect(e.blockType).toBe('table');
      expect(e.limit).toBe(50000);
      expect(e.length).toBeGreaterThan(50000);
      expect(e.line).toBeGreaterThanOrEqual(1);
      expect(e.column).toBeGreaterThanOrEqual(1);
      // Serialized error or message must not contain raw Markdown content (T-16-18)
      expect(e.message).not.toContain('Cell One Data');
    }
  });

  it('rejects fenced code block exceeding 50,000 characters with typed error and zero chunks', () => {
    const hugeCode = '```sql\n' + 'SELECT 1;\n'.repeat(5600) + '```\n';
    expect(hugeCode.length).toBeGreaterThan(HARD_ATOMIC_BLOCK_LIMIT);

    const markdown = `# Title\n\n${hugeCode}`;

    expect(() => chunkMarkdownSnapshot(docId, markdown)).toThrow(OversizedAtomicBlockError);
    try {
      chunkMarkdownSnapshot(docId, markdown);
    } catch (e: any) {
      expect(e.code).toBe('OVERSIZED_ATOMIC_BLOCK');
      expect(e.blockType).toBe('code');
      expect(e.length).toBeGreaterThan(50000);
      expect(e.message).not.toContain('SELECT 1');
    }
  });

  it('rejects blockquote exceeding 50,000 characters', () => {
    const hugeQuote = '> Quote line content here.\n'.repeat(2000);
    expect(hugeQuote.length).toBeGreaterThan(HARD_ATOMIC_BLOCK_LIMIT);

    const markdown = `# Title\n\n${hugeQuote}`;

    expect(() => chunkMarkdownSnapshot(docId, markdown)).toThrow(OversizedAtomicBlockError);
    try {
      chunkMarkdownSnapshot(docId, markdown);
    } catch (e: any) {
      expect(e.code).toBe('OVERSIZED_ATOMIC_BLOCK');
      expect(e.blockType).toBe('blockquote');
    }
  });

  it('rejects oversized atomic blocks nested inside list items with exact location metadata', () => {
    const hugeCode = '    ```sql\n' + '    SELECT 1;\n'.repeat(5000) + '    ```\n';
    const markdown = `# Title\n\n- Nested query:\n${hugeCode}`;

    expect(() => chunkMarkdownSnapshot(docId, markdown)).toThrow(OversizedAtomicBlockError);
    try {
      chunkMarkdownSnapshot(docId, markdown);
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(OversizedAtomicBlockError);
      const atomicError = error as OversizedAtomicBlockError;
      expect(atomicError.code).toBe('OVERSIZED_ATOMIC_BLOCK');
      expect(atomicError.blockType).toBe('code');
      expect(atomicError.line).toBe(4);
      expect(atomicError.column).toBe(5);
      expect(atomicError.limit).toBe(HARD_ATOMIC_BLOCK_LIMIT);
      expect(atomicError.message).not.toContain('SELECT 1');
    }
  });

  it('chunks documents over 50,000 characters when each block remains below the atomic limit', () => {
    const markdown = Array.from(
      { length: 10 },
      (_, index) => `## Section ${index + 1}\n\n${'regular paragraph content '.repeat(250)}\n\n`
    ).join('');

    expect(markdown.length).toBeGreaterThan(HARD_ATOMIC_BLOCK_LIMIT);
    const chunks = chunkMarkdownSnapshot(docId, markdown);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.rawContent).join('')).toBe(markdown);
  });

  it('allows atomic blocks under 50,000 characters even if they exceed 6,000 characters', () => {
    // 10,000 char table: over 6,000 target chunk size, but under 50,000 hard limit
    const header = '| C1 | C2 |\n|---|---|\n';
    const row = '| Value One | Value Two |\n';
    const rowCount = Math.ceil(10000 / row.length);
    const table = header + row.repeat(rowCount);

    expect(table.length).toBeGreaterThan(6000);
    expect(table.length).toBeLessThan(HARD_ATOMIC_BLOCK_LIMIT);

    const markdown = `## Data Table\n\n${table}`;
    const chunks = chunkMarkdownSnapshot(docId, markdown);

    expect(chunks.length).toBe(1);
    expect(chunks[0]!.rawContent).toContain('| Value One | Value Two |');
    expect(markdown.slice(chunks[0]!.startOffset, chunks[0]!.endOffset)).toBe(chunks[0]!.rawContent);
  });
});
