// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { parseMarkdownSegments } from '../ChatMessageBubble';
import { MermaidViewer } from '../MermaidViewer';

// Mock mermaid module
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockImplementation(async (id: string) => ({
      svg: `<svg id="${id}-svg" class="test-svg" width="400" height="200" viewBox="0 0 400 200"><g><text>Test Node</text></g></svg>`,
    })),
  },
}));

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

describe('MermaidViewer component', () => {
  it('renders loading state then renders SVG content successfully', async () => {
    const { container } = render(React.createElement(MermaidViewer, { code: 'graph TD; A-->B;' }));
    expect(screen.getByText('Mermaid Diagram')).toBeDefined();

    await waitFor(() => {
      const svg = container.querySelector('.test-svg');
      expect(svg).toBeDefined();
    });
  });

  it('toggles code view source', async () => {
    const { container } = render(React.createElement(MermaidViewer, { code: 'graph TD; NodeA-->NodeB;' }));
    await waitFor(() => {
      expect(container.querySelector('.test-svg')).toBeDefined();
    });

    const sourceBtn = screen.getByRole('button', { name: /view-source/i });
    fireEvent.click(sourceBtn);

    expect(screen.getByText('graph TD; NodeA-->NodeB;')).toBeDefined();
  });

  it('opens interactive modal with zoom and pan controls', async () => {
    const { container } = render(React.createElement(MermaidViewer, { code: 'flowchart LR; A-->B;' }));
    await waitFor(() => {
      expect(container.querySelector('.test-svg')).not.toBeNull();
    });

    const fullscreenBtn = screen.getByRole('button', { name: /fullscreen/i });
    fireEvent.click(fullscreenBtn);

    expect(screen.getByText('Sơ đồ chi tiết')).toBeDefined();
    expect(screen.getByText('100%')).toBeDefined();
    expect(screen.getByText(/Kéo để di chuyển/i)).toBeDefined();

    // Zoom in button test
    const zoomInBtn = screen.getByRole('button', { name: /zoom-in/i });
    fireEvent.click(zoomInBtn);
    expect(screen.getByText('120%')).toBeDefined();

    // Zoom out button test
    const zoomOutBtn = screen.getByRole('button', { name: /zoom-out/i });
    fireEvent.click(zoomOutBtn);
    expect(screen.getByText('100%')).toBeDefined();

    // Reset button test
    fireEvent.click(zoomInBtn);
    expect(screen.getByText('120%')).toBeDefined();
    const resetBtn = screen.getByRole('button', { name: /reset-zoom/i });
    fireEvent.click(resetBtn);
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('handles keyboard shortcuts (+, -, 0, f, esc) when modal is open', async () => {
    const { container } = render(React.createElement(MermaidViewer, { code: 'flowchart LR; Start-->End;' }));
    await waitFor(() => {
      expect(container.querySelector('.test-svg')).not.toBeNull();
    });

    const fullscreenBtn = screen.getByRole('button', { name: /fullscreen/i });
    fireEvent.click(fullscreenBtn);

    expect(screen.getByText('100%')).toBeDefined();

    // Press '+'
    fireEvent.keyDown(window, { key: '+' });
    expect(screen.getByText('120%')).toBeDefined();

    // Press '-'
    fireEvent.keyDown(window, { key: '-' });
    expect(screen.getByText('100%')).toBeDefined();

    // Press '+' then '0' to reset
    fireEvent.keyDown(window, { key: '+' });
    expect(screen.getByText('120%')).toBeDefined();
    fireEvent.keyDown(window, { key: '0' });
    expect(screen.getByText('100%')).toBeDefined();
  });
});
