import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { QuickAddBar } from '../../src/components/tasks/QuickAddBar';
import type { ChangeRequest, System } from '../../src/types/models';

const CR_ID = '11111111-1111-4111-8111-111111111111';
const SYS_ID = '22222222-2222-4222-8222-222222222222';

const changeRequests: ChangeRequest[] = [
  {
    id: CR_ID,
    code: 'CR-2026-001',
    name: 'Thanh toán QR',
    type: 'NEW_FEATURE',
    status: 'In Progress',
    targets: [{ systemId: SYS_ID }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const systems: System[] = [
  {
    id: SYS_ID,
    code: 'PAYMENT_SVC',
    name: 'Payment Service',
    type: 'SERVICE',
    parentId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('QuickAddBar', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`test-quickadd-${Math.random()}`);
    await testDb.open();
    await testDb.systems.bulkAdd(systems);
    await testDb.changeRequests.bulkAdd(changeRequests);
  });

  it('renders input with placeholder and data-shortcut-id per D-05, D-29', () => {
    render(
      <QuickAddBar
        db={testDb}
        changeRequests={changeRequests}
        systems={systems}
        activeCrId={CR_ID}
      />
    );
    const input = screen.getByPlaceholderText(/Thêm tác vụ nhanh/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('data-shortcut-id', 'quick-add-input');
  });

  it('disables the input and asks for a CR when no CR is active', () => {
    render(<QuickAddBar db={testDb} changeRequests={changeRequests} systems={systems} />);

    const input = screen.getByPlaceholderText('Chọn CR trước khi thêm tác vụ');
    expect(input).toBeDisabled();
    expect(screen.getByLabelText('Change Request (CR)')).toBeInTheDocument();
  });

  it('parses duration syntax and creates an Open task with the active crId on Enter', async () => {
    const onCreated = vi.fn();
    render(
      <QuickAddBar
        changeRequests={changeRequests}
        systems={systems}
        activeCrId={CR_ID}
        onTaskCreated={onCreated}
        db={testDb}
      />
    );

    const input = screen.getByPlaceholderText(/Thêm tác vụ nhanh/i);
    expect(input).not.toBeDisabled();

    fireEvent.change(input, { target: { value: 'Refactor auth service ~2h 30m' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });

    const createdTask = onCreated.mock.calls[0]![0];
    expect(createdTask.name).toBe('Refactor auth service');
    expect(createdTask.estimateMinutes).toBe(150);
    expect(createdTask.status).toBe('Open');
    expect(createdTask.priority).toBe('Medium');
    expect(createdTask.crId).toBe(CR_ID);

    expect(input).toHaveValue('');
  });

  it('creates the task with an optional systemId chosen from the CR targets', async () => {
    const onCreated = vi.fn();
    render(
      <QuickAddBar
        changeRequests={changeRequests}
        systems={systems}
        activeCrId={CR_ID}
        onTaskCreated={onCreated}
        db={testDb}
      />
    );

    const subsystemSelect = screen.getByLabelText('Subsystem');
    fireEvent.mouseDown(subsystemSelect);
    fireEvent.click(await screen.findByText('Payment Service'));

    const input = screen.getByPlaceholderText(/Thêm tác vụ nhanh/i);
    fireEvent.change(input, { target: { value: 'Write unit tests ~45m' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });

    const createdTask = onCreated.mock.calls[0]![0];
    expect(createdTask.name).toBe('Write unit tests');
    expect(createdTask.estimateMinutes).toBe(45);
    expect(createdTask.crId).toBe(CR_ID);
    expect(createdTask.systemId).toBe(SYS_ID);
  });

  it('ignores empty submission', async () => {
    const onCreated = vi.fn();
    render(
      <QuickAddBar
        changeRequests={changeRequests}
        systems={systems}
        activeCrId={CR_ID}
        onTaskCreated={onCreated}
        db={testDb}
      />
    );

    const input = screen.getByPlaceholderText(/Thêm tác vụ nhanh/i);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onCreated).not.toHaveBeenCalled();
  });
});
