import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutHUD } from '../../../src/components/common/ShortcutHUD';
import type { ShortcutItem } from '../../../src/types/shortcuts';

const sampleShortcuts: ShortcutItem[] = [
  {
    id: 's1',
    category: 'navigation',
    categoryLabel: 'Chuyển trang',
    title: 'Màn hình Tổng quan',
    description: 'Xem tóm tắt tiến độ',
    keys: ['Alt', '1'],
    action: vi.fn(),
  },
  {
    id: 's2',
    category: 'tasks',
    categoryLabel: 'Tác vụ',
    title: 'Danh sách Tác vụ',
    description: 'Quản lý tác vụ',
    keys: ['Alt', '2'],
    action: vi.fn(),
  },
  {
    id: 's3',
    category: 'global',
    categoryLabel: 'Thao tác chung',
    title: 'Tạo nhanh Tác vụ mới',
    description: 'Thêm task mới',
    keys: ['Mod', 'N'],
    action: vi.fn(),
  },
];

describe('ShortcutHUD', () => {
  it('renders list of shortcuts when open', () => {
    render(
      <ShortcutHUD
        open={true}
        onClose={vi.fn()}
        shortcuts={sampleShortcuts}
        currentRoute="tasks"
      />
    );

    expect(screen.getByText('Màn hình Tổng quan')).toBeInTheDocument();
    expect(screen.getByText('Danh sách Tác vụ')).toBeInTheDocument();
    expect(screen.getByText('Tạo nhanh Tác vụ mới')).toBeInTheDocument();
  });

  it('filters shortcuts by query', () => {
    render(
      <ShortcutHUD
        open={true}
        onClose={vi.fn()}
        shortcuts={sampleShortcuts}
        currentRoute="tasks"
      />
    );

    const input = screen.getByPlaceholderText(/Tìm phím tắt hoặc hành động/i);
    fireEvent.change(input, { target: { value: 'Tổng quan' } });

    expect(screen.getByText('Màn hình Tổng quan')).toBeInTheDocument();
    expect(screen.queryByText('Tạo nhanh Tác vụ mới')).not.toBeInTheDocument();
  });

  it('navigates with ArrowDown and executes on Enter', () => {
    const onClose = vi.fn();
    render(
      <ShortcutHUD
        open={true}
        onClose={onClose}
        shortcuts={sampleShortcuts}
        currentRoute="tasks"
      />
    );

    const input = screen.getByPlaceholderText(/Tìm phím tắt hoặc hành động/i);

    // ArrowDown to move to item index 1 (s2: Danh sách Tác vụ)
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    // Enter to execute
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onClose).toHaveBeenCalled();
    expect(sampleShortcuts[1]?.action).toHaveBeenCalled();
  });

  it('executes item on direct click', () => {
    const onClose = vi.fn();
    render(
      <ShortcutHUD
        open={true}
        onClose={onClose}
        shortcuts={sampleShortcuts}
        currentRoute="tasks"
      />
    );

    fireEvent.click(screen.getByText('Tạo nhanh Tác vụ mới'));
    expect(onClose).toHaveBeenCalled();
    expect(sampleShortcuts[2]?.action).toHaveBeenCalled();
  });
});
