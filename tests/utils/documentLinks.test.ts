import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Modal } from 'antd';
import {
  isLocalPath,
  normalizeLocalPath,
  openDocumentLink,
  openLocalPathInExplorer,
  launchClaudeAtLocalPath,
  browseLocalFolder,
  browseLocalFile,
} from '../../src/utils/documentLinks';

describe('documentLinks utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as any).__TAURI_INTERNALS__;
  });

  describe('isLocalPath', () => {
    it('detects file:// URLs', () => {
      expect(isLocalPath('file:///Users/john/project')).toBe(true);
      expect(isLocalPath('file://C:/Users/john/project')).toBe(true);
    });

    it('detects Unix absolute paths', () => {
      expect(isLocalPath('/Users/john/Documents')).toBe(true);
      expect(isLocalPath('/etc/hosts')).toBe(true);
    });

    it('detects Windows drive letter paths', () => {
      expect(isLocalPath('C:\\Users\\John\\Documents')).toBe(true);
      expect(isLocalPath('D:/workspace/task')).toBe(true);
      expect(isLocalPath('e:\\projects')).toBe(true);
    });

    it('detects UNC paths', () => {
      expect(isLocalPath('\\\\server\\share\\folder')).toBe(true);
    });

    it('returns false for web URLs', () => {
      expect(isLocalPath('http://example.com')).toBe(false);
      expect(isLocalPath('https://github.com/org/repo')).toBe(false);
      expect(isLocalPath('HTTP://SECURE.COM')).toBe(false);
    });

    it('returns false for empty or non-path strings', () => {
      expect(isLocalPath('')).toBe(false);
      expect(isLocalPath('   ')).toBe(false);
      expect(isLocalPath('random string text')).toBe(false);
      expect(isLocalPath('relative/path/to/file')).toBe(false);
    });
  });

  describe('normalizeLocalPath', () => {
    it('removes file:// prefix on Unix paths', () => {
      expect(normalizeLocalPath('file:///Users/john/project')).toBe('/Users/john/project');
    });

    it('removes file:// prefix and leading slash on Windows paths', () => {
      expect(normalizeLocalPath('file:///C:/Users/john/project')).toBe('C:/Users/john/project');
      expect(normalizeLocalPath('file://C:/Users/john/project')).toBe('C:/Users/john/project');
    });

    it('leaves plain paths unchanged except trimming', () => {
      expect(normalizeLocalPath('  /Users/john/project  ')).toBe('/Users/john/project');
      expect(normalizeLocalPath('C:\\Users\\john\\project')).toBe('C:\\Users\\john\\project');
    });
  });

  describe('openDocumentLink and local path operations', () => {
    it('opens web URL using window.open in browser mode', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      await openDocumentLink('https://example.com');
      expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    });

    it('openLocalPathInExplorer copies local path to clipboard in browser mode', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      await openLocalPathInExplorer('/Users/john/project');
      expect(writeTextMock).toHaveBeenCalledWith('/Users/john/project');
    });

    it('launchClaudeAtLocalPath copies terminal command to clipboard in browser mode', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      await launchClaudeAtLocalPath('/Users/john/project');
      expect(writeTextMock).toHaveBeenCalledWith("cd '/Users/john/project' && claude");
    });

    it('openDocumentLink with quickClaude launches Claude command directly', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      await openDocumentLink('/Users/john/project', { quickClaude: true });
      expect(writeTextMock).toHaveBeenCalledWith("cd '/Users/john/project' && claude");
    });

    it('openDocumentLink prompts modal confirm for local path by default', async () => {
      const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((config: any) => {
        config?.onCancel?.();
        return {
          destroy: vi.fn(),
          update: vi.fn(),
        } as any;
      });

      await openDocumentLink('/Users/john/project');
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Thao tác với đường dẫn cục bộ',
        })
      );
    });
  });

  describe('browse dialogs in non-Tauri browser', () => {
    it('browseLocalFolder returns null when not in Tauri', async () => {
      const res = await browseLocalFolder();
      expect(res).toBeNull();
    });

    it('browseLocalFile returns null when not in Tauri', async () => {
      const res = await browseLocalFile();
      expect(res).toBeNull();
    });
  });
});

