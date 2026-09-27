import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StoragePersistenceCard } from '../../../src/components/settings/StoragePersistenceCard';
import { message } from 'antd';

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    message: {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  };
});

const mockRequestPersistence = vi.fn().mockResolvedValue(true);

let mockStorageState = {
  isPersisted: false,
  quotaBytes: 10 * 1024 * 1024 * 1024,
  usageBytes: 2.5 * 1024 * 1024,
  formattedQuota: '10.0 GB',
  formattedUsage: '2.5 MB',
  percentUsed: 0.1,
  isSupported: true,
  loading: false,
  requestPersistence: mockRequestPersistence,
  refresh: vi.fn(),
};

vi.mock('../../../src/hooks/useStoragePersistence', () => ({
  useStoragePersistence: () => mockStorageState,
}));

describe('StoragePersistenceCard component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageState = {
      isPersisted: false,
      quotaBytes: 10 * 1024 * 1024 * 1024,
      usageBytes: 2.5 * 1024 * 1024,
      formattedQuota: '10.0 GB',
      formattedUsage: '2.5 MB',
      percentUsed: 0.1,
      isSupported: true,
      loading: false,
      requestPersistence: mockRequestPersistence,
      refresh: vi.fn(),
    };
  });

  it('renders empty state when StorageManager is unsupported', () => {
    mockStorageState = {
      ...mockStorageState,
      isSupported: false,
    };

    render(<StoragePersistenceCard />);

    expect(screen.getByText('Dung lượng lưu trữ & Tính bền vững')).toBeInTheDocument();
    expect(screen.getByText('Không có thông tin hạn mức')).toBeInTheDocument();
    expect(
      screen.getByText(/Trình duyệt không hỗ trợ StorageManager API hoặc đang ở chế độ ẩn danh/i)
    ).toBeInTheDocument();
  });

  it('renders temporary mode with warning advisory alert and request button', () => {
    render(<StoragePersistenceCard />);

    expect(screen.getByText('Tạm thời (Best-effort)')).toBeInTheDocument();
    expect(screen.getByText(/2.5 MB \/ 10.0 GB khả dụng/i)).toBeInTheDocument();
    expect(screen.getByText('Khuyến nghị an toàn')).toBeInTheDocument();
    expect(
      screen.getByText(/Trình duyệt chưa cấp quyền lưu trữ bền vững/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Yêu cầu lưu trữ bền vững/i })
    ).toBeInTheDocument();
  });

  it('calls requestPersistence and shows message.success when granted', async () => {
    mockRequestPersistence.mockResolvedValueOnce(true);
    render(<StoragePersistenceCard />);

    const requestBtn = screen.getByRole('button', { name: /Yêu cầu lưu trữ bền vững/i });
    fireEvent.click(requestBtn);

    await waitFor(() => {
      expect(mockRequestPersistence).toHaveBeenCalledTimes(1);
      expect(message.success).toHaveBeenCalledWith('Đã kích hoạt lưu trữ bền vững thành công.');
    });
  });

  it('shows message.warning when persistence is not granted by browser heuristics', async () => {
    mockRequestPersistence.mockResolvedValueOnce(false);
    render(<StoragePersistenceCard />);

    const requestBtn = screen.getByRole('button', { name: /Yêu cầu lưu trữ bền vững/i });
    fireEvent.click(requestBtn);

    await waitFor(() => {
      expect(mockRequestPersistence).toHaveBeenCalledTimes(1);
      expect(message.warning).toHaveBeenCalledWith(
        expect.stringContaining('Trình duyệt chưa cấp quyền lưu trữ bền vững')
      );
    });
  });

  it('renders persisted mode with green tag and hides advisory alert and request button', () => {
    mockStorageState = {
      ...mockStorageState,
      isPersisted: true,
    };

    render(<StoragePersistenceCard />);

    expect(screen.getByText('Bền vững (Persisted)')).toBeInTheDocument();
    expect(screen.queryByText('Khuyến nghị an toàn')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Yêu cầu lưu trữ bền vững/i })
    ).not.toBeInTheDocument();
  });
});
