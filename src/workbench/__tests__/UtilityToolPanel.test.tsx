import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { UtilityToolPanel } from '../toolwindows/UtilityToolPanel';
import { computeFoldRanges } from '../toolwindows/LineNumberedPane';
import { useUtilityToolContent } from '../toolwindows/utilityToolContentStore';

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

const saveMocks = vi.hoisted(() => ({
  createNote: vi.fn(async () => ({ id: 'doc-1' })),
  createObjectURL: vi.fn((_blob: Blob) => 'blob:test'),
  revokeObjectURL: vi.fn(),
  click: vi.fn(),
}));

vi.mock('../../db/repositories/noteRepo', () => ({
  createNote: saveMocks.createNote,
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
  useUtilityToolContent.getState().resetAll();
  saveMocks.createNote.mockClear();
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: saveMocks.createObjectURL });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: saveMocks.revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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

  it.each(['json_formatter', 'xml_formatter', 'text_compare', 'markdown_viewer'] as const)(
    'shows a line-number gutter in every pane of %s',
    (viewType) => {
      render(<UtilityToolPanel viewType={viewType} />);
      expect(screen.getAllByTestId('line-gutter')).toHaveLength(viewType === 'text_compare' ? 2 : 2);
    }
  );

  it('folds and expands a JSON object, keeping the opening row and its number together', () => {
    render(<UtilityToolPanel viewType="json_formatter" />);
    fireEvent.change(screen.getByLabelText('JSON input'), {
      target: { value: '{"a":{"inner":"hidden-value"},"tail":1}' },
    });
    fireEvent.click(screen.getByRole('button', { name: /format-painter Format/i }));
    const output = screen.getByLabelText('JSON output');
    expect(output.textContent).toContain('hidden-value');
    expect(output.textContent).toBe(
      '{\n  "a": {\n    "inner": "hidden-value"\n  },\n  "tail": 1\n}'
    );

    const fold = screen.getByRole('button', { name: 'Thu gọn dòng 2' });
    fireEvent.click(fold);
    expect(output.textContent).not.toContain('hidden-value');
    expect(output.textContent).toContain('…');
    expect(screen.queryByRole('button', { name: 'Thu gọn dòng 2' })).toBeNull();
    const expand = screen.getByRole('button', { name: 'Mở rộng dòng 2' });
    fireEvent.click(expand);
    expect(output.textContent).toBe(
      '{\n  "a": {\n    "inner": "hidden-value"\n  },\n  "tail": 1\n}'
    );
    expect(output.querySelector('span[style*="color"]')).not.toBeNull();
    expect(screen.getAllByTestId('line-gutter')[1]?.textContent).toContain('6');
  });

  it('folds and expands an XML element', () => {
    render(<UtilityToolPanel viewType="xml_formatter" />);
    fireEvent.change(screen.getByLabelText('XML input'), {
      target: { value: '<root><item><value>secret</value></item></root>' },
    });
    fireEvent.click(screen.getByRole('button', { name: /format-painter Format/i }));
    const output = screen.getByLabelText('XML output');
    expect(output.textContent).toContain('secret');

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn dòng 2' }));
    expect(output.textContent).not.toContain('secret');
    expect(screen.getByRole('button', { name: 'Mở rộng dòng 2' })).toBeDefined();
    expect(output.querySelector('span[style*="color"]')).not.toBeNull();
  });

  it('resets folding when the formatted output changes', () => {
    render(<UtilityToolPanel viewType="json_formatter" />);
    const input = screen.getByLabelText('JSON input');
    fireEvent.change(input, { target: { value: '{"a":{"x":1},"tail":1}' } });
    fireEvent.click(screen.getByRole('button', { name: /format-painter Format/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn dòng 2' }));
    expect(screen.getByLabelText('JSON output').textContent).not.toContain('"x"');
    fireEvent.change(input, { target: { value: '{"a":{"y":2},"tail":1}' } });
    fireEvent.click(screen.getByRole('button', { name: /format-painter Format/i }));
    expect(screen.getByLabelText('JSON output').textContent).toContain('"y"');
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

describe('UtilityToolPanel content persistence', () => {
  const cases = [
    { viewType: 'json_formatter' as const, editor: 'JSON input', value: '{"kept":1}' },
    { viewType: 'xml_formatter' as const, editor: 'XML input', value: '<kept/>' },
    { viewType: 'text_compare' as const, editor: 'Text B', value: 'kept-B' },
    { viewType: 'markdown_viewer' as const, editor: 'Markdown editor', value: '# kept' },
  ];

  it.each(cases)('keeps $editor content of $viewType across unmount/remount', ({ viewType, editor, value }) => {
    const first = render(<UtilityToolPanel viewType={viewType} />);
    fireEvent.change(screen.getByLabelText(editor), { target: { value } });
    first.unmount();
    render(<UtilityToolPanel viewType={viewType} />);
    expect((screen.getByLabelText(editor) as HTMLTextAreaElement).value).toBe(value);
  });

  it('resets JSON content and formatted output after Clear', () => {
    const first = render(<UtilityToolPanel viewType="json_formatter" />);
    const input = screen.getByLabelText('JSON input');
    fireEvent.change(input, { target: { value: '{"kept":1}' } });
    fireEvent.click(screen.getByRole('button', { name: /format-painter Format/i }));
    expect(screen.getByLabelText('JSON output').textContent).toContain('kept');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    first.unmount();
    render(<UtilityToolPanel viewType="json_formatter" />);
    expect((screen.getByLabelText('JSON input') as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByLabelText('JSON output').textContent).toBe('');
  });

  it('keeps content separate per instanceKey and survives unmount/remount', () => {
    const first = render(<UtilityToolPanel viewType="json_formatter" instanceKey="a" />);
    const second = render(<UtilityToolPanel viewType="json_formatter" instanceKey="b" />);
    const inputs = screen.getAllByLabelText('JSON input') as HTMLTextAreaElement[];
    expect(inputs).toHaveLength(2);

    fireEvent.change(inputs[0]!, { target: { value: 'alpha' } });
    expect((screen.getAllByLabelText('JSON input')[1] as HTMLTextAreaElement).value).toBe('');

    first.unmount();
    second.unmount();
    render(<UtilityToolPanel viewType="json_formatter" instanceKey="a" />);
    expect((screen.getByLabelText('JSON input') as HTMLTextAreaElement).value).toBe('alpha');
    render(<UtilityToolPanel viewType="json_formatter" instanceKey="b" />);
    expect((screen.getAllByLabelText('JSON input')[1] as HTMLTextAreaElement).value).toBe('');
  });

  it('falls back to the original viewType buffer for legacy tabs without instanceKey', () => {
    useUtilityToolContent.getState().patch('json_formatter', { input: 'legacy' });
    render(<UtilityToolPanel viewType="json_formatter" />);
    expect((screen.getByLabelText('JSON input') as HTMLTextAreaElement).value).toBe('legacy');
  });
});

describe('UtilityToolPanel Save as', () => {
  it.each([
    { viewType: 'json_formatter' as const, extension: 'json', editor: 'JSON input', content: '{"a":1}' },
    { viewType: 'xml_formatter' as const, extension: 'xml', editor: 'XML input', content: '<a/>' },
    { viewType: 'text_compare' as const, extension: 'txt', editor: 'Text B', content: 'plain text' },
    { viewType: 'markdown_viewer' as const, extension: 'md', editor: 'Markdown editor', content: '# md' },
  ])('opens the modal and downloads .$extension from $viewType via Blob URL', async ({ viewType, editor, content }) => {
    render(<UtilityToolPanel viewType={viewType} />);
    fireEvent.change(screen.getByLabelText(editor), { target: { value: content } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as' }));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByLabelText('Định dạng')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Tên file/doc'), { target: { value: 'my-file' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tải về máy' }));
    await waitFor(() => expect(saveMocks.createObjectURL).toHaveBeenCalledTimes(1));
    const blob = saveMocks.createObjectURL.mock.calls[0]![0];
    expect(await blob.text()).toBe(content);
    expect(saveMocks.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(saveMocks.createNote).not.toHaveBeenCalled();
  });

  it('saves JSON output content as a document in Docs', async () => {
    render(<UtilityToolPanel viewType="json_formatter" />);
    fireEvent.change(screen.getByLabelText('JSON input'), { target: { value: '{"a":1}' } });
    fireEvent.click(screen.getByRole('button', { name: /format-painter Format/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as' }));
    fireEvent.change(screen.getByLabelText('Tên file/doc'), { target: { value: 'my-doc' } });
    fireEvent.click(screen.getByLabelText('Lưu vào Docs'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu vào Docs' }));
    await waitFor(() => expect(saveMocks.createNote).toHaveBeenCalledTimes(1));
    expect(saveMocks.createNote).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'document', title: 'my-doc.json', body: '{\n  "a": 1\n}' }),
      expect.anything()
    );
  });
});

describe('computeFoldRanges', () => {
  it('ignores braces inside JSON strings and skips single-line objects/arrays', () => {
    const text = [
      '{',
      '  "a": "{ not a block }",',
      '  "b": [1, 2],',
      '  "c": {',
      '    "d": [',
      '      1',
      '    ]',
      '  }',
      '}',
    ].join('\n');
    expect(computeFoldRanges(text, 'json')).toEqual([
      { openLine: 0, closeLine: 8 },
      { openLine: 3, closeLine: 7 },
      { openLine: 4, closeLine: 6 },
    ]);
  });

  it('handles XML multiline elements and skips self-closing, comments and CDATA', () => {
    const text = [
      '<root>',
      '  <!-- <ghost> -->',
      '  <![CDATA[<raw>]]>',
      '  <empty />',
      '  <item>',
      '    <value>x</value>',
      '  </item>',
      '</root>',
    ].join('\n');
    expect(computeFoldRanges(text, 'xml')).toEqual([
      { openLine: 0, closeLine: 7 },
      { openLine: 4, closeLine: 6 },
    ]);
  });

  it('matches closing tags against the latest same-name open tag', () => {
    const text = ['<a>', '  <b>', '  </b>', '  <b>', '  </b>', '</a>'].join('\n');
    expect(computeFoldRanges(text, 'xml')).toEqual([
      { openLine: 0, closeLine: 5 },
      { openLine: 1, closeLine: 2 },
      { openLine: 3, closeLine: 4 },
    ]);
  });
});

