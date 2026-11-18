// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { REFERENCED_FILES_HINT } from '../AIChatDrawer';

describe('REFERENCED_FILES_HINT (checkpoint 261118-cz2, browser-filereader)', () => {
  it('does not instruct the model to call the removed local read_file tool', () => {
    expect(REFERENCED_FILES_HINT).not.toMatch(/read_file\s*\(/);
    expect(REFERENCED_FILES_HINT.toLowerCase()).not.toContain('call `read_file`');
  });

  it('explains that content requires an explicit browser file-input selection', () => {
    expect(REFERENCED_FILES_HINT).toContain('browser file input');
    expect(REFERENCED_FILES_HINT).toContain('explicitly choose');
    expect(REFERENCED_FILES_HINT).toContain('sanitizes');
    expect(REFERENCED_FILES_HINT).toContain('SSH FS tools');
  });
});
