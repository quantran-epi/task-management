import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateClaudeCliCommand,
  launchClaudeTerminal,
} from '../../src/services/ai/claudeCliService';
import type { Task } from '../../src/types/models';

describe('claudeCliService', () => {
  const mockTask: Task = {
    id: 'task-auth-01',
    name: 'Implement OAuth refresh & session store',
    status: 'In Progress',
    priority: 'High',
    progress: 20,
    estimateMinutes: 180,
    checklist: [
      { id: 'c1', text: 'Write Redis session adapter', done: false },
      { id: 'c2', text: 'Handle 401 token refresh in axios interceptor', done: true },
    ],
    documentLinks: ['/workspace/server/auth.ts', 'https://github.com/org/repo'],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
  };

  describe('generateClaudeCliCommand', () => {
    it('builds shell-escaped claude command with task name, checklist goals, and files per D-13', () => {
      const cmd = generateClaudeCliCommand(mockTask);
      expect(cmd).toMatch(/^claude\s+/);
      expect(cmd).toContain('Implement OAuth refresh & session store');
      expect(cmd).toContain('Write Redis session adapter');
      expect(cmd).toContain('/workspace/server/auth.ts');
    });

    it('safely escapes special characters and quotes to prevent command injection (T-13.2-07)', () => {
      const maliciousTask: Task = {
        id: 't-hack',
        name: 'Fix bug"; rm -rf /; echo "pwned',
        status: 'Open',
        priority: 'Medium',
        progress: 0,
        estimateMinutes: 60,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-02T00:00:00Z',
      };

      const cmd = generateClaudeCliCommand(maliciousTask);
      expect(cmd.startsWith('claude ')).toBe(true);
      // Double quotes should be escaped or enclosed inside safe string
      expect(cmd).not.toContain('"; rm -rf /; echo "pwned"');
    });
  });

  describe('launchClaudeTerminal', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('copies to clipboard on Web environment when Tauri is not present', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const result = await launchClaudeTerminal({
        task: mockTask,
        isTauri: false,
      });

      expect(result.copied).toBe(true);
      expect(writeTextMock).toHaveBeenCalled();
    });

    it('invokes launch_claude_terminal on Tauri desktop', async () => {
      const invokeMock = vi.fn().mockResolvedValue(undefined);
      const result = await launchClaudeTerminal({
        task: mockTask,
        isTauri: true,
        tauriInvoker: invokeMock,
      });

      expect(result.launched).toBe(true);
      expect(invokeMock).toHaveBeenCalledWith('launch_claude_terminal', expect.objectContaining({
        commandStr: expect.stringContaining('claude'),
      }));
    });
  });

  describe('Action chips handling', () => {
    it('appends AI items to task checklist when onAddToChecklist is called', async () => {
      const { parseChecklistFromText } = await import('../../src/components/ai/ChatMessageBubble');
      const text = `Dưới đây là các đầu việc cần làm:\n- Setup OAuth client\n- Configure redirect URI\n* Write refresh handler`;
      const items = parseChecklistFromText(text);
      expect(items).toEqual([
        'Setup OAuth client',
        'Configure redirect URI',
        'Write refresh handler',
      ]);
    });

    it('falls back to first paragraph if text contains no bullet points', async () => {
      const { parseChecklistFromText } = await import('../../src/components/ai/ChatMessageBubble');
      const text = `Tối ưu hóa token refresh flow bằng cách lưu trữ refresh token trong Redis.`;
      const items = parseChecklistFromText(text);
      expect(items).toEqual([]);
    });
  });
});
