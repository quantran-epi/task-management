import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePWAInstall, type BeforeInstallPromptEvent } from '../../src/hooks/usePWAInstall';

describe('usePWAInstall hook', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  const createMockPromptEvent = (
    outcome: 'accepted' | 'dismissed',
    shouldThrow: boolean = false
  ): BeforeInstallPromptEvent => {
    const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;
    Object.defineProperty(event, 'platforms', { value: ['web'] });
    Object.defineProperty(event, 'userChoice', {
      value: Promise.resolve({ outcome, platform: 'web' }),
    });
    event.prompt = vi.fn().mockImplementation(() => {
      if (shouldThrow) {
        return Promise.reject(new DOMException('The prompt() method may only be called once', 'InvalidStateError'));
      }
      return Promise.resolve();
    });
    return event;
  };

  it('clears installPrompt to null when user outcome is dismissed', async () => {
    const { result } = renderHook(() => usePWAInstall());

    const mockEvent = createMockPromptEvent('dismissed');

    act(() => {
      window.dispatchEvent(mockEvent);
    });

    expect(result.current.installPrompt).toBe(mockEvent);
    expect(result.current.isInstalled).toBe(false);

    let outcome: 'accepted' | 'dismissed' | null = null;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe('dismissed');
    expect(mockEvent.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.installPrompt).toBeNull();
    expect(result.current.isInstalled).toBe(false);
  });

  it('clears installPrompt to null and sets isInstalled to true when user outcome is accepted', async () => {
    const { result } = renderHook(() => usePWAInstall());

    const mockEvent = createMockPromptEvent('accepted');

    act(() => {
      window.dispatchEvent(mockEvent);
    });

    expect(result.current.installPrompt).toBe(mockEvent);
    expect(result.current.isInstalled).toBe(false);

    let outcome: 'accepted' | 'dismissed' | null = null;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe('accepted');
    expect(mockEvent.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.installPrompt).toBeNull();
    expect(result.current.isInstalled).toBe(true);
  });

  it('catches DOMException without throwing and returns null when prompt() rejects', async () => {
    const { result } = renderHook(() => usePWAInstall());

    const mockEvent = createMockPromptEvent('accepted', true);

    act(() => {
      window.dispatchEvent(mockEvent);
    });

    expect(result.current.installPrompt).toBe(mockEvent);

    let outcome: 'accepted' | 'dismissed' | null = 'not-called' as unknown as null;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to prompt PWA install:',
      expect.any(DOMException)
    );
    expect(result.current.installPrompt).toBeNull();
    expect(result.current.isInstalled).toBe(false);
  });
});
