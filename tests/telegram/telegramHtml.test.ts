import { describe, it, expect } from 'vitest';
import { escapeHtmlEntities, markdownToTelegramHtml } from '../../src/services/telegram/telegramHtml';

/** Fails if any tag is left open or a closer does not match the innermost opener. */
function expectBalancedTags(html: string) {
  const stack: string[] = [];
  for (const match of html.matchAll(/<\/?([a-zA-Z][\w-]*)(?:\s[^>]*)?>/g)) {
    const name = match[1]!;
    if (match[0].startsWith('</')) {
      expect(stack.pop()).toBe(name);
    } else {
      stack.push(name);
    }
  }
  expect(stack).toEqual([]);
}

describe('Telegram HTML Formatter', () => {
  it('escapes standard HTML entities', () => {
    expect(escapeHtmlEntities('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('converts markdown bold and italic into b and i tags', () => {
    const md = 'Hello **world** and *italic* text';
    const html = markdownToTelegramHtml(md);
    expect(html).toContain('<b>world</b>');
    expect(html).toContain('<i>italic</i>');
  });

  it('converts markdown headers to bold lines', () => {
    const md = '# Header 1\n## Header 2\nRegular text';
    const html = markdownToTelegramHtml(md);
    expect(html).toContain('<b>Header 1</b>');
    expect(html).toContain('<b>Header 2</b>');
    expect(html).toContain('Regular text');
  });

  it('preserves and escapes fenced code blocks', () => {
    const md = '```ts\nconst x = 1 < 2 && 3 > 1;\n```';
    const html = markdownToTelegramHtml(md);
    expect(html).toBe('<pre><code class="language-ts">const x = 1 &lt; 2 &amp;&amp; 3 &gt; 1;</code></pre>');
  });

  it('preserves and escapes inline code', () => {
    const md = 'Run `git checkout <branch>` to switch';
    const html = markdownToTelegramHtml(md);
    expect(html).toBe('Run <code>git checkout &lt;branch&gt;</code> to switch');
  });

  it('converts markdown links to telegram anchor tags', () => {
    const md = 'Visit [TaskMate](https://github.com/example/taskmate) today';
    const html = markdownToTelegramHtml(md);
    expect(html).toBe('Visit <a href="https://github.com/example/taskmate">TaskMate</a> today');
  });

  it('converts strikethrough markdown', () => {
    const md = 'This is ~~deleted~~ text';
    const html = markdownToTelegramHtml(md);
    expect(html).toBe('This is <s>deleted</s> text');
  });

  it('handles empty or blank inputs cleanly', () => {
    expect(markdownToTelegramHtml('')).toBe('');
  });

  it('converts bold spans that cross newlines', () => {
    const md = '**Các cột chính:\n- ISS_DATE\n- REG_DATE**';
    const html = markdownToTelegramHtml(md);
    expect(html).not.toContain('**');
    expect(html).toBe('<b>Các cột chính:\n- ISS_DATE\n- REG_DATE</b>');
  });

  it('converts nested italic inside bold without literal markers', () => {
    const html = markdownToTelegramHtml('**Đây là *quan trọng* cần nhớ**');
    expect(html).not.toContain('**');
    expect(html).not.toContain('*quan');
    expect(html).toBe('<b>Đây là <i>quan trọng</i> cần nhớ</b>');
  });

  it('converts italic spans that cross newlines', () => {
    expect(markdownToTelegramHtml('*dòng một\ndòng hai*')).toBe('<i>dòng một\ndòng hai</i>');
  });

  it('leaves snake_case and intraword underscores untouched', () => {
    const html = markdownToTelegramHtml('Dùng `user_name` và TXN_LOG_ID trong bảng');
    expect(html).toContain('<code>user_name</code>');
    expect(html).toContain('TXN_LOG_ID');
    expect(html).not.toContain('<i>');
  });

  it('renders pipe tables as aligned preformatted blocks', () => {
    const md = '| Cột | Kiểu |\n|---|---|\n| ISS_DATE | DATE |\n| AMOUNT | NUMBER |';
    const html = markdownToTelegramHtml(md);
    expect(html).not.toContain('| Cột |');
    expect(html).not.toContain('|---|---|');
    expect(html).toMatch(/^<pre>[\s\S]*ISS_DATE[\s\S]*<\/pre>$/);
    expect(html).toContain('AMOUNT');
  });

  it('renders blockquotes', () => {
    expect(markdownToTelegramHtml('> Lưu ý quan trọng')).toBe('<blockquote>Lưu ý quan trọng</blockquote>');
  });

  it('closes open emphasis before generated blockquote tags', () => {
    const html = markdownToTelegramHtml('> *quote\noutside*');
    expect(html).toBe('<blockquote><i>quote</i></blockquote><i>\noutside</i>');
    expectBalancedTags(html);
  });

  it('closes open emphasis before generated header tags', () => {
    const html = markdownToTelegramHtml('# *a\nb*');
    expect(html).toBe('<b><i>a</i></b><i>\nb</i>');
    expectBalancedTags(html);
  });

  it('closes open emphasis before generated link tags', () => {
    const html = markdownToTelegramHtml('[a*b](https://e.com) c*');
    expect(html).toBe('<a href="https://e.com">a<i>b</i></a><i> c</i>');
    expectBalancedTags(html);
  });

  it('escapes quotes in link URLs so the href attribute cannot break', () => {
    const html = markdownToTelegramHtml('[x](https://a/"b)');
    expect(html).toBe('<a href="https://a/&quot;b">x</a>');
    expectBalancedTags(html);
  });

  it('never emits cross-nested or unbalanced tags for mixed emphasis', () => {
    const samples = [
      '~~**bold strike**~~',
      '**bold with *nested italic* inside**',
      '**a ~~b~~ c**',
      '*a **b** c*',
      '**multi\nline *italic\nspan* bold**',
      '***both***',
    ];

    for (const sample of samples) {
      const html = markdownToTelegramHtml(sample);
      expect(html).not.toContain('**');
      expect(html).not.toContain('~~');
      const stack: string[] = [];
      for (const match of html.matchAll(/<\/?([a-zA-Z][\w-]*)(?:\s[^>]*)?>/g)) {
        const name = match[1]!;
        if (match[0].startsWith('</')) {
          expect(stack.pop()).toBe(name);
        } else {
          stack.push(name);
        }
      }
      expect(stack).toEqual([]);
    }
  });
});
