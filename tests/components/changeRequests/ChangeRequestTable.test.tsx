import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { createSystem } from '../../../src/db/repositories/systemRepo';
import { ChangeRequestTable } from '../../../src/components/changeRequests/ChangeRequestTable';
import type { ChangeRequest, System, Task } from '../../../src/types/models';

/**
 * Wave 0 contract for plan 31.2-12 Task 3 (ENT-NORM-02, D-34/D-46).
 *
 * The CR table renders target subsystem pills from `cr.targets` and counts tasks by
 * `t.crId` instead of `t.projectId`. RED until plan 12 lands.
 */
const NOW = '2026-01-01T00:00:00.000Z';

describe('ChangeRequestTable — targets pills and crId task counts (ENT-NORM-02)', () => {
  let db: TaskPlannerDatabase;
  let parent: System;
  let subsystem: System;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-cr-table-' + Math.random().toString(36).slice(2));
    await db.open();
    parent = await createSystem(
      { name: 'SmartCard Core', code: 'SC-CORE', type: 'LOGICAL_GROUP' },
      db
    );
    subsystem = await createSystem(
      { name: 'Card Auth API', code: 'SC-AUTH-API', parentId: parent.id, type: 'SERVICE' },
      db
    );
  });

  afterEach(async () => {
    await db.delete();
  });

  function cr(overrides: Partial<ChangeRequest> = {}): ChangeRequest {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'SmartCard Instant Payment',
      code: 'CR-2026-001',
      status: 'In Progress',
      type: 'NEW_FEATURE',
      targets: [{ systemId: subsystem.id, featureBranch: 'feature/CR-2026-001' }],
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    } as ChangeRequest;
  }

  function task(overrides: Partial<Task> = {}): Task {
    return {
      id: '22222222-2222-4222-8222-222222222222',
      crId: '11111111-1111-4111-8111-111111111111',
      name: 'Build API spec',
      status: 'Done',
      progress: 100,
      priority: 'High',
      estimateMinutes: 60,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    } as Task;
  }

  it('renders target subsystem pills from cr.targets', () => {
    render(
      <ChangeRequestTable
        changeRequests={[cr()]}
        tasks={[]}
        systems={[parent, subsystem]}
        onEditChangeRequest={vi.fn()}
        onDeleteChangeRequest={vi.fn()}
        db={db}
      />
    );

    expect(screen.getByText('SC-AUTH-API')).toBeInTheDocument();
    expect(screen.getByText('SmartCard Instant Payment')).toBeInTheDocument();
  });

  it('counts tasks by crId', () => {
    render(
      <ChangeRequestTable
        changeRequests={[cr()]}
        tasks={[task(), task({ id: '33333333-3333-4333-8333-333333333333', status: 'Open', progress: 0 })]}
        systems={[parent, subsystem]}
        onEditChangeRequest={vi.fn()}
        onDeleteChangeRequest={vi.fn()}
        db={db}
      />
    );

    expect(screen.getByText('1/2 Done')).toBeInTheDocument();
  });

  it('ignores tasks that belong to a different CR', () => {
    render(
      <ChangeRequestTable
        changeRequests={[cr()]}
        tasks={[task({ crId: '99999999-9999-4999-8999-999999999999' })]}
        systems={[parent, subsystem]}
        onEditChangeRequest={vi.fn()}
        onDeleteChangeRequest={vi.fn()}
        db={db}
      />
    );

    // The zero-task branch renders the muted placeholder, not a `0/0 Done` counter.
    expect(screen.getByText('0 tác vụ')).toBeInTheDocument();
  });

  it('renders a muted placeholder when the CR has no targets', () => {
    render(
      <ChangeRequestTable
        changeRequests={[cr({ targets: [] })]}
        tasks={[]}
        systems={[parent, subsystem]}
        onEditChangeRequest={vi.fn()}
        onDeleteChangeRequest={vi.fn()}
        db={db}
      />
    );

    expect(screen.getByText('Chưa chọn')).toBeInTheDocument();
  });
});
