// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { extractMentionedEntityIds } from '../contextGrounding';
import { AI_DATABASE_TOOLS, executeAiTool } from '../aiTools';
import { clearThreadMessages, clearAllChatHistory } from '../../../db/repositories/chatRepo';
import { parseFileInputPath } from '../../../components/ai/ChatInputBar';
import type { TaskPlannerDatabase } from '../../../db';

describe('AI File Reference & Grounding', () => {
  describe('extractMentionedEntityIds', () => {
    it('extracts local file references in markdown file links', () => {
      const text = 'Vui lòng đọc file [spec.md](file:/Users/test/docs/spec.md) và tóm tắt';
      const result = extractMentionedEntityIds(text);

      expect(result.filePaths).toEqual(['/Users/test/docs/spec.md']);
      expect(result.taskIds).toEqual([]);
      expect(result.projectIds).toEqual([]);
    });

    it('extracts local file references with @file: syntax', () => {
      const text = 'Xem xét file @file:~/projects/tasks.txt cùng @file:/etc/hosts';
      const result = extractMentionedEntityIds(text);

      expect(result.filePaths).toContain('~/projects/tasks.txt');
      expect(result.filePaths).toContain('/etc/hosts');
    });

    it('extracts mixed task, project, and file mentions simultaneously', () => {
      const text = 'Nối [Task 1](task:t-123) với [Project A](project:p-456) và tham khảo [design.pdf](file:/docs/design.pdf)';
      const result = extractMentionedEntityIds(text);

      expect(result.taskIds).toEqual(['t-123']);
      expect(result.projectIds).toEqual(['p-456']);
      expect(result.filePaths).toEqual(['/docs/design.pdf']);
    });
    it('deduplicates multiple mentions of the same file path', () => {
      const text = 'Đọc @file:/docs/api.md và xem lại @file:/docs/api.md lần nữa';
      const result = extractMentionedEntityIds(text);

      expect(result.filePaths).toEqual(['/docs/api.md']);
    });
  });

  describe('read_file AI Tool Definition & Execution', () => {
    it('defines read_file in AI_DATABASE_TOOLS with offset and limit parameters', () => {
      const readFileTool = AI_DATABASE_TOOLS.find((t) => t.function.name === 'read_file');
      expect(readFileTool).toBeDefined();
      expect(readFileTool?.function.parameters.required).toContain('filePath');
      expect(readFileTool?.function.parameters.properties.offset).toBeDefined();
      expect(readFileTool?.function.parameters.properties.limit).toBeDefined();
    });

    it('returns error when filePath is omitted', async () => {
      const mockDb = {} as TaskPlannerDatabase;
      const res = await executeAiTool('read_file', {}, mockDb);
      const parsed = JSON.parse(res);

      expect(parsed.error).toContain('filePath parameter is required');
    });

    it('returns non-Tauri browser sandbox explanation when not in Tauri', async () => {
      const mockDb = {} as TaskPlannerDatabase;
      const res = await executeAiTool('read_file', { filePath: '/Users/test/file.txt' }, mockDb);
      const parsed = JSON.parse(res);

      expect(parsed.error).toContain('Tauri desktop app');
      expect(parsed.filePath).toBe('/Users/test/file.txt');
    });
  });

  describe('Chat History Deletion Repositories', () => {
    it('clearThreadMessages deletes all messages for a specific thread', async () => {
      const deleteMock = vi.fn().mockResolvedValue(2);
      const whereMock = vi.fn().mockReturnValue({ delete: deleteMock });
      const mockDb = {
        chatMessages: { where: vi.fn().mockReturnValue({ equals: whereMock }) },
        transaction: vi.fn().mockImplementation((_mode, _tables, cb) => cb()),
      } as unknown as TaskPlannerDatabase;

      await clearThreadMessages('thread-123', mockDb);
      expect(whereMock).toHaveBeenCalled();
      expect(deleteMock).toHaveBeenCalled();
    });

    it('clearAllChatHistory clears both chatMessages and chatThreads tables', async () => {
      const clearMsgsMock = vi.fn().mockResolvedValue(undefined);
      const clearThreadsMock = vi.fn().mockResolvedValue(undefined);
      const mockDb = {
        chatMessages: { clear: clearMsgsMock },
        chatThreads: { clear: clearThreadsMock },
        transaction: vi.fn().mockImplementation((_mode, _tables, cb) => cb()),
      } as unknown as TaskPlannerDatabase;

      await clearAllChatHistory(mockDb);
      expect(clearMsgsMock).toHaveBeenCalled();
      expect(clearThreadsMock).toHaveBeenCalled();
    });
  });

  describe('parseFileInputPath helper', () => {
    it('normalizes @file and @file: prefixes to home root', () => {
      expect(parseFileInputPath('file')).toBe('~/');
      expect(parseFileInputPath('file:')).toBe('~/');
      expect(parseFileInputPath('file:~')).toBe('~/');
      expect(parseFileInputPath('file:~/')).toBe('~/');
      expect(parseFileInputPath('~')).toBe('~/');
      expect(parseFileInputPath('')).toBe('~/');
    });

    it('preserves nested paths typed after file or prefix', () => {
      expect(parseFileInputPath('file:~/Documents')).toBe('~/Documents');
      expect(parseFileInputPath('file/Users/admin/dev')).toBe('/Users/admin/dev');
      expect(parseFileInputPath('file:/var/log')).toBe('/var/log');
      expect(parseFileInputPath('/usr/local')).toBe('/usr/local');
      expect(parseFileInputPath('./src')).toBe('./src');
    });
  });
});
