// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveSyncStatus } from '../../components/shell/GitHubSyncStatusDot';
import { useKnowledgeProbe } from '../StatusBar';

describe('deriveSyncStatus', () => {
  it('reports off without token or without enabled setting', () => {
    expect(deriveSyncStatus({ hasToken: false, enabled: true }).kind).toBe('off');
    expect(deriveSyncStatus({ hasToken: true, enabled: false }).kind).toBe('off');
  });

  it('distinguishes paused, error, dirty and synced with Vietnamese labels', () => {
    expect(deriveSyncStatus({
      hasToken: true,
      enabled: true,
      retryState: { consecutiveFailures: 2, isPaused: true, pauseReason: 'conflict' },
    })).toMatchObject({
      kind: 'paused',
      label: 'Tạm dừng',
      tooltip: expect.stringContaining('xung đột'),
    });
    expect(deriveSyncStatus({
      hasToken: true,
      enabled: true,
      retryState: { consecutiveFailures: 2, nextRetryAt: '2026-11-28T05:00:00Z', isPaused: false },
      lastError: 'timeout',
    })).toMatchObject({ kind: 'error', label: 'Lỗi', tooltip: expect.stringContaining('timeout') });
    expect(deriveSyncStatus({ hasToken: true, enabled: true, dirtySince: '2026-11-28T04:00:00Z' }))
      .toMatchObject({ kind: 'dirty', label: 'Chưa đồng bộ' });
    expect(deriveSyncStatus({ hasToken: true, enabled: true }))
      .toMatchObject({ kind: 'synced', label: 'Đã đồng bộ' });
  });
});

describe('useKnowledgeProbe', () => {
  const base = { ready: true, enabled: true, baseUrl: 'http://127.0.0.1:3001' };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is disabled when config is off or baseUrl missing', async () => {
    const off = renderHook(() => useKnowledgeProbe({ ...base, enabled: false }));
    expect(off.result.current).toBe('disabled');
    expect(fetch).not.toHaveBeenCalled();
    const empty = renderHook(() => useKnowledgeProbe({ ...base, baseUrl: '' }));
    expect(empty.result.current).toBe('disabled');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stays checking until config is ready', () => {
    const { result } = renderHook(() => useKnowledgeProbe({ ...base, ready: false }));
    expect(result.current).toBe('checking');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('moves checking -> connected on 200 and retries after 60s', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    const { result } = renderHook(() => useKnowledgeProbe(base));
    expect(result.current).toBe('checking');
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/v1/health/liveness',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBe('connected');
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(60000); });
    expect(result.current).toBe('checking');
  });

  it('reports disconnected on rejection and retries after 15s', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useKnowledgeProbe(base));
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBe('disconnected');
    act(() => { vi.advanceTimersByTime(14999); });
    expect(result.current).toBe('disconnected');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('checking');
  });

  it('aborts in-flight probe on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_url, init) => {
      capturedSignal = init?.signal as AbortSignal | undefined;
      return new Promise(() => {});
    });
    const { unmount } = renderHook(() => useKnowledgeProbe(base));
    expect(capturedSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
