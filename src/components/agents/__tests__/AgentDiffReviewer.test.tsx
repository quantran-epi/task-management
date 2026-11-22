import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AgentDiffReviewer } from '../AgentDiffReviewer';
import type { DiffFile } from '../../../types/agent';

const deepDiff: DiffFile = {
  oldPath: 'com/acme/orders/OrderService.java',
  newPath: 'com/acme/orders/OrderService.java',
  status: 'modified',
  hunks: [],
  additions: 3,
  deletions: 1,
};

const allFiles = [
  'com/acme/orders/OrderService.java',
  'com/acme/orders/Order.java',
  'other/Readme.md',
];

function renderReviewer(selectedFilePath: string | null = null, onSelectFilePath = vi.fn()) {
  const props = {
    diffFiles: [deepDiff],
    allWorktreeFiles: allFiles,
    totalAdditions: 3,
    totalDeletions: 1,
    viewMode: 'split' as const,
    onViewModeChange: vi.fn(),
    selectedFilePath,
    onSelectFilePath,
    selectedFile: deepDiff,
    loading: false,
    onAcceptAll: vi.fn(async () => 'ok'),
    onRevertAll: vi.fn(async () => {}),
    onRevertFile: vi.fn(async () => {}),
  };
  const view = render(<AgentDiffReviewer {...props} />);
  return { ...view, onSelectFilePath };
}

function treeTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-oi-control="tree-label"]')).map((el) => el.textContent ?? '');
}

describe('AgentDiffReviewer compact tree', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('gộp chain folder con single-child thành một nhãn dotted, giảm số treenode', () => {
    const { container } = renderReviewer();
    const titles = treeTitles(container);
    expect(titles.some((t) => t.includes('com.acme.orders'))).toBe(true);
    expect(titles).not.toContain('acme');
    expect(container.querySelectorAll('[data-oi-control="tree-row"]').length).toBeLessThan(6);
  });

  it('click leaf compact gọi onSelectFilePath với path cuối cùng của chain', async () => {
    const { container, onSelectFilePath } = renderReviewer();
    const node = Array.from(container.querySelectorAll<HTMLElement>('[data-oi-control="tree-row"]')).find((el) =>
      el.querySelector('[data-oi-control="tree-label"]')?.textContent?.includes('OrderService.java')
    );
    expect(node).toBeDefined();
    fireEvent.click(node!);
    await waitFor(() => {
      expect(onSelectFilePath).toHaveBeenCalledWith('com/acme/orders/OrderService.java');
    });
  });

  it('highlight node gộp khi selectedFilePath là path sâu', () => {
    const { container } = renderReviewer('com/acme/orders/OrderService.java');
    const selected = container.querySelectorAll('[data-oi-control="tree-row"][data-state="selected"]');
    expect(selected.length).toBeGreaterThan(0);
    expect(selected[0]?.textContent).toContain('OrderService.java');
  });

  it('search vẫn lọc đúng raw path trước khi compact', async () => {
    const { container } = renderReviewer();
    fireEvent.click(screen.getByText('Tất cả (3)'));
    const search = screen.getByPlaceholderText('Tìm tập tin...');
    fireEvent.change(search, { target: { value: 'Readme' } });
    await waitFor(() => {
      const titles = treeTitles(container);
      expect(titles.some((t) => t.includes('Readme.md'))).toBe(true);
      expect(titles.some((t) => t.includes('OrderService.java'))).toBe(false);
    }, { timeout: 2000 });
  });

  it('diff folder sâu vẫn hiển thị node con sau khi gộp (key map reveal)', () => {
    const { container } = renderReviewer('com/acme/orders/OrderService.java');
    const titles = treeTitles(container);
    expect(titles.some((t) => t.includes('com.acme.orders'))).toBe(true);
    expect(titles.some((t) => t.includes('OrderService.java'))).toBe(true);
  });
});

describe('.agent-diff-tree CSS contract', () => {
  it('dùng token có sẵn, không !important trong block scoped', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/workbench-tokens.css'), 'utf8');
    const start = css.indexOf('.agent-diff-tree');
    expect(start).toBeGreaterThan(-1);
    // Scope to this block only; later utility-tool rules are unrelated.
    const block = css.slice(start, css.indexOf('/* Utility tool editor', start));
    for (const token of [
      'var(--row)',
      'var(--tree-indent)',
      'var(--tree-icon-size)',
      'var(--font-mono)',
      'var(--font-size-small)',
      'var(--accent-soft)',
      'var(--bg-hover)',
    ]) {
      expect(block).toContain(token);
    }
    expect(block).not.toContain('!important');
  });
});
