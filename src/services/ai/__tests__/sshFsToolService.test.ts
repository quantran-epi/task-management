import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isLikelyBinaryPath,
  shellQuote,
  resolveRemotePath,
  executeSshListDir,
  executeSshReadFile,
  executeSshGrepFiles,
  testSshFsConnection,
} from '../sshFsToolService';
import { SSH_FS_TOOL_CONFIG_KEY } from '../../../types/sshFsTool';
import * as sshService from '../../sshService';

describe('sshFsToolService', () => {
  let mockDb: any;
  let mockFsConfig: any;
  let mockSshConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFsConfig = {
      enabled: true,
      sshConfigId: 'ssh-1',
      defaultBasePath: '/var/log',
      maxLinesPerRead: 100,
      maxListEntries: 100,
      maxGrepMatches: 50,
    };

    mockSshConfig = {
      id: 'ssh-1',
      name: 'Test Server',
      host: '192.168.1.100',
      port: 22,
      username: 'root',
      authType: 'password',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const settingsMap = new Map<string, any>();
    settingsMap.set(SSH_FS_TOOL_CONFIG_KEY, { key: SSH_FS_TOOL_CONFIG_KEY, value: mockFsConfig });

    mockDb = {
      settings: {
        get: vi.fn(async (key: string) => settingsMap.get(key) || null),
        put: vi.fn(async (record: any) => {
          settingsMap.set(record.key, record);
        }),
      },
    };

    vi.spyOn(sshService, 'getSshConfigById').mockImplementation(async (id: string) => {
      if (id === 'ssh-1') return mockSshConfig;
      return null;
    });
  });

  describe('utility functions', () => {
    it('isLikelyBinaryPath detects binary files', () => {
      expect(isLikelyBinaryPath('image.png')).toBe(true);
      expect(isLikelyBinaryPath('/path/to/archive.tar.gz')).toBe(true);
      expect(isLikelyBinaryPath('app.exe')).toBe(true);
      expect(isLikelyBinaryPath('document.pdf')).toBe(true);
      expect(isLikelyBinaryPath('server.log')).toBe(false);
      expect(isLikelyBinaryPath('config.json')).toBe(false);
      expect(isLikelyBinaryPath('/etc/nginx/nginx.conf')).toBe(false);
      expect(isLikelyBinaryPath('no_ext')).toBe(false);
    });

    it('shellQuote escapes single quotes correctly', () => {
      expect(shellQuote('hello')).toBe("'hello'");
      expect(shellQuote("it's dangerous")).toBe("'it'\\''s dangerous'");
      expect(shellQuote('test; rm -rf /')).toBe("'test; rm -rf /'");
    });

    it('resolveRemotePath respects base path for relative paths', () => {
      expect(resolveRemotePath('', '/var/log')).toBe('/var/log');
      expect(resolveRemotePath('.', '/var/log')).toBe('/var/log');
      expect(resolveRemotePath('syslog', '/var/log')).toBe('/var/log/syslog');
      expect(resolveRemotePath('/etc/hosts', '/var/log')).toBe('/etc/hosts');
      expect(resolveRemotePath('~/my-app', '/var/log')).toBe('~/my-app');
    });
  });

  describe('executeSshListDir', () => {
    it('returns error when tool is disabled', async () => {
      mockFsConfig.enabled = false;
      const res = JSON.parse(await executeSshListDir({ path: '/var/log' }, mockDb));
      expect(res.success).toBe(false);
      expect(res.error).toContain('chưa được bật');
    });

    it('returns error when sshConfigId is not found', async () => {
      mockFsConfig.sshConfigId = 'non-existent';
      const res = JSON.parse(await executeSshListDir({ path: '/var/log' }, mockDb));
      expect(res.success).toBe(false);
      expect(res.error).toContain('Không tìm thấy cấu hình SSH');
    });

    it('lists directories and files sorted with dirs first', async () => {
      vi.spyOn(sshService, 'listRemoteDir').mockResolvedValue([
        { name: 'app.log', path: '/var/log/app.log', isDir: false, isSymlink: false, size: 2048, modified: 1700000000, permissions: 0o644 },
        { name: 'nginx', path: '/var/log/nginx', isDir: true, isSymlink: false, size: 4096, modified: 1700000000, permissions: 0o755 },
        { name: '.hidden.log', path: '/var/log/.hidden.log', isDir: false, isSymlink: false, size: 100, modified: 1700000000, permissions: 0o644 },
      ]);

      const res = JSON.parse(await executeSshListDir({ path: '/var/log', showHidden: false }, mockDb));
      expect(res.success).toBe(true);
      expect(res.count).toBe(2);
      expect(res.data.entries[0].name).toBe('nginx');
      expect(res.data.entries[0].isDir).toBe(true);
      expect(res.data.entries[1].name).toBe('app.log');
      expect(res.data.entries[1].isDir).toBe(false);
    });

    it('includes hidden files when showHidden is true', async () => {
      vi.spyOn(sshService, 'listRemoteDir').mockResolvedValue([
        { name: '.env', path: '/var/log/.env', isDir: false, isSymlink: false, size: 50, modified: 1700000000 },
        { name: 'main.py', path: '/var/log/main.py', isDir: false, isSymlink: false, size: 100, modified: 1700000000 },
      ]);

      const res = JSON.parse(await executeSshListDir({ path: '/var/log', showHidden: true }, mockDb));
      expect(res.success).toBe(true);
      expect(res.count).toBe(2);
    });
  });

  describe('executeSshReadFile', () => {
    it('refuses to read binary files', async () => {
      const res = JSON.parse(await executeSshReadFile({ path: 'snapshot.png' }, mockDb));
      expect(res.success).toBe(false);
      expect(res.error).toContain('Không thể đọc file nhị phân');
    });

    it('reads slice of text file and numbers lines', async () => {
      vi.spyOn(sshService, 'readRemoteFileSlice').mockResolvedValue({
        lines: ['First line', 'Second line'],
        totalLines: 10,
        offset: 5,
        limit: 2,
        hasMore: true,
      });

      const res = JSON.parse(await executeSshReadFile({ path: 'server.log', offset: 5, limit: 2 }, mockDb));
      expect(res.success).toBe(true);
      expect(res.count).toBe(2);
      expect(res.data.content).toBe('5: First line\n6: Second line');
      expect(res.truncated).toBe(true);
    });
  });

  describe('executeSshGrepFiles', () => {
    it('executes grep command with proper flags and quotes', async () => {
      const execSpy = vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
        stdout: '/var/log/app.log:42:ERROR database connection timeout\n',
        stderr: '',
        exitStatus: 0,
      });

      const res = JSON.parse(await executeSshGrepFiles({
        path: 'app.log',
        pattern: 'ERROR',
        recursive: false,
        caseSensitive: true,
        limit: 10,
      }, mockDb));

      expect(res.success).toBe(true);
      expect(res.count).toBe(1);
      expect(res.data.matches[0]).toEqual({
        file: '/var/log/app.log',
        line: 42,
        text: 'ERROR database connection timeout',
      });

      expect(execSpy).toHaveBeenCalledWith(
        mockSshConfig,
        expect.stringContaining("grep -n -I -s -- 'ERROR' '/var/log/app.log' | head -n 11"),
      );
    });

    it('supports recursive and case-insensitive grep', async () => {
      const execSpy = vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
        stdout: '',
        stderr: '',
        exitStatus: 1, // grep exit 1 means no match found, which is a normal result
      });

      const res = JSON.parse(await executeSshGrepFiles({
        path: '/var/log',
        pattern: 'exception',
        recursive: true,
        caseSensitive: false,
      }, mockDb));

      expect(res.success).toBe(true);
      expect(res.count).toBe(0);
      expect(execSpy).toHaveBeenCalledWith(
        mockSshConfig,
        expect.stringContaining("grep -n -I -s -r -i -- 'exception' '/var/log'"),
      );
    });
  });

  describe('testSshFsConnection', () => {
    it('successfully connects and updates config status', async () => {
      vi.spyOn(sshService, 'testSshConnection').mockResolvedValue('OpenSSH_9.0');

      const result = await testSshFsConnection(mockDb);
      expect(result.success).toBe(true);
      expect(result.message).toContain('OpenSSH_9.0');

      const storedConfig = await mockDb.settings.get(SSH_FS_TOOL_CONFIG_KEY);
      expect(storedConfig.value.lastTestStatus).toContain('Thành công: OpenSSH_9.0');
    });

    it('catches and stores connection errors', async () => {
      vi.spyOn(sshService, 'testSshConnection').mockRejectedValue(new Error('Connection refused'));

      const result = await testSshFsConnection(mockDb);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection refused');

      const storedConfig = await mockDb.settings.get(SSH_FS_TOOL_CONFIG_KEY);
      expect(storedConfig.value.lastTestStatus).toContain('Lỗi: Connection refused');
    });
  });
});
