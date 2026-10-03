import { describe, it, expect } from 'vitest';
import { renderSafeMarkdown } from '../../src/utils/markdown';

describe('renderSafeMarkdown rich markdown rendering', () => {
  it('renders fenced code blocks with language class and preserves code content', () => {
    const input = '```typescript\nconst add = (a: number, b: number) => a + b;\n```';
    const html = renderSafeMarkdown(input);
    expect(html).toContain('<pre class="code-block"><code class="language-typescript">');
    expect(html).toContain('const add = (a: number, b: number) =&gt; a + b;');
    expect(html).toContain('</code></pre>');
  });

  it('handles streaming/unclosed code blocks safely', () => {
    const input = '```python\nprint("streaming chunk")';
    const html = renderSafeMarkdown(input);
    expect(html).toContain('<pre class="code-block"><code class="language-python">');
    expect(html).toContain('print(&quot;streaming chunk&quot;)');
  });

  it('renders unordered and ordered lists wrapped in proper containers', () => {
    const input = `- Item 1\n- Item 2\n* Item 3\n\n1. First\n2. Second`;
    const html = renderSafeMarkdown(input);
    expect(html).toContain('<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>');
    expect(html).toContain('<ol><li>First</li><li>Second</li></ol>');
  });

  it('renders task list items with checkbox state', () => {
    const input = `- [ ] Open task\n- [x] Completed task`;
    const html = renderSafeMarkdown(input);
    expect(html).toContain('class="task-item"');
    expect(html).toContain('<input type="checkbox" disabled /> Open task');
    expect(html).toContain('<input type="checkbox" checked disabled /> Completed task');
  });

  it('renders blockquotes and horizontal rules', () => {
    const input = `> Important note\n> Second line\n\n---`;
    const html = renderSafeMarkdown(input);
    expect(html).toContain('<blockquote><p>Important note</p><p>Second line</p></blockquote>');
    expect(html).toContain('<hr />');
  });

  it('renders paragraphs and inline formatting properly', () => {
    const input = `Hello world with **bold**, *italic*, ~~strikethrough~~ and \`code\`.\n\nSecond paragraph [link](https://test.com).`;
    const html = renderSafeMarkdown(input);
    expect(html).toContain('<p>Hello world with <strong>bold</strong>, <em>italic</em>, <del>strikethrough</del> and <code>code</code>.</p>');
    expect(html).toContain('<p>Second paragraph <a href="https://test.com" target="_blank" rel="noopener noreferrer">link</a>.</p>');
  });

  it('neutralizes malicious XSS script injection and javascript urls', () => {
    const input = `<script>alert(1)</script>\n[evil](javascript:alert(1))`;
    const html = renderSafeMarkdown(input);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('href="javascript:');
  });
});
