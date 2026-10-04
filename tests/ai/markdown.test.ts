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

  describe('wiki-links and attachment image rendering', () => {
    it('converts [[doc:uuid-123|Kiến trúc hệ thống]] into an interactive chip with doc icon', () => {
      const input = 'Check [[doc:uuid-123|Kiến trúc hệ thống]] for details';
      const html = renderSafeMarkdown(input);
      expect(html).toContain(
        '<span class="wiki-link-chip" data-entity-type="doc" data-entity-id="uuid-123" role="button" tabindex="0">📄 Kiến trúc hệ thống</span>'
      );
    });

    it('converts [[task:uuid-456|Viết unit test]] into an interactive chip with task icon', () => {
      const input = 'Related to [[task:uuid-456|Viết unit test]]';
      const html = renderSafeMarkdown(input);
      expect(html).toContain(
        '<span class="wiki-link-chip" data-entity-type="task" data-entity-id="uuid-456" role="button" tabindex="0">✅ Viết unit test</span>'
      );
    });

    it('converts [[project:uuid-789|Core Banking]] into an interactive chip with project icon', () => {
      const input = 'Belongs to [[project:uuid-789|Core Banking]]';
      const html = renderSafeMarkdown(input);
      expect(html).toContain(
        '<span class="wiki-link-chip" data-entity-type="project" data-entity-id="uuid-789" role="button" tabindex="0">📁 Core Banking</span>'
      );
    });

    it('falls back to entity ID if display title is omitted [[doc:uuid-123]]', () => {
      const input = 'Reference: [[doc:uuid-123]]';
      const html = renderSafeMarkdown(input);
      expect(html).toContain(
        '<span class="wiki-link-chip" data-entity-type="doc" data-entity-id="uuid-123" role="button" tabindex="0">📄 uuid-123</span>'
      );
    });

    it('converts ![Sơ đồ](attachment:uuid-999) into note-attachment-image without base64 bloat', () => {
      const input = '![Sơ đồ kiến trúc](attachment:uuid-999)';
      const html = renderSafeMarkdown(input);
      expect(html).toContain(
        '<img class="note-attachment-image" data-attachment-id="uuid-999" alt="Sơ đồ kiến trúc" />'
      );
    });

    it('sanitizes HTML characters inside wiki-link titles and image captions against XSS', () => {
      const input = '[[doc:safe-id|<img src=x onerror=alert(1)>]] and ![<script>bad</script>](attachment:att-123)';
      const html = renderSafeMarkdown(input);
      expect(html).not.toContain('<img src=x');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(html).toContain('alt="&lt;script&gt;bad&lt;/script&gt;"');
    });
  });
});
