import { describe, it, expect } from 'vitest';
import { ORACLE_KEYWORDS, tokenizeCodeLine } from '../DiffSyntaxHighlighter';

describe('Oracle SQL tokenizer', () => {
  it('marks keywords case-insensitively and leaves quoted text intact', () => {
    expect(ORACLE_KEYWORDS.has('SELECT')).toBe(true);
    const spans = tokenizeCodeLine("select 'DELETE FROM t' from dual -- SELECT", 'sql');
    expect(spans.some((s) => s.type === 'keyword' && s.text.toLowerCase() === 'select')).toBe(true);
    expect(spans.some((s) => s.type === 'string' && s.text.includes('DELETE FROM'))).toBe(true);
    expect(spans.some((s) => s.type === 'comment' && s.text.includes('SELECT'))).toBe(true);
  });

  it('keeps Oracle q-quotes as one string token', () => {
    const spans = tokenizeCodeLine("SELECT q'[it's fine]' FROM DUAL", 'sql');
    expect(spans.some((s) => s.type === 'string' && s.text === "q'[it's fine]'")).toBe(true);
  });
});
