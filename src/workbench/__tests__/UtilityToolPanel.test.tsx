import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { UtilityToolPanel } from '../toolwindows/UtilityToolPanel';

const mocks = vi.hoisted(() => ({
  queue: [] as string[],
  config: {
    endpoint: 'http://x',
    defaultModel: 'gpt-4o',
    charLimit: 12000,
    contextWindowTokens: 200000,
  },
  getConfig: vi.fn(),
  getKey: vi.fn(),
}));

vi.mock('../../services/ai/nineRouterTokenService', () => ({
  getNineRouterConfig: mocks.getConfig,
  getNineRouterApiKey: mocks.getKey,
  DEFAULT_NINEROUTER_MODEL: 'gpt-4o',
}));

vi.mock('../../services/ai/nineRouterClient', () => ({
  stripThinkingBlocks: (raw: string) =>
    raw
      .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
      .replace(/<think(?:ing)?>[\s\S]*$/gi, '')
      .trim(),
  streamChatCompletion: vi.fn(async function* () {
    for (const chunk of mocks.queue) yield chunk;
  }),
}));

beforeEach(() => {
  mocks.queue = [];
  mocks.getConfig.mockResolvedValue(mocks.config);
  mocks.getKey.mockResolvedValue('test-key');
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('UtilityToolPanel', () => {
  it.each(['json_formatter', 'xml_formatter', 'text_compare', 'markdown_viewer'] as const)(
    'shows a divider between panes in %s',
    (viewType) => {
      render(<UtilityToolPanel viewType={viewType} />);
      const separators = screen.getAllByRole('separator');
      expect(separators).toHaveLength(1);
      expect(separators[0]?.getAttribute('aria-orientation')).toBe('vertical');
      expect(separators[0]?.style.background).toContain('var(--border-strong');
    }
  );

  it('formats JSON with syntax-colored output and reports invalid input', () => {
    render(<UtilityToolPanel viewType="json_formatter" />);
    const input = screen.getByLabelText('JSON input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '{"name":"TaskMate","ok":true}' } });
    fireEvent.click(screen.getByRole('button', { name: /format-painter Format/i }));

    const output = screen.getByLabelText('JSON output');
    expect(output.textContent).toContain('"name": "TaskMate"');
    expect(output.querySelector('span[style*="color"]')).not.toBeNull();

    fireEvent.change(input, { target: { value: '{bad}' } });
    fireEvent.click(screen.getByRole('button', { name: /format-painter Format/i }));
    expect(screen.getAllByText(/❌/).length).toBeGreaterThan(0);
  });

  it('formats and minifies valid XML', () => {
    render(<UtilityToolPanel viewType="xml_formatter" />);
    const input = screen.getByLabelText('XML input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '<note><to>Quan</to></note>' } });
    fireEvent.click(screen.getByRole('button', { name: /format-painter Format/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /format-painter Format/i }));

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

describe('UtilityToolPanel AI assistant wiring', () => {
  const cases = [
    { viewType: 'json_formatter' as const, tool: 'JSON Formatter', editor: 'JSON input', original: '{"a":1}' },
    { viewType: 'xml_formatter' as const, tool: 'XML Formatter', editor: 'XML input', original: '<a/>' },
    { viewType: 'text_compare' as const, tool: 'Text Compare', editor: 'Text B', original: 'new' },
    { viewType: 'markdown_viewer' as const, tool: 'Markdown Viewer', editor: 'Markdown editor', original: '# hi' },
  ];

  it.each(cases)('opens AI for $tool with the editor content', async ({ viewType, tool, editor, original }) => {
    render(<UtilityToolPanel viewType={viewType} />);
    fireEvent.change(screen.getByLabelText(editor), { target: { value: original } });
    fireEvent.click(screen.getByRole('button', { name: `AI · ${tool}` }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(`AI · ${tool}`)).toBeDefined();
    await waitFor(() => expect(within(dialog).getByText(original)).toBeDefined());
  });

  it('passes pane A as read-only context for Text Compare', async () => {
    render(<UtilityToolPanel viewType="text_compare" />);
    fireEvent.change(screen.getByLabelText('Text A'), { target: { value: 'original-A' } });
    fireEvent.change(screen.getByLabelText('Text B'), { target: { value: 'new-B' } });
    fireEvent.click(screen.getByRole('button', { name: 'AI · Text Compare' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.textContent).toContain('A — GỐC (tham khảo)'));
    mocks.queue = ['```\napplied-B\n```'];
    fireEvent.change(within(dialog).getByLabelText('Yêu cầu sửa'), { target: { value: 'sửa B' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo' }));
    await waitFor(() => expect(within(dialog).getByText('applied-B')).toBeDefined());
    fireEvent.click(within(dialog).getByRole('button', { name: /Áp dụng/ }));
    expect((screen.getByLabelText('Text A') as HTMLTextAreaElement).value).toBe('original-A');
    expect((screen.getByLabelText('Text B') as HTMLTextAreaElement).value).toBe('applied-B');
  });

  it('applies streamed fenced output to the editor only after confirm', async () => {
    mocks.queue = ['```json\n{"ok":true}\n```'];
    render(<UtilityToolPanel viewType="json_formatter" />);
    const editor = screen.getByLabelText('JSON input') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: '{"old":1}' } });
    fireEvent.click(screen.getByRole('button', { name: 'AI · JSON Formatter' }));
    const formDialog = await screen.findByRole('dialog');
    fireEvent.change(within(formDialog).getByLabelText('Yêu cầu sửa'), { target: { value: 'sửa' } });
    fireEvent.click(within(formDialog).getByRole('button', { name: 'Tạo' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Chỉnh sửa'));
    await waitFor(() => expect((within(dialog).getByLabelText('Nội dung đề xuất') as HTMLTextAreaElement).value).toBe('{"ok":true}'));
    expect(editor.value).toBe('{"old":1}');
    fireEvent.click(within(dialog).getByRole('button', { name: /Áp dụng/ }));
    expect(editor.value).toBe('{"ok":true}');
  });

  it('keeps the editor untouched in ask mode', async () => {
    mocks.queue = ['**giải thích**'];
    render(<UtilityToolPanel viewType="markdown_viewer" />);
    const editor = screen.getByLabelText('Markdown editor') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: '# giữ nguyên' } });
    fireEvent.click(screen.getByRole('button', { name: 'AI · Markdown Viewer' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Hỏi về nội dung'));
    fireEvent.change(within(dialog).getByLabelText('Câu hỏi'), { target: { value: 'là gì?' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo' }));
    await waitFor(() => expect(within(dialog).getByText('giải thích')).toBeDefined());
    expect(within(dialog).queryByRole('button', { name: /Áp dụng/ })).toBeNull();
    expect(editor.value).toBe('# giữ nguyên');
  });
});

