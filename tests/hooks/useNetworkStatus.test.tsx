import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { message } from 'antd';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import * as AriaLive from '../../src/components/common/AriaLiveRegion';

vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useNetworkStatus hook', () => {
  let announceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    announceSpy = vi.spyOn(AriaLive, 'announceToScreenReader').mockImplementation(() => {});
  });

  afterEach(() => {
    announceSpy.mockRestore();
  });

  it('initializes with navigator.onLine value', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(true);
  });

  it('updates state and notifies on transitioning offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
    expect(message.warning).toHaveBeenCalledWith('Đang làm việc ngoại tuyến, dữ liệu lưu cục bộ');
    expect(announceSpy).toHaveBeenCalledWith(
      'Đang làm việc ngoại tuyến. Tất cả dữ liệu được lưu an toàn trong máy.'
    );
  });

  it('updates state and notifies on transitioning online', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current).toBe(true);
    expect(message.success).toHaveBeenCalledWith('Đã kết nối lại mạng');
    expect(announceSpy).toHaveBeenCalledWith(
      'Đã kết nối lại mạng. Ứng dụng đang hoạt động trực tuyến.'
    );
  });
});
