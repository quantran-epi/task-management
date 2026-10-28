// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseMarkdownSegments } from '../ChatMessageBubble';

describe('parseMarkdownSegments', () => {
  it('returns empty array on empty string', () => {
    expect(parseMarkdownSegments('')).toEqual([]);
  });

  it('parses pure markdown when no mermaid block is present', () => {
    const text = 'This is pure markdown text with some **bold** and `code`.';
    const segments = parseMarkdownSegments(text);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      type: 'markdown',
      content: text,
    });
  });

  it('correctly splits markdown and mermaid code block', () => {
    const text = `Dưới đây là sơ đồ quy trình:

\`\`\`mermaid
flowchart TD
  A[Bắt đầu] --> B{Kiểm tra}
  B -->|OK| C[Kết thúc]
\`\`\`

Bạn có thể tham khảo thêm.`;

    const segments = parseMarkdownSegments(text);
    expect(segments).toHaveLength(3);
    expect(segments[0]?.type).toBe('markdown');
    expect(segments[0]?.content).toContain('Dưới đây là sơ đồ quy trình:');
    expect(segments[1]?.type).toBe('mermaid');
    expect(segments[1]?.content).toBe('flowchart TD\n  A[Bắt đầu] --> B{Kiểm tra}\n  B -->|OK| C[Kết thúc]');
    expect(segments[2]?.type).toBe('markdown');
    expect(segments[2]?.content).toContain('Bạn có thể tham khảo thêm.');
  });

  it('handles mermaid code block at beginning or end', () => {
    const text = `\`\`\`mermaid
graph LR
  X --> Y
\`\`\``;
    const segments = parseMarkdownSegments(text);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      type: 'mermaid',
      content: 'graph LR\n  X --> Y',
    });
  });
});
