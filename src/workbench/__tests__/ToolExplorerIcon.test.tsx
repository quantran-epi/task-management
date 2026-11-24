import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { toolExplorerIcon } from '../toolExplorerIcon';

const ROOT = resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('toolExplorerIcon — one glyph for stripe and right-panel header', () => {
  it.each([16, 13])('renders the Appstore glyph at size %i, never ToolOutlined', (size) => {
    const { container, unmount } = render(<div>{toolExplorerIcon(size)}</div>);
    const glyph = container.querySelector('.anticon-appstore') as HTMLElement;
    expect(glyph).not.toBeNull();
    expect(glyph.style.fontSize).toBe(`${size}px`);
    expect(container.querySelector('.anticon-tool')).toBeNull();
    unmount();
  });

  it('is the single icon source in WorkbenchLayout and RightToolWindow', () => {
    const stripe = read('src/workbench/WorkbenchLayout.tsx');
    const header = read('src/workbench/toolwindows/RightToolWindow.tsx');
    expect(stripe).toContain('toolExplorerIcon(16)');
    expect(header).toContain('toolExplorerIcon(13)');
    expect(stripe).not.toContain('AppstoreOutlined');
    expect(header).not.toContain('ToolOutlined');
  });
});
