import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationDrawer } from '../../../src/components/notifications/NotificationDrawer';
import type { AlertNotificationItem } from '../../../src/types/notifications';
import type { Task } from '../../../src/types/models';

const mockTask: Task = {
  id: 'task-1',
  name: 'Nhiệm vụ kiểm thử',
  status: 'Open',
  priority: 'High',
  progress: 0,
  estimateMinutes: 60,
  workType: 'code',
  createdAt: '2026-09-20T00:00:00Z',
  updatedAt: '2026-09-20T00:00:00Z',
};

const mockItems: AlertNotificationItem[] = [
  {
    id: 'overdue:task:task-1',
    category: 'overdue',
    title: 'Nhiệm vụ kiểm thử',
    subtitle: 'Hạn: 2026-09-20 (Trễ 8 ngày)',
    tagColor: 'error',
    tagLabel: 'Quá hạn 8 ngày',
    entityType: 'task',
    entityId: 'task-1',
    canDismiss: false,
    priorityOrder: 1,
    task: mockTask,
  },
  {
    id: 'overload:date:2026-09-29',
    category: 'overload',
    title: 'Quá tải ngày 2026-09-29',
    subtitle: 'Đã lên lịch 10h / 8h công suất khả dụng',
    date: '2026-09-29',
    tagColor: 'warning',
    tagLabel: 'Vượt 2h',
    entityType: 'capacity',
    canDismiss: false,
    priorityOrder: 2,
  },
  {
    id: 'stale:task:task-2',
    category: 'stale',
    title: 'Nhiệm vụ ứ đọng',
    subtitle: 'Chưa cập nhật trong 6 ngày',
    tagColor: 'purple',
    tagLabel: 'Ứ đọng 6 ngày',
    entityType: 'task',
    entityId: 'task-2',
    canDismiss: true,
    priorityOrder: 4,
  },
  {
    id: 'reminder:task:task-3',
    category: 'reminder',
    title: 'Nhắc nhở kiểm tra tiến độ',
    subtitle: 'Hạn nhắc: 2026-09-28',
    tagColor: 'gold',
    tagLabel: 'Nhắc nhở',
    entityType: 'task',
    entityId: 'task-3',
    canDismiss: true,
    priorityOrder: 5,
  },
];

describe('NotificationDrawer', () => {
  it('renders all 5 tabs and shows total item count', () => {
    const handleClose = vi.fn();
    const handleItemClick = vi.fn();
    const handleDismiss = vi.fn();

    render(
      <NotificationDrawer
        open={true}
        onClose={handleClose}
        items={mockItems}
        onItemClick={handleItemClick}
        onDismiss={handleDismiss}
      />
    );

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByRole('tab', { name: /Tất cả \(4\)/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Quá hạn & Đến hạn/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Quá tải/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Ứ đọng/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Nhắc nhở/i })).toBeDefined();

    // Does not provide "Dismiss All" button (D-17)
    expect(screen.queryByText(/Bỏ qua tất cả/i)).toBeNull();
    expect(screen.queryByText(/Dismiss All/i)).toBeNull();
  });

  it('renders quick Done checkbox for task and invokes onDismiss for dismissible items', () => {
    const handleItemClick = vi.fn();
    const handleDismiss = vi.fn();

    render(
      <NotificationDrawer
        open={true}
        onClose={vi.fn()}
        items={mockItems}
        onItemClick={handleItemClick}
        onDismiss={handleDismiss}
      />
    );

    // Overdue item (not dismissible)
    expect(screen.getByText('Nhiệm vụ kiểm thử')).toBeDefined();
    expect(screen.getByText('Quá hạn 8 ngày')).toBeDefined();

    // Capacity overload item
    expect(screen.getByText('Quá tải ngày 2026-09-29')).toBeDefined();
    const viewCalendarBtn = screen.getByRole('button', { name: /xem lịch/i });
    expect(viewCalendarBtn).toBeDefined();
    fireEvent.click(viewCalendarBtn);
    expect(handleItemClick).toHaveBeenCalledWith(mockItems[1]);

    // Stale item has "Bỏ qua" button
    const dismissButtons = screen.getAllByRole('button', { name: /bỏ qua/i });
    expect(dismissButtons.length).toBe(2); // stale + reminder
    fireEvent.click(dismissButtons[0]!);
    expect(handleDismiss).toHaveBeenCalledWith(mockItems[2]);
  });

  it('filters items correctly when switching tabs', () => {
    render(
      <NotificationDrawer
        open={true}
        onClose={vi.fn()}
        items={mockItems}
        onItemClick={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    const overloadTab = screen.getByRole('tab', { name: /quá tải/i });
    fireEvent.click(overloadTab);

    expect(screen.getByText('Quá tải ngày 2026-09-29')).toBeDefined();
    expect(screen.queryByText('Nhiệm vụ kiểm thử')).toBeNull();
    expect(screen.queryByText('Nhiệm vụ ứ đọng')).toBeNull();
  });

  it('renders empty state when tab has 0 matching items', () => {
    render(
      <NotificationDrawer
        open={true}
        onClose={vi.fn()}
        items={[]}
        onItemClick={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText('Không có cảnh báo nào')).toBeDefined();
  });
});
