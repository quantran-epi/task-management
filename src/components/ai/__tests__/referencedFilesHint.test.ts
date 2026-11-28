// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { REFERENCED_FILES_HINT } from '../AIChatDrawer';

describe('REFERENCED_FILES_HINT (SSH attached files)', () => {
  it('does not instruct the model to call the removed local read_file tool', () => {
    expect(REFERENCED_FILES_HINT).not.toMatch(/read_file\s*\(/);
    expect(REFERENCED_FILES_HINT.toLowerCase()).not.toContain('call `read_file`');
  });

  it('names the SSH FS tools and the exact attached-path contract', () => {
    expect(REFERENCED_FILES_HINT).toContain('ssh_attached_file_info');
    expect(REFERENCED_FILES_HINT).toContain('ssh_attached_file_search');
    expect(REFERENCED_FILES_HINT).toContain('ssh_attached_file_read');
    expect(REFERENCED_FILES_HINT).toContain('SSH FS tools');
    expect(REFERENCED_FILES_HINT.toLowerCase()).not.toContain('browser file input');
    expect(REFERENCED_FILES_HINT.toLowerCase()).not.toContain('filereader');
    expect(REFERENCED_FILES_HINT.toLowerCase()).not.toContain('client-side');
    expect(REFERENCED_FILES_HINT.toLowerCase()).not.toContain('explicitly choose');
  });
});
