// @vitest-environment node
// Guard against regressing to local file attach or gating SSH attach to standalone chat only.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const chatInputBarSource = readFileSync(new URL('../ChatInputBar.tsx', import.meta.url), 'utf8');
const drawerSource = readFileSync(new URL('../AIChatDrawer.tsx', import.meta.url), 'utf8');

describe('AI chat attach surface (quick 261128-i9x)', () => {
  it('has no local file attach path left in the composer', () => {
    for (const banned of [
      'handlePickFile',
      'select_local_file',
      'readBrowserFileText',
      'PaperClipOutlined',
    ]) {
      expect(chatInputBarSource).not.toContain(banned);
    }
  });

  it('shows the SSH browser on every surface and keeps multi-attach intact', () => {
    expect(chatInputBarSource).not.toMatch(/isStandaloneChat\s*&&\s*\(/);
    expect(chatInputBarSource).toContain('FolderOpenOutlined');
    expect(chatInputBarSource).toContain('<StandaloneSshFileBrowser');
    expect(chatInputBarSource).toContain('onAttachFiles(paths)');
    expect(chatInputBarSource).toContain('onAttachFile?.(path)');
  });

  it('describes SSH-attached paths in the referenced-files hint', () => {
    expect(drawerSource).toContain('ssh_attached_file_info');
    expect(drawerSource).toContain('ssh_attached_file_search');
    expect(drawerSource).toContain('ssh_attached_file_read');
    expect(drawerSource).not.toMatch(/browser file input|FileReader/i);
  });
});
