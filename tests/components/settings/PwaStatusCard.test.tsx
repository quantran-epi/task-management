import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PwaStatusCard } from '../../../src/components/settings/PwaStatusCard';

const mockCheckUpdate = vi.fn().mockResolvedValue(undefined);
const mockPromptInstall = vi.fn().mockResolvedValue('accepted');

let mockPwaState = {
  isStandalone: false,
  isInstalled: false,
  isInstallable: true,
  isIos: false,
  installPrompt: null,
  promptInstall: mockPromptInstall,
};

vi.mock('../../../src/hooks/useServiceWorkerUpdate', () => ({
  useServiceWorkerUpdate: () => ({
    needRefresh: false,
    setNeedRefresh: vi.fn(),
    offlineReady: true,
    isChecking: false,
    checkUpdate: mockCheckUpdate,
    reloadApp: vi.fn(),
  }),
}));

vi.mock('../../../src/hooks/usePWAInstall', () => ({
  usePWAInstall: () => mockPwaState,
}));

describe('PwaStatusCard component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPwaState = {
      isStandalone: false,
      isInstalled: false,
      isInstallable: true,
      isIos: false,
      installPrompt: null,
      promptInstall: mockPromptInstall,
    };
  });

  it('renders card title, description, and status tags', () => {
    render(<PwaStatusCard />);

    expect(screen.getByText('Trạng thái PWA & Ngoại tuyến')).toBeInTheDocument();
    expect(
      screen.getByText(/Kiểm tra khả năng hoạt động ngoại tuyến/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Khả năng ngoại tuyến')).toBeInTheDocument();
    expect(screen.getByText('Sẵn sàng')).toBeInTheDocument();
    expect(screen.getByText('Tình trạng cài đặt')).toBeInTheDocument();
    expect(screen.getByText('Chưa cài đặt')).toBeInTheDocument();
  });

  it('displays "Đã cài đặt PWA" tag when app is installed or standalone', () => {
    mockPwaState = {
      ...mockPwaState,
      isInstalled: true,
      isStandalone: true,
    };

    render(<PwaStatusCard />);
    expect(screen.getByText('Đã cài đặt PWA')).toBeInTheDocument();
  });

  it('triggers checkUpdate when clicking "Kiểm tra bản cập nhật"', async () => {
    render(<PwaStatusCard />);

    const checkButton = screen.getByRole('button', { name: /Kiểm tra bản cập nhật/i });
    expect(checkButton).toBeInTheDocument();

    fireEvent.click(checkButton);

    await waitFor(() => {
      expect(mockCheckUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it('handles offline state when checking for updates', async () => {
    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    });

    render(<PwaStatusCard />);

    const checkButton = screen.getByRole('button', { name: /Kiểm tra bản cập nhật/i });
    fireEvent.click(checkButton);

    await waitFor(() => {
      expect(mockCheckUpdate).not.toHaveBeenCalled();
    });

    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      configurable: true,
    });
  });
});
