import { describe, it, expect } from 'vitest';
import { createUnifiedLineDiff, MAX_DIFF_CELLS, type DiffBudgetRefusal, type UnifiedLineDiff } from '../../src/utils/lineDiff';

function diff(base: string, next: string, options?: Parameters<typeof createUnifiedLineDiff>[2]): UnifiedLineDiff {
  const result = createUnifiedLineDiff(base, next, options);
  expect((result as DiffBudgetRefusal).refused).toBeUndefined();
  return result as UnifiedLineDiff;
}

describe('createUnifiedLineDiff (SDLC-ART-02, D-09)', () => {
  it('emits valid unified headers with exact add/remove prefixes', () => {
    const result = diff('a\nb\nc', 'a\nB\nc', { fromLabel: 'a/SOLUTION.md', toLabel: 'b/SOLUTION.md' });
    expect(result.diffText.split('\n')[0]).toBe('--- a/SOLUTION.md');
    expect(result.diffText.split('\n')[1]).toBe('+++ b/SOLUTION.md');
    expect(result.diffText).toContain('@@ -1,3 +1,3 @@');
    expect(result.diffText).toContain('-b');
    expect(result.diffText).toContain('+B');
  });

  it('excludes file headers and context lines from added/removed counts', () => {
    const base = Array.from({ length: 30 }, (_, index) => `dòng ${index}`).join('\n');
    const next = base.replace('dòng 15', 'dòng 15 đã sửa');
    const result = diff(base, next, { fromLabel: 'a/x', toLabel: 'b/x' });
    expect(result.addedLines).toBe(1);
    expect(result.removedLines).toBe(1);
    expect(result.diffText.split('\n').filter((line) => line.startsWith('+++'))).toHaveLength(1);
    expect(result.diffText.split('\n').filter((line) => line.startsWith('---'))).toHaveLength(1);
  });

  it('is deterministic for identical inputs', () => {
    const base = 'một\nhai\nba\nbốn';
    const next = 'một\nHAI\nba\nbốn\nnăm';
    expect(diff(base, next)).toEqual(diff(base, next));
  });

  it('preserves CRLF line endings in emitted diff text', () => {
    const result = diff('a\r\nb\r\nc', 'a\r\nB\r\nc', { fromLabel: 'a/x', toLabel: 'b/x' });
    expect(result.diffText).toContain('\r\n');
    expect(result.diffText.split('\r\n')).toContain('-b');
    expect(result.diffText.split('\r\n')).toContain('+B');
  });

  it('represents a missing final newline without altering the compared bytes', () => {
    const withFinal = diff('a\nb\n', 'a\nb\nc\n');
    const withoutFinal = diff('a\nb', 'a\nb\nc');
    expect(withFinal.addedLines).toBe(1);
    expect(withoutFinal.addedLines).toBe(1);
    expect(withoutFinal.diffText).toContain('+c');
    expect(withoutFinal.diffText.endsWith('+c')).toBe(true);
  });

  it('keeps Vietnamese combining marks and emoji verbatim', () => {
    const base = '# Mục tiêu\nNội dung tiếng Việt.';
    const next = '# Mục tiêu\nNội dung tiếng Việt. 🚀 thêm';
    const result = diff(base, next);
    expect(result.diffText).toContain('+Nội dung tiếng Việt. 🚀 thêm');
    expect(result.addedLines).toBe(1);
  });

  it('returns an identical-body diff with no hunks and zero counts', () => {
    const result = diff('a\nb', 'a\nb');
    expect(result).toEqual({ diffText: '', addedLines: 0, removedLines: 0 });
  });

  it('refuses an impossible matrix before allocating it', () => {
    const huge = Array.from({ length: 1200 }, (_, index) => `dòng ${index}`).join('\n');
    const other = Array.from({ length: 1200 }, (_, index) => `khác ${index}`).join('\n');
    const result = createUnifiedLineDiff(huge, other);
    expect((result as DiffBudgetRefusal).refused).toBe(true);
    expect((result as DiffBudgetRefusal).code).toBe('DIFF_BUDGET_EXCEEDED');
    expect((result as DiffBudgetRefusal).cap).toBe(MAX_DIFF_CELLS);
    expect((result as DiffBudgetRefusal).cells).toBeGreaterThan(MAX_DIFF_CELLS);
    expect((result as DiffBudgetRefusal).message).toContain('chia nhỏ');
  });

  it('trims a shared prefix and suffix so small edits stay cheap', () => {
    const shared = Array.from({ length: 4000 }, (_, index) => `dòng ${index}`).join('\n');
    const base = `${shared}\ncũ\n${shared}`;
    const next = `${shared}\nmới\n${shared}`;
    const result = createUnifiedLineDiff(base, next);
    expect((result as DiffBudgetRefusal).refused).toBeUndefined();
    expect((result as UnifiedLineDiff).addedLines).toBe(1);
    expect((result as UnifiedLineDiff).removedLines).toBe(1);
  });
});
