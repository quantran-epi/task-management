import { describe, it, expect } from 'vitest';
import {
  generateGhostDevMasterPrompt,
  formatInlineFeedbackPrompt,
} from '../../src/utils/ghostDevPrompt';
import type { Task } from '../../src/types/models';

describe('ghostDevPrompt', () => {
  const baseTask: Task = {
    id: 'test-task-1',
    name: 'Implement Ghost Dev Stream',
    description: 'Connect Tauri IPC stream-json chunks to React view',
    status: 'In Progress',
    priority: 'High',
    progress: 30,
    estimateMinutes: 120,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    checklist: [
      { id: 'c1', text: 'Define chunk types', done: true },
      { id: 'c2', text: 'Listen to tauri event', done: false },
      { id: 'c3', text: 'Render auto-scroll terminal', done: false },
    ],
  };

  it('generateGhostDevMasterPrompt formats task title, repo path, description, and pending checklist items', () => {
    const prompt = generateGhostDevMasterPrompt(baseTask, '/Users/dev/repo');
    expect(prompt).toContain('Master/Lead Agent');
    expect(prompt).toContain('Implement Ghost Dev Stream');
    expect(prompt).toContain('/Users/dev/repo');
    expect(prompt).toContain('Git worktree riêng biệt');
    expect(prompt).toContain('Connect Tauri IPC stream-json chunks to React view');
    expect(prompt).not.toContain('Define chunk types');
    expect(prompt).toContain('Listen to tauri event');
    expect(prompt).toContain('Render auto-scroll terminal');
  });

  it('formatInlineFeedbackPrompt produces markdown with file path, line number, code block, and user comment per D-13', () => {
    const formatted = formatInlineFeedbackPrompt(
      'src/components/Header.tsx',
      42,
      'const title = "Old";',
      'Change title to "Ghost Dev Center"'
    );
    expect(formatted).toContain('- Tập tin: `src/components/Header.tsx`');
    expect(formatted).toContain('- Dòng: 42');
    expect(formatted).toContain('```\nconst title = "Old";\n```');
    expect(formatted).toContain('- Yêu cầu chỉnh sửa: Change title to "Ghost Dev Center"');
  });
});
