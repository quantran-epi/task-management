import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CodePreview, HighlightedText, FolderPreview } from '../parts';
import { matchRanges } from '../parsing';

describe('parts.tsx — range-based highlighted rendering (T-46.1-07)', () => {
  it('HighlightedText renders <mark> only on match ranges, plain text as text nodes', () => {
    const text = 'const needle = 1;';
    const ranges = matchRanges(text, 'needle', { literal: true, matchCase: true, words: false });
    const { container } = render(<HighlightedText text={text} ranges={ranges} />);
    expect(container.querySelectorAll('mark')).toHaveLength(1);
    expect(container.querySelector('mark')!.textContent).toBe('needle');
    expect(container.textContent).toBe(text);
    expect(container.innerHTML).not.toContain('dangerouslySetInnerHTML');
  });

  it('skips overlapping/out-of-order ranges without broken markup', () => {
    // Canonical algorithm walks ranges in order and skips any s < pos: the first [4,6] wins,
    // [0,3] and [1,5] are out of order and dropped. Text stays complete, markup stays valid.
    const { container } = render(<HighlightedText text="abcdef" ranges={[[4, 6], [0, 3], [1, 5]]} />);
    const marks = Array.from(container.querySelectorAll('mark')).map((m) => m.textContent);
    expect(marks).toEqual(['ef']);
    expect(container.textContent).toBe('abcdef');
  });

  it('CodePreview wraps all matches in <mark> and scrolls the active line to center', () => {
    const content = 'one needle\ntwo needle\nthree';
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { container } = render(
      <CodePreview
        content={content}
        pattern="needle"
        options={{ literal: true, matchCase: false, words: false }}
        activeLine={2}
      />
    );
    expect(container.querySelectorAll('mark')).toHaveLength(2);
    expect(container.querySelector('.find-cline.cur')).toBeDefined();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    scrollIntoView.mockRestore();
  });

  it('FolderPreview shows a concise folder listing without dangerouslySetInnerHTML', () => {
    const { container } = render(<FolderPreview entries={['src/main', 'src/test']} />);
    expect(container.textContent).toContain('src/main');
    expect(container.textContent).toContain('src/test');
    expect(container.innerHTML).not.toContain('dangerouslySetInnerHTML');
  });
});
