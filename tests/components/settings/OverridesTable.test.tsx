import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { OverridesTable } from '../../../src/components/settings/OverridesTable';
import { setCapacityOverride } from '../../../src/db/repositories/capacityRepo';

describe('OverridesTable Component', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-overrides-table-' + Math.random().toString(36).slice(2));
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('renders override list and allows editing an existing override', async () => {
    await setCapacityOverride('2026-10-15', 240, 'Doctor appointment', db);

    render(<OverridesTable db={db} />);

    expect(await screen.findByText('2026-10-15')).toBeInTheDocument();
    expect(screen.getByText('Doctor appointment')).toBeInTheDocument();
    expect(screen.getByText('4h')).toBeInTheDocument();

    // Click edit button
    const editBtn = screen.getByRole('button', { name: /Chỉnh sửa ngoại lệ cho 2026-10-15/i });
    fireEvent.click(editBtn);

    // Modal opens with edit title
    expect(await screen.findByText('Chỉnh sửa ngoại lệ công suất')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cập nhật/i })).toBeInTheDocument();
  });

  it('allows opening create modal with single date or range mode', async () => {
    render(<OverridesTable db={db} />);

    const addBtn = screen.getByTestId('add-override-btn');
    fireEvent.click(addBtn);

    expect(await screen.findByText('Thêm ngoại lệ công suất theo ngày')).toBeInTheDocument();
    expect(screen.getByText('Phương thức chọn ngày')).toBeInTheDocument();
    expect(screen.getByText('Một ngày')).toBeInTheDocument();
    expect(screen.getByText('Khoảng ngày')).toBeInTheDocument();

    // Switch to date range mode
    fireEvent.click(screen.getByText('Khoảng ngày'));
    expect(await screen.findByText('Khoảng ngày', { selector: 'label' })).toBeInTheDocument();
  });
});
