import { describe, expect, it } from 'vitest';
import { readNoteMarkdown } from '../../src/utils/noteBody';

describe('readNoteMarkdown', () => {
  it('unwraps a JSON envelope Note body', () => {
    const body = JSON.stringify({ markdown: '# SOLUTION v1\n\nNội dung', exportPayload: {} });
    expect(readNoteMarkdown(body)).toBe('# SOLUTION v1\n\nNội dung');
  });

  it('leaves plain Markdown untouched, including text that starts with a brace', () => {
    expect(readNoteMarkdown('# Ghi chú thường')).toBe('# Ghi chú thường');
    expect(readNoteMarkdown('{không phải JSON}')).toBe('{không phải JSON}');
    expect(readNoteMarkdown('{"a":1}')).toBe('{"a":1}');
  });

  it('requires a string markdown and a present exportPayload, so ordinary JSON notes survive', () => {
    expect(readNoteMarkdown('{"markdown":"x"}')).toBe('{"markdown":"x"}');
    expect(readNoteMarkdown('{"markdown":42,"exportPayload":{}}')).toBe('{"markdown":42,"exportPayload":{}}');
  });

  it('handles null and undefined as empty', () => {
    expect(readNoteMarkdown(null)).toBe('');
    expect(readNoteMarkdown(undefined)).toBe('');
  });
});
