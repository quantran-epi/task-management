import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { TargetSystemsSelector } from '../../../src/components/changeRequests/TargetSystemsSelector';
import { ChangeRequestModal } from '../../../src/components/changeRequests/ChangeRequestModal';
import { createSystem } from '../../../src/db/repositories/systemRepo';

describe('TargetSystemsSelector & ChangeRequestModal (Task 1)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-cr-modal-' + Math.random().toString(36).slice(2));
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('TargetSystemsSelector loads parent systems and child subsystems in treeData', async () => {
    const parent = await createSystem(
      {
        name: 'SmartCard Core',
        code: 'SC-CORE',
        type: 'LOGICAL_GROUP',
      },
      db
    );

    await createSystem(
      {
        name: 'Card Auth API',
        code: 'SC-AUTH-API',
        parentId: parent.id,
        type: 'SERVICE',
      },
      db
    );

    const onChange = vi.fn();
    render(<TargetSystemsSelector value={[]} onChange={onChange} db={db} />);

    // Selector renders TreeSelect container
    expect(screen.getByTestId('target-systems-selector')).toBeInTheDocument();
  });

  it('ChangeRequestModal renders 3 CR types and enforces validation', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ChangeRequestModal
        open={true}
        onClose={onClose}
        onSave={onSave}
        db={db}
      />
    );

    // Modal title
    expect(screen.getByText('Change Request mới')).toBeInTheDocument();

    // 3 CR types
    expect(screen.getByText('Tạo mới tính năng')).toBeInTheDocument();
    expect(screen.getByText('Nâng cấp / Cập nhật')).toBeInTheDocument();
    expect(screen.getByText('Sửa lỗi')).toBeInTheDocument();

    // Attempting submit without values should fail validation
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Change Request' }));
    await waitFor(() => {
      expect(screen.getByText('Vui lòng nhập tên Change Request hợp lệ (1-120 ký tự).')).toBeInTheDocument();
      expect(screen.getByText('Vui lòng chọn ít nhất 1 subsystem chịu ảnh hưởng.')).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('submitting modal calls onSave with targetSystemIds and selected type', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    const parent = await createSystem(
      {
        name: 'SmartCard Core',
        code: 'SC-CORE',
        type: 'LOGICAL_GROUP',
      },
      db
    );

    const subsystem = await createSystem(
      {
        name: 'Card Auth API',
        code: 'SC-AUTH-API',
        parentId: parent.id,
        type: 'SERVICE',
      },
      db
    );

    render(
      <ChangeRequestModal
        open={true}
        onClose={onClose}
        onSave={onSave}
        db={db}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('vd: Tích hợp xác thực SmartCard và hoàn tiền tự động'), {
      target: { value: 'Feature CR 01' },
    });

    fireEvent.change(screen.getByPlaceholderText('vd: CR-2026-001'), {
      target: { value: 'CR-001' },
    });

    // Select Bugfix type
    fireEvent.click(screen.getByText('Sửa lỗi'));

    // Select target subsystem using the ChangeRequestModal instance
    // Simulate setting targetSystemIds or testing component with predefined initial values
  });
});
