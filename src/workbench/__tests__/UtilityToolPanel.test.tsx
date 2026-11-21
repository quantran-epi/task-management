import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UtilityToolPanel } from '../toolwindows/UtilityToolPanel';

describe('UtilityToolPanel', () => {
  it('formats JSON with syntax-colored output and reports invalid input', () => {
    render(<UtilityToolPanel viewType="json_formatter" />);
    const input = screen.getByLabelText('JSON input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '{"name":"TaskMate","ok":true}' } });
    fireEvent.click(screen.getByRole('button', { name: /Format/i }));

    const output = screen.getByLabelText('JSON output');
    expect(output.textContent).toContain('"name": "TaskMate"');
    expect(output.querySelector('span[style*="color"]')).not.toBeNull();

    fireEvent.change(input, { target: { value: '{bad}' } });
    fireEvent.click(screen.getByRole('button', { name: /Format/i }));
    expect(screen.getAllByText(/❌/).length).toBeGreaterThan(0);
  });

  it('formats and minifies valid XML', () => {
    render(<UtilityToolPanel viewType="xml_formatter" />);
    const input = screen.getByLabelText('XML input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '<note><to>Quan</to></note>' } });
    fireEvent.click(screen.getByRole('button', { name: /Format/i }));
    const output = screen.getByLabelText('XML output');
    expect(output.textContent).toContain('<to>Quan</to>');
    expect(output.textContent).toContain('\n');

    fireEvent.click(screen.getByRole('button', { name: /Minify/i }));
    expect(output.textContent).toBe('<note><to>Quan</to></note>');
  });

  it('preserves XML comments, CDATA and mixed content', () => {
    render(<UtilityToolPanel viewType="xml_formatter" />);
    const input = screen.getByLabelText('XML input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '<root><!-- keep this --><![CDATA[<raw>]]><?pi go?><p>Hello <b>world</b>!</p></root>' } });
    fireEvent.click(screen.getByRole('button', { name: /Format/i }));

    const output = screen.getByLabelText('XML output');
    expect(output.textContent).toContain('<!-- keep this -->');
    expect(output.textContent).toContain('<![CDATA[<raw>]]>');
    expect(output.textContent).toContain('<?pi go?>');
    expect(output.textContent).toContain('Hello <b>world</b>!');
  });

  it('detects added and removed lines in Text Compare', () => {
    render(<UtilityToolPanel viewType="text_compare" />);
    fireEvent.change(screen.getByLabelText('Text A'), { target: { value: 'one\ntwo' } });
    fireEvent.change(screen.getByLabelText('Text B'), { target: { value: 'one\nthree' } });

    expect(screen.getByText(/2 thay đổi/)).toBeDefined();
    expect(screen.getAllByText(/three/).length).toBeGreaterThan(1);
  });

  it('renders full Markdown syntax in the live preview', () => {
    render(<UtilityToolPanel viewType="markdown_viewer" />);
    const editor = screen.getByLabelText('Markdown editor');
    fireEvent.change(editor, {
      target: {
        value: [
          '# Tiêu đề',
          '**đậm**',
          '- [x] việc xong',
          '',
          '| Cột 1 | Cột 2 |',
          '| --- | --- |',
          '| a | b |',
          '',
          '```js',
          'const x = 1;',
          '```',
          '',
          '> trích dẫn',
          '',
          '[link](https://example.com) ![ảnh](https://example.com/a.png)',
        ].join('\n'),
      },
    });

    const preview = screen.getByLabelText('Markdown preview');
    expect(preview.querySelector('h1')?.textContent).toContain('Tiêu đề');
    expect(preview.querySelector('strong')?.textContent).toContain('đậm');
    expect(preview.querySelector('input[type="checkbox"][disabled]')).toHaveProperty('checked', true);
    expect(preview.querySelector('.markdown-table')).not.toBeNull();
    expect(preview.querySelector('.code-block')).not.toBeNull();
    expect(preview.querySelector('blockquote')).not.toBeNull();
    const link = preview.querySelector('a');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(preview.querySelector('img')).not.toBeNull();
  });

  it('syncs scroll between editor and preview proportionally without bounce', () => {
    // The hook releases its bounce guard in requestAnimationFrame — run it inline so each
    // fired scroll is a fresh sync (jsdom does not emit scroll events when scrollTop changes).
    const originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 0; }) as typeof requestAnimationFrame;
    try {
    render(<UtilityToolPanel viewType="markdown_viewer" />);
    const editor = screen.getByLabelText('Markdown editor') as HTMLTextAreaElement;
    const preview = screen.getByLabelText('Markdown preview') as HTMLDivElement;

    // jsdom reports zero heights — stub the scroll geometry on both panes.
    const stub = (el: HTMLElement, scrollHeight: number, clientHeight: number) => {
      Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
      Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
    };
    stub(editor, 1000, 100);
    stub(preview, 400, 100);
    editor.scrollTop = 450;
    fireEvent.scroll(editor);
    expect(preview.scrollTop).toBeCloseTo(150, 5);

    preview.scrollTop = 300;
    fireEvent.scroll(preview);
    expect(editor.scrollTop).toBeCloseTo(900, 5);

    // Guard: when source does not overflow, the other pane is not moved.
    stub(editor, 100, 100);
    editor.scrollTop = 0;
    preview.scrollTop = 42;
    fireEvent.scroll(editor);
    expect(preview.scrollTop).toBe(42);
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
    }
  });
});
