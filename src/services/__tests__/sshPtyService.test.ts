import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SshConfig } from '../../types/ssh';
import * as timerPopout from '../../utils/timerPopout';
import * as sshService from '../sshService';
import {
  startPtySession,
  writePtyInput,
  resizePty,
  closePtySession,
  subscribePtyData,
  subscribePtyExit,
} from '../sshPtyService';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

describe('sshPtyService', () => {
  const dummyConfig: SshConfig = {
    id: 'ssh-test-1',
    name: 'Server 1',
    host: '10.0.0.1',
    port: 22,
    username: 'ubuntu',
    authType: 'password',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tauri environment', () => {
    beforeEach(() => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
    });

    it('starts PTY session by resolving secret and calling invoke ssh_pty_start', async () => {
      const core = await import('@tauri-apps/api/core');
      vi.mocked(core.invoke).mockResolvedValue('sess-123');
      vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('keyring-pass');

      const result = await startPtySession({
        sessionId: 'sess-123',
        config: dummyConfig,
        workingDir: '/var/www/repo',
        cols: 120,
        rows: 40,
      });

      expect(sshService.getSshSecret).toHaveBeenCalledWith('ssh-test-1');
      expect(core.invoke).toHaveBeenCalledWith('ssh_pty_start', {
        config: dummyConfig,
        secret: 'keyring-pass',
        sessionId: 'sess-123',
        workingDir: '/var/www/repo',
        cols: 120,
        rows: 40,
      });
      expect(result).toBe('sess-123');
    });

    it('prefers explicit secret parameter over keyring lookup', async () => {
      const core = await import('@tauri-apps/api/core');
      vi.mocked(core.invoke).mockResolvedValue('sess-456');
      const keyringSpy = vi.spyOn(sshService, 'getSshSecret');

      await startPtySession({
        sessionId: 'sess-456',
        config: dummyConfig,
        secret: 'explicit-pass',
        cols: 80,
        rows: 24,
      });

      expect(keyringSpy).not.toHaveBeenCalled();
      expect(core.invoke).toHaveBeenCalledWith('ssh_pty_start', {
        config: dummyConfig,
        secret: 'explicit-pass',
        sessionId: 'sess-456',
        workingDir: null,
        cols: 80,
        rows: 24,
      });
    });

    it('calls ssh_pty_write with sessionId and data string', async () => {
      const core = await import('@tauri-apps/api/core');
      vi.mocked(core.invoke).mockResolvedValue(undefined);

      await writePtyInput('sess-123', 'ls -la\n');

      expect(core.invoke).toHaveBeenCalledWith('ssh_pty_write', {
        sessionId: 'sess-123',
        data: 'ls -la\n',
      });
    });

    it('calls ssh_pty_resize with sessionId and dimensions', async () => {
      const core = await import('@tauri-apps/api/core');
      vi.mocked(core.invoke).mockResolvedValue(undefined);

      await resizePty('sess-123', 100, 35);

      expect(core.invoke).toHaveBeenCalledWith('ssh_pty_resize', {
        sessionId: 'sess-123',
        cols: 100,
        rows: 35,
      });
    });

    it('calls ssh_pty_close with sessionId', async () => {
      const core = await import('@tauri-apps/api/core');
      vi.mocked(core.invoke).mockResolvedValue(undefined);

      await closePtySession('sess-123');

      expect(core.invoke).toHaveBeenCalledWith('ssh_pty_close', {
        sessionId: 'sess-123',
      });
    });

    it('subscribes to ssh-pty:data:<sessionId> and forwards payload to callback', async () => {
      const event = await import('@tauri-apps/api/event');
      const mockUnlisten = vi.fn();
      let registeredHandler: ((ev: { payload: string }) => void) | undefined;

      vi.mocked(event.listen).mockImplementation(async (eventName, handler) => {
        if (eventName === 'ssh-pty:data:sess-123') {
          registeredHandler = handler as (ev: { payload: string }) => void;
        }
        return mockUnlisten;
      });

      const dataCallback = vi.fn();
      const unlisten = await subscribePtyData('sess-123', dataCallback);

      expect(event.listen).toHaveBeenCalledWith('ssh-pty:data:sess-123', expect.any(Function));
      expect(registeredHandler).toBeDefined();

      registeredHandler!({ payload: 'Welcome to Ubuntu\r\n$' });
      expect(dataCallback).toHaveBeenCalledWith('Welcome to Ubuntu\r\n$');

      unlisten();
      expect(mockUnlisten).toHaveBeenCalledTimes(1);
    });

    it('subscribes to ssh-pty:exit:<sessionId> and triggers exit callback', async () => {
      const event = await import('@tauri-apps/api/event');
      const mockUnlisten = vi.fn();
      let registeredHandler: (() => void) | undefined;

      vi.mocked(event.listen).mockImplementation(async (eventName, handler) => {
        if (eventName === 'ssh-pty:exit:sess-123') {
          registeredHandler = handler as () => void;
        }
        return mockUnlisten;
      });

      const exitCallback = vi.fn();
      const unlisten = await subscribePtyExit('sess-123', exitCallback);

      expect(event.listen).toHaveBeenCalledWith('ssh-pty:exit:sess-123', expect.any(Function));
      expect(registeredHandler).toBeDefined();

      registeredHandler!();
      expect(exitCallback).toHaveBeenCalledTimes(1);

      unlisten();
      expect(mockUnlisten).toHaveBeenCalledTimes(1);
    });
  });

  describe('Non-Tauri environment fallback', () => {
    beforeEach(() => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(false);
    });

    it('returns sessionId without invoking tauri commands on start', async () => {
      const core = await import('@tauri-apps/api/core');
      const result = await startPtySession({
        sessionId: 'mock-session',
        config: dummyConfig,
        cols: 80,
        rows: 24,
      });

      expect(result).toBe('mock-session');
      expect(core.invoke).not.toHaveBeenCalled();
    });

    it('safely no-ops for write, resize, and close outside tauri', async () => {
      const core = await import('@tauri-apps/api/core');
      await writePtyInput('mock-session', 'test');
      await resizePty('mock-session', 80, 24);
      await closePtySession('mock-session');

      expect(core.invoke).not.toHaveBeenCalled();
    });

    it('returns no-op unlisten functions outside tauri', async () => {
      const event = await import('@tauri-apps/api/event');
      const unlistenData = await subscribePtyData('mock-session', vi.fn());
      const unlistenExit = await subscribePtyExit('mock-session', vi.fn());

      expect(event.listen).not.toHaveBeenCalled();
      expect(() => unlistenData()).not.toThrow();
      expect(() => unlistenExit()).not.toThrow();
    });
  });
});
