import { describe, expect, it } from 'vitest';
import { hitsToMatchRows, matchRanges, previewMatchRanges } from '../parsing';
import type { RemoteGrepHit } from '../../../../types/gitRemote';

const hits: RemoteGrepHit[] = [
  { path: 'src/a.ts', line: 1, text: 'const needle = needle;' },
  { path: 'src/b.ts', line: 9, text: 'NEEDLE upper' },
  { path: 'src/c.ts', line: 12, text: 'plain text' },
];

function decode(text: string, ranges: Array<[number, number]>): string {
  return ranges.map(([s, e]) => text.slice(s, e)).join('|');
}

describe('parsing — MatchRow mapping from committed RemoteGrepHit[] (Task 2)', () => {
  it('preserves path/line/text and produces exactly one row per committed hit', () => {
    const rows = hitsToMatchRows(hits, 'needle', {
      literal: true,
      matchCase: false,
      words: false,
    });
    expect(rows).toHaveLength(hits.length);
    expect(rows.map((r) => [r.path, r.line, r.text])).toEqual(
      hits.map((h) => [h.path, h.line, h.text])
    );
  });

  it('computes correct UTF-16 ranges for a literal, case-insensitive pattern', () => {
    const rows = hitsToMatchRows(hits, 'needle', {
      literal: true,
      matchCase: false,
      words: false,
    });
    expect(decode(rows[0]!.text, rows[0]!.ranges)).toBe('needle|needle');
    expect(decode(rows[1]!.text, rows[1]!.ranges)).toBe('NEEDLE');
    expect(rows[2]!.ranges).toEqual([]);
  });

  it('matches whole words only in words mode; a non-matching pattern yields no ranges', () => {
    const rows = hitsToMatchRows([{ path: 'x', line: 1, text: 'needle needler' }], 'needle', {
      literal: true,
      matchCase: true,
      words: true,
    });
    expect(decode(rows[0]!.text, rows[0]!.ranges)).toBe('needle');
    expect(matchRanges('nothing here', 'zzz', { literal: true, matchCase: true, words: false })).toEqual([]);
  });

  it('supports regex patterns and accent-aware literal patterns', () => {
    const regex = matchRanges('abc123 abc456', 'abc[0-9]+', {
      literal: false,
      matchCase: true,
      words: false,
    });
    expect(decode('abc123 abc456', regex)).toBe('abc123|abc456');
    const viet = matchRanges('Tìm trong tệp tìm', 'tìm', {
      literal: true,
      matchCase: false,
      words: false,
    });
    expect(decode('Tìm trong tệp tìm', viet)).toBe('Tìm|tìm');
  });

  it('previewMatchRanges marks all occurrences in a loaded file with line numbers', () => {
    const marks = previewMatchRanges('one needle\ntwo needle\n', 'needle', {
      literal: true,
      matchCase: false,
      words: false,
    });
    expect(marks).toHaveLength(2);
    expect(marks[0]).toMatchObject({ line: 1 });
    expect(marks[1]).toMatchObject({ line: 2 });
  });
});
