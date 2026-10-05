import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ServiceWorkerProvider } from '../../src/context/ServiceWorkerContext';
import { useServiceWorkerUpdate } from '../../src/hooks/useServiceWorkerUpdate';
import * as timerPopoutUtils from '../../src/utils/timerPopout';

function TestConsumer() {
  const { needRefresh, isChecking, checkUpdate, reloadApp } = useServiceWorkerUpdate();

  return (
    <div>
      <div data-testid="needRefresh">{needRefresh ? 'TRUE' : 'FALSE'}</div>
      <div data-testid="isChecking">{isChecking ? 'TRUE' : 'FALSE'}</div>
      <button data-testid="check-update-btn" onClick={() => void checkUpdate()}>
        Check Update
      </button>
      <button data-testid="reload-btn" onClick={() => void reloadApp()}>
        Reload App
      </button>
    </div>
  );
}

describe('ServiceWorkerContext', () => {
  let isTauriSpy: ReturnType<typeof vi.spyOn>;
  const mockUnregister = vi.fn().mockResolvedValue(true);
  const mockRegistration = {
    unregister: mockUnregister,
    update: vi.fn().mockResolvedValue(undefined),
  };
  const mockGetRegistrations = vi.fn().mockResolvedValue([mockRegistration]);
  const mockGetRegistration = vi.fn().mockResolvedValue(mockRegistration);
  const mockCacheDelete = vi.fn().mockResolvedValue(true);
  const mockCacheKeys = vi.fn().mockResolvedValue(['workbox-precache-v1', 'sw-runtime-cache']);

  beforeEach(() => {
    vi.clearAllMocks();
    isTauriSpy = vi.spyOn(timerPopoutUtils, 'isTauriApp').mockReturnValue(false);

    // Mock navigator.serviceWorker
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistrations: mockGetRegistrations,
        getRegistration: mockGetRegistration,
        ready: Promise.resolve(mockRegistration),
      },
      configurable: true,
      writable: true,
    });

    // Mock window.caches
    Object.defineProperty(window, 'caches', {
      value: {
        keys: mockCacheKeys,
        delete: mockCacheDelete,
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    isTauriSpy.mockRestore();
  });

  it('unregisters existing service workers and purges caches when running inside Tauri', async () => {
    isTauriSpy.mockReturnValue(true);

    await act(async () => {
      render(
        <ServiceWorkerProvider>
          <TestConsumer />
        </ServiceWorkerProvider>
      );
    });

    expect(mockGetRegistrations).toHaveBeenCalled();
    expect(mockUnregister).toHaveBeenCalled();
    expect(mockCacheKeys).toHaveBeenCalled();
    expect(mockCacheDelete).toHaveBeenCalledWith('workbox-precache-v1');
    expect(mockCacheDelete).toHaveBeenCalledWith('sw-runtime-cache');
  });

  it('does not unregister service workers or purge caches in web/browser mode', async () => {
    isTauriSpy.mockReturnValue(false);

    await act(async () => {
      render(
        <ServiceWorkerProvider>
          <TestConsumer />
        </ServiceWorkerProvider>
      );
    });

    expect(mockGetRegistrations).not.toHaveBeenCalled();
    expect(mockUnregister).not.toHaveBeenCalled();
    expect(mockCacheDelete).not.toHaveBeenCalled();
  });

  it('checkUpdate early-returns false in Tauri mode without calling reg.update', async () => {
    isTauriSpy.mockReturnValue(true);

    render(
      <ServiceWorkerProvider>
        <TestConsumer />
      </ServiceWorkerProvider>
    );

    const checkBtn = screen.getByTestId('check-update-btn');
    await act(async () => {
      checkBtn.click();
    });

    expect(mockRegistration.update).not.toHaveBeenCalled();
    expect(screen.getByTestId('needRefresh').textContent).toBe('FALSE');
  });

  it('reloadApp reloads window directly in Tauri mode', async () => {
    isTauriSpy.mockReturnValue(true);
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      configurable: true,
      writable: true,
    });

    render(
      <ServiceWorkerProvider>
        <TestConsumer />
      </ServiceWorkerProvider>
    );

    const reloadBtn = screen.getByTestId('reload-btn');
    await act(async () => {
      reloadBtn.click();
    });

    expect(reloadMock).toHaveBeenCalled();
  });
});
