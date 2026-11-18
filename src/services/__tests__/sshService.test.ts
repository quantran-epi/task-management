import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SshConfig, SshStreamEvent, SshStreamExitEvent } from '../../types/ssh';
import * as timerPopout from '../../utils/timerPopout';
import * as sshService from '../sshService';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

type Handler = (ev: { payload: unknown }) => void;

function captureListeners() {
  const handlers = new Map<string, Handler>();
  const unlisteners = new Map<string, ReturnType<typeof vi.fn>>();

  return {
    handlers,
    unlisteners,
    install: async () => {
      const event = await import('@tauri-apps/api/event');
      vi.mocked(event.listen).mockImplementation(async (eventName, handler) => {
        handlers.set(eventName as string, handler as Handler);
        const unlisten = vi.fn();
        unlisteners.set(eventName as string, unlisten);
        return unlisten;
      });
    },
  };
}

describe('execRemoteCommandStream', () => {
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
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
  });

  it('subscribes to data and exit events and invokes ssh_exec_stream', async () => {
    const core = await import('@tauri-apps/api/core');
    const event = await import('@tauri-apps/api/event');
    vi.mocked(core.invoke).mockResolvedValue(undefined);
    const listeners = captureListeners();
    await listeners.install();

    await sshService.execRemoteCommandStream(
      dummyConfig,
      'claude -p "hi"',
      'sess-1',
      vi.fn(),
      vi.fn(),
      'explicit-pass',
    );

    expect(event.listen).toHaveBeenCalledWith('ssh-stream:data:sess-1', expect.any(Function));
    expect(event.listen).toHaveBeenCalledWith('ssh-stream:exit:sess-1', expect.any(Function));
    expect(core.invoke).toHaveBeenCalledWith('ssh_exec_stream', {
      config: dummyConfig,
      secret: 'explicit-pass',
      sessionId: 'sess-1',
      command: 'claude -p "hi"',
    });
  });

  it('forwards stream data events to onData', async () => {
    const core = await import('@tauri-apps/api/core');
    vi.mocked(core.invoke).mockResolvedValue(undefined);
    const listeners = captureListeners();
    await listeners.install();

    const onData = vi.fn();
    await sshService.execRemoteCommandStream(dummyConfig, 'cmd', 'sess-2', onData, vi.fn());

    const payload: SshStreamEvent = { sessionId: 'sess-2', stream: 'stdout', line: 'hello' };
    listeners.handlers.get('ssh-stream:data:sess-2')!({ payload });

    expect(onData).toHaveBeenCalledWith(payload);
  });

  it('delivers exit payload to onExit and unlistens both listeners', async () => {
    const core = await import('@tauri-apps/api/core');
    vi.mocked(core.invoke).mockResolvedValue(undefined);
    const listeners = captureListeners();
    await listeners.install();

    const onExit = vi.fn();
    await sshService.execRemoteCommandStream(dummyConfig, 'cmd', 'sess-3', vi.fn(), onExit);

    const payload: SshStreamExitEvent = { sessionId: 'sess-3', exitStatus: 0, error: null };
    listeners.handlers.get('ssh-stream:exit:sess-3')!({ payload });

    expect(onExit).toHaveBeenCalledWith(payload);
    expect(listeners.unlisteners.get('ssh-stream:data:sess-3')).toHaveBeenCalledTimes(1);
    expect(listeners.unlisteners.get('ssh-stream:exit:sess-3')).toHaveBeenCalledTimes(1);
  });

  it('cancel handle invokes ssh_kill_process, unlistens, and is idempotent', async () => {
    const core = await import('@tauri-apps/api/core');
    vi.mocked(core.invoke).mockResolvedValue(undefined);
    const listeners = captureListeners();
    await listeners.install();

    const cancel = await sshService.execRemoteCommandStream(
      dummyConfig,
      'long-running',
      'sess-4',
      vi.fn(),
      vi.fn(),
      'explicit-pass',
    );

    await cancel();

    expect(core.invoke).toHaveBeenCalledWith('ssh_kill_process', {
      config: dummyConfig,
      secret: 'explicit-pass',
      sessionId: 'sess-4',
    });
    expect(listeners.unlisteners.get('ssh-stream:data:sess-4')).toHaveBeenCalledTimes(1);
    expect(listeners.unlisteners.get('ssh-stream:exit:sess-4')).toHaveBeenCalledTimes(1);

    vi.mocked(core.invoke).mockClear();
    await cancel();
    expect(core.invoke).not.toHaveBeenCalled();
  });

  it('throws outside Tauri', async () => {
    vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(false);

    await expect(
      sshService.execRemoteCommandStream(dummyConfig, 'cmd', 'sess-5', vi.fn(), vi.fn()),
    ).rejects.toThrow('Tính năng SSH chỉ hoạt động trên môi trường Desktop Tauri.');
  });
});
