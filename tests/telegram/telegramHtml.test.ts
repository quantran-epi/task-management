import { describe, it, expect } from 'vitest';
import { escapeHtmlEntities, markdownToTelegramHtml } from '../../src/services/telegram/telegramHtml';

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
});
