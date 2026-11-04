import { describe, it, expect } from 'vitest';
import { buildSectionIndex } from '../../../src/utils/markdownSections';

const ids = (markdown: string) => buildSectionIndex(markdown).map((section) => section.id);
const titles = (markdown: string) => buildSectionIndex(markdown).map((section) => section.title);

describe('buildSectionIndex (D-05)', () => {
  it('returns an empty index for a document with zero headings', () => {
    expect(buildSectionIndex('chỉ có nội dung\nkhông có tiêu đề')).toEqual([]);
    expect(buildSectionIndex('')).toEqual([]);
  });

  it('numbers hierarchically with dotted ids and keeps duplicate titles unique', () => {
    const markdown = ['# A', '## Ghi chú', '### Ghi chú', '## Ghi chú'].join('\n');
    expect(ids(markdown)).toEqual(['1', '1.1', '1.1.1', '1.2']);
    expect(titles(markdown)).toEqual(['A', 'Ghi chú', 'Ghi chú', 'Ghi chú']);
  });

  it('nests a skipped heading level under the nearest preceding shallower heading', () => {
    const markdown = ['# A', '### Nhảy cấp', '##### Sâu hơn', '## Ngang'].join('\n');
    expect(ids(markdown)).toEqual(['1', '1.1', '1.1.1', '1.2']);
  });

  it('ignores headings inside backtick and tilde fences, including shorter inner runs', () => {
    const markdown = [
      '# Thật',
      '````md',
      '# giả trong backtick',
      '```',
      '# vẫn trong fence dài hơn',
      '````',
      '~~~',
      '## giả trong tilde',
      '~~~',
      '## Thật 2',
    ].join('\n');
    expect(titles(markdown)).toEqual(['Thật', 'Thật 2']);
    expect(ids(markdown)).toEqual(['1', '1.1']);
  });

  it('extends a section through its descendants up to the next same-or-shallower heading', () => {
    const markdown = [
      '# Cha',
      'thân cha',
      '## Con',
      'thân con',
      '### Cháu',
      'thân cháu',
      '## Con 2',
      'thân con 2',
      'Nội dung không tiêu đề',
    ].join('\n');
    const index = buildSectionIndex(markdown);
    expect(index.map((section) => [section.id, section.start, section.end])).toEqual([
      ['1', 0, 9],
      ['1.1', 2, 6],
      ['1.1.1', 4, 6],
      ['1.2', 6, 9],
    ]);
  });

  it('keeps ids stable across repeated reads and unrelated body edits', () => {
    const before = ['# A', 'thân A', '## B', 'thân B'].join('\n');
    const after = ['# A', 'thân A đã sửa', 'thêm dòng', '## B', 'thân B đã sửa'].join('\n');
    expect(ids(before)).toEqual(ids(after));
    expect(ids(before)).toEqual(ids(before));
  });

  it('handles CRLF documents without an off-by-one section bound', () => {
    const markdown = '# A\r\nthân A\r\n## B\r\nthân B';
    const index = buildSectionIndex(markdown);
    // Only deeper headings follow, so the root section runs to EOF.
    expect(index.map((section) => [section.id, section.start, section.end])).toEqual([
      ['1', 0, 4],
      ['1.1', 2, 4],
    ]);
  });

  it('strips trailing closing hashes from the title', () => {
    expect(titles('## Mục tiêu ##')).toEqual(['Mục tiêu']);
  });
});
