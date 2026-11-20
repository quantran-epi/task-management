import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultRow, CodePreview } from '../parts';
import { SearchEverywhereModal } from '../../SearchEverywhereModal';
import { registerAction, clearCustomActions } from '../../../actions/actionRegistry';

// Keep the render case deterministic — no async Dexie live-query updates to flush.
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => [] }));

const ROOT = resolve(__dirname, '../../../../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

// Only the D-03 surfaces plus adjacent global search rows are token-migrated (no whole-app rewrite).
const TOUCHED_COMPONENTS = [
  'src/workbench/search/find/FindInRemoteFiles.tsx',
  'src/workbench/search/find/parts.tsx',
  'src/workbench/toolwindows/RemoteGitExplorer.tsx',
  'src/workbench/search/SearchEverywhereModal.tsx',
];

describe('46.1 visual tokens — single source of truth', () => {
  let tokenCss: string;
  let mainTsx: string;
  let sources: Record<string, string>;

  beforeAll(() => {
    tokenCss = read('src/styles/workbench-tokens.css');
    mainTsx = read('src/main.tsx');
    sources = Object.fromEntries(TOUCHED_COMPONENTS.map((path) => [path, read(path)]));
  });

  it('declares the draft accent and match tokens in both light and dark blocks', () => {
    expect(tokenCss).toMatch(/--accent:\s*#2f62d8/);
    expect(tokenCss).toMatch(/--accent:\s*#6a9bff/);
    expect(tokenCss).toMatch(/--match:/);
    expect(tokenCss).toMatch(/--match-ink:/);
    expect(tokenCss).toContain('prefers-color-scheme: dark');
    expect(tokenCss).toContain(':root[data-theme="dark"]');
  });

  it('declares every compact row/control token consumed by the Find dialog', () => {
    for (const name of [
      '--row', '--tree-indent', '--tree-icon-size', '--tree-guide-width',
      '--find-field-height', '--find-toggle-height', '--find-pane-head-height',
      '--find-handle-height', '--find-results-height', '--find-preview-height',
      '--find-dialog-width', '--find-dialog-top', '--find-dialog-radius',
      '--find-code-line-height', '--find-gutter-width',
    ]) {
      expect(tokenCss).toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it('imports default per-weight Fontsource CSS, never subset-only CSS', () => {
    for (const weight of [400, 500, 600, 700]) {
      expect(mainTsx).toContain(`@fontsource/inter/${weight}.css`);
    }
    for (const weight of [400, 500, 600]) {
      expect(mainTsx).toContain(`@fontsource/ibm-plex-mono/${weight}.css`);
    }
    expect(mainTsx).not.toMatch(/@fontsource\/(inter|ibm-plex-mono)\/(vietnamese|latin)-/);
  });

  it('has bundled Vietnamese-capable font CSS with unicode-range at build time', () => {
    // The default per-weight CSS carries unicode-range for U+1EA0-1EF9; the build hashes both
    // Latin and Vietnamese woff2 into dist/assets (asserted separately by the build gate).
    expect(read('node_modules/@fontsource/inter/400.css')).toContain('U+1EA0-1EF9');
    expect(read('node_modules/@fontsource/ibm-plex-mono/400.css')).toContain('U+1EA0-1EF9');
  });

  it.each(TOUCHED_COMPONENTS)('%s contains no literal hex/rgba color', (path) => {
    expect(sources[path]!).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(sources[path]!).not.toMatch(/rgba?\(/);
  });

  it('keeps the old purple accent out of touched surfaces', () => {
    for (const path of [...TOUCHED_COMPONENTS, 'src/styles/workbench-tokens.css', 'src/workbench/AntdThemeAdapter.tsx']) {
      const content = path.endsWith('.css') || path.endsWith('.tsx') ? read(path) : '';
      expect(content).not.toMatch(/#5b4fe8/i);
    }
  });

  it('renders a Find result row and preview line using tokenized class names', () => {
    const { container } = render(
      <ResultRow text="needle value" ranges={[[0, 6]]} path="src/a.ts" line={3} active variant="content" />
    );
    expect(container.querySelector('.find-rrow.on .find-rcode mark')).toHaveTextContent('needle');
    expect(container.querySelector('.find-rfile')).toHaveTextContent('src/a.ts:3');

    const preview = render(<CodePreview content={'first\nneedle value'} pattern="needle" options={{ literal: true, matchCase: false, words: false }} activeLine={2} />);
    expect(preview.container.querySelector('.find-cline.cur .find-lno')).toHaveTextContent('2');
    expect(preview.container.querySelector('.find-cline.cur mark')).toHaveTextContent('needle');
  });

  it('renders global search rows that consume tokenized class/style values', async () => {
    clearCustomActions();
    registerAction({ id: 'visual.tokens.probe', title: 'Token Probe', category: 'Test', perform: () => {} });
    try {
      render(<SearchEverywhereModal open onClose={() => {}} />);
      expect(screen.getByText('Token Probe')).toBeInTheDocument();
      // The row's size and selection fill are token references, not one-off literals.
      const row = document.querySelector('[role="option"]') as HTMLElement | null;
      expect(row).not.toBeNull();
      expect(row!.style.height).toBe('var(--search-row-height)');
    } finally {
      clearCustomActions();
    }
  });
});
