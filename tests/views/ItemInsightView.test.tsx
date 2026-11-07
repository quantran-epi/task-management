import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { ItemInsightView } from '../../src/views/ItemInsightView';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask } from '../../src/db/repositories/taskRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { createSystem } from '../../src/db/repositories/systemRepo';

const SYSTEM_INPUT = {
  code: 'PAYMENT_SVC',
  name: 'Payment Service',
  type: 'SERVICE' as const,
  parentId: null,
};

describe('ItemInsightView', () => {
  let testDb: TaskPlannerDatabase;
  const mockNavigate = vi.fn();

  beforeEach(async () => {
    mockNavigate.mockClear();
    testDb = new TaskPlannerDatabase('TestItemInsightView_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders not found empty state when item does not exist', async () => {
    render(
      <ItemInsightView
        itemType="task"
        itemId="non-existent-id"
        onNavigate={mockNavigate}
        db={testDb}
      />
    );

    expect(await screen.findByText(/Không tìm thấy mục task với ID: non-existent-id/i)).toBeInTheDocument();
  });

  it('renders task insight with pre-implementation recommendations and metrics', async () => {
    const system = await createSystem(SYSTEM_INPUT, testDb);
    const cr = await createChangeRequest(
      {
        code: 'CR-2026-001',
        name: 'Thanh toán QR',
        type: 'NEW_FEATURE',
        status: 'In Progress',
        targets: [{ systemId: system.id }],
      },
      testDb
    );

    const task = await createTask(
      {
        crId: cr.id,
        systemId: system.id,
        name: 'Triển khai tính năng AI Sizing',
        status: 'Open',
        priority: 'High',
        estimateMinutes: 300, // > 240m triggers large task recommendation
        description: 'Phân tích và triển khai AI module',
        checklist: [
          { id: 'c1', text: 'Thiết kế prompt', done: false },
          { id: 'c2', text: 'Viết unit tests', done: true },
        ],
        documentLinks: ['https://example.com/spec'],
      },
      testDb
    );

    render(
      <ItemInsightView itemType="task" itemId={task.id} onNavigate={mockNavigate} db={testDb} />
    );

    expect((await screen.findAllByText('Triển khai tính năng AI Sizing')).length).toBeGreaterThan(0);
    expect(screen.getByText('Ưu tiên High')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/spec')).toBeInTheDocument();

    // Parent CR and subsystem are shown for a task
    expect(screen.getAllByText(/CR-2026-001/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PAYMENT_SVC/).length).toBeGreaterThan(0);

    expect(await screen.findByText(/Tác vụ có quy mô lớn/i)).toBeInTheDocument();

    expect(screen.getByText('Thiết kế prompt')).toBeInTheDocument();
    expect(screen.getByText('Viết unit tests')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /bắt đầu làm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /phân bổ lịch/i })).toBeInTheDocument();
  }, 30000);

  it('renders CR insight listing that CR tasks', async () => {
    const system = await createSystem(SYSTEM_INPUT, testDb);
    const cr = await createChangeRequest(
      {
        code: 'CR-2026-001',
        name: 'Thanh toán QR',
        type: 'NEW_FEATURE',
        status: 'In Progress',
        targets: [{ systemId: system.id }],
      },
      testDb
    );

    await createTask(
      { crId: cr.id, name: 'Setup repository', status: 'Open', priority: 'Medium', estimateMinutes: 0 },
      testDb
    );

    render(
      <ItemInsightView itemType="cr" itemId={cr.id} onNavigate={mockNavigate} db={testDb} />
    );

    expect((await screen.findAllByText(/Thanh toán QR/)).length).toBeGreaterThan(0);
    expect(await screen.findByText('Setup repository')).toBeInTheDocument();
    expect(screen.getByText(/Danh sách tác vụ liên quan \(1\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mở CR detail/i })).toBeInTheDocument();
  }, 30000);

  it('renders system insight listing tasks across CRs targeting that subsystem', async () => {
    const system = await createSystem(SYSTEM_INPUT, testDb);
    const cr = await createChangeRequest(
      {
        code: 'CR-2026-001',
        name: 'Thanh toán QR',
        type: 'NEW_FEATURE',
        status: 'In Progress',
        targets: [{ systemId: system.id }],
      },
      testDb
    );

    await createTask(
      {
        crId: cr.id,
        systemId: system.id,
        name: 'Wire payment gateway',
        status: 'In Progress',
        priority: 'Urgent',
        estimateMinutes: 120,
      },
      testDb
    );

    render(
      <ItemInsightView itemType="system" itemId={system.id} onNavigate={mockNavigate} db={testDb} />
    );

    expect((await screen.findAllByText('Payment Service')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Wire payment gateway')).toBeInTheDocument();
    expect(screen.getByText(/Danh sách tác vụ liên quan \(1\)/i)).toBeInTheDocument();
  }, 30000);
});
