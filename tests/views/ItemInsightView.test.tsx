import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { ItemInsightView } from '../../src/views/ItemInsightView';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask } from '../../src/db/repositories/taskRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { createSystem } from '../../src/db/repositories/systemRepo';
import { ThemeAppHolder } from '../../src/components/ui';

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
        links: [{ name: 'Spec', url: 'https://example.com/spec' }],
      },
      testDb
    );

    render(
      <ItemInsightView itemType="task" itemId={task.id} onNavigate={mockNavigate} db={testDb} />
    );

    expect((await screen.findAllByText('Triển khai tính năng AI Sizing')).length).toBeGreaterThan(0);
    expect(screen.getByText('Ưu tiên High')).toBeInTheDocument();
    expect(screen.getByText('Spec')).toBeInTheDocument();

    // Parent CR and subsystem are shown for a task (live queries resolve after first paint).
    expect((await screen.findAllByText(/CR-2026-001/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/PAYMENT_SVC/)).length).toBeGreaterThan(0);

    expect(await screen.findByText(/Tác vụ có quy mô lớn/i)).toBeInTheDocument();

    expect(screen.getByText('Thiết kế prompt')).toBeInTheDocument();
    expect(screen.getByText('Viết unit tests')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /bắt đầu làm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /phân bổ lịch/i })).toBeInTheDocument();
  }, 30000);

  it('renders system tag in task header, click navigates to system insight, with both fallbacks', async () => {
    const system = await createSystem(SYSTEM_INPUT, testDb);
    const cr = await createChangeRequest(
      {
        code: 'CR-2026-010',
        name: 'Thanh toán QR',
        type: 'NEW_FEATURE',
        status: 'In Progress',
        targets: [{ systemId: system.id }],
      },
      testDb
    );
    const attached = await createTask(
      { crId: cr.id, systemId: system.id, name: 'Tác vụ có hệ thống', status: 'Open', priority: 'Medium', estimateMinutes: 0 },
      testDb
    );
    const unattached = await createTask(
      { crId: cr.id, name: 'Tác vụ chung', status: 'Open', priority: 'Medium', estimateMinutes: 0 },
      testDb
    );
    const view = render(
      <ItemInsightView itemType="task" itemId={attached.id} onNavigate={mockNavigate} db={testDb} />
    );
    const tag = await screen.findByText('PAYMENT_SVC — Payment Service');
    fireEvent.click(tag);
    expect(mockNavigate).toHaveBeenCalledWith('insight', {
      type: 'system',
      id: system.id,
      name: 'Payment Service',
    });
    view.unmount();

    mockNavigate.mockClear();
    const unattachedView = render(
      <ItemInsightView itemType="task" itemId={unattached.id} onNavigate={mockNavigate} db={testDb} />
    );
    expect(await screen.findByText('Chung (không gắn)')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    unattachedView.unmount();

    const orphanId = '00000000-0000-4000-8000-000000000999';
    await testDb.tasks.update(attached.id, { systemId: orphanId });
    const orphanView = render(
      <ItemInsightView itemType="task" itemId={attached.id} onNavigate={mockNavigate} db={testDb} />
    );
    expect(await screen.findByText(orphanId)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    orphanView.unmount();
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

  async function seedInsight(opts: { links?: Array<{ name: string; url: string }>; linkOnCr?: boolean } = {}) {
    const system = await createSystem(SYSTEM_INPUT, testDb);
    const cr = await createChangeRequest(
      {
        code: 'CR-2026-020',
        name: 'Thanh toán QR',
        type: 'NEW_FEATURE',
        status: 'In Progress',
        targets: [{ systemId: system.id }],
        ...(opts.linkOnCr ? { links: opts.links ?? [] } : {}),
      },
      testDb
    );
    const task = await createTask(
      {
        crId: cr.id,
        systemId: system.id,
        name: 'Tác vụ có link',
        status: 'Open',
        priority: 'Medium',
        estimateMinutes: 0,
        ...(!opts.linkOnCr ? { links: opts.links ?? [] } : {}),
      },
      testDb
    );
    return { system, cr, task };
  }

  function openInsight(itemType: 'task' | 'cr' | 'system', id: string) {
    render(
      <ThemeAppHolder>
        <ItemInsightView itemType={itemType} itemId={id} onNavigate={mockNavigate} db={testDb} />
      </ThemeAppHolder>
    );
  }

  function setLinkInput(testId: string, value: string) {
    const node = screen.getByTestId(testId);
    const input = (node.matches('input') ? node : node.querySelector('input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
  }

  it('adds a link with an empty name to a task with no existing links and labels it with the URL', async () => {
    const { task } = await seedInsight();
    openInsight('task', task.id);
    await screen.findByTestId('item-insight-link-url');
    const url = 'https://example.com/task-spec';

    setLinkInput('item-insight-link-url', url);
    fireEvent.click(screen.getByTestId('item-insight-link-add'));

    await waitFor(async () => {
      const stored = await testDb.tasks.get(task.id);
      expect(stored?.links).toEqual([{ name: '', url }]);
    });
    expect(screen.getByRole('button', { name: `link ${url}` })).toHaveAttribute('title', url);
    expect(screen.getByTestId('item-insight-link-url')).toHaveValue('');
  }, 30000);

  it('adds a named link and shows the name on task insight', async () => {
    const { task } = await seedInsight();
    openInsight('task', task.id);
    await screen.findByTestId('item-insight-link-url');
    const url = 'https://example.com/task-named';

    setLinkInput('item-insight-link-name', 'Spec');
    setLinkInput('item-insight-link-url', url);
    fireEvent.click(screen.getByTestId('item-insight-link-add'));

    await waitFor(async () => {
      const stored = await testDb.tasks.get(task.id);
      expect(stored?.links).toEqual([{ name: 'Spec', url }]);
    });
    expect(screen.getByRole('button', { name: 'link Spec' })).toHaveAttribute('title', url);
  }, 30000);

  it('rejects an unsafe URL without writing to task.links', async () => {
    const { task } = await seedInsight();
    openInsight('task', task.id);
    await screen.findByTestId('item-insight-link-url');

    setLinkInput('item-insight-link-url', 'javascript:alert(1)');
    fireEvent.click(screen.getByTestId('item-insight-link-add'));

    await waitFor(() => {
      expect(screen.getByText('URL không hợp lệ')).toBeInTheDocument();
    });
    const stored = await testDb.tasks.get(task.id);
    expect(stored?.links).toEqual([]);
  }, 30000);

  it('keeps legacy CR links visible without rendering a task-only quick create row', async () => {
    const { cr } = await seedInsight({
      linkOnCr: true,
      links: [{ name: 'Spec', url: 'https://example.com/cr-spec' }],
    });
    openInsight('cr', cr.id);

    expect(await screen.findByRole('button', { name: 'link Spec' })).toBeInTheDocument();
    expect(screen.queryByTestId('item-insight-link-url')).not.toBeInTheDocument();
  }, 30000);
});
