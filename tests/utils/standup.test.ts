import { describe, it, expect } from 'vitest';
import type { ChangeRequest, System, Task } from '../../src/types/models';
import { formatStandupSummary, type StandupTaskContext } from '../../src/utils/standup';

describe('formatStandupSummary (SRCH-04, D-08, D-09, D-10)', () => {
  const cr1: ChangeRequest = {
    id: 'c1',
    code: 'CR-2026-001',
    name: 'Core Banking',
    status: 'In Progress',
    type: 'NEW_FEATURE',
    targets: [{ systemId: 's1' }],
    opsOwners: ['Ops-Lead'],
    businessAnalysts: ['BA-Lead'],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const system1: System = {
    id: 's1',
    code: 'CORE_BANKING',
    name: 'Core Banking Service',
    parentId: null,
    type: 'SERVICE',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const crMap = new Map<string, ChangeRequest>([['c1', cr1]]);
  const systemMap = new Map<string, System>([['s1', system1]]);

  it('returns empty notice when task list is empty', () => {
    const output = formatStandupSummary([], { todayStr: '2026-09-28' });
    expect(output).toBe('# BÁO CÁO STANDUP NGÀY 2026-09-28\n\nKhông có tác vụ nào để báo cáo standup.');
  });

  it('excludes Cancelled tasks and returns empty notice if all tasks are Cancelled', () => {
    const tasks: Task[] = [
      {
        id: 't-cancel',
        crId: 'cr-seed',
        name: 'Discarded research',
        status: 'Cancelled',
        priority: 'Low',
        progress: 0,
        estimateMinutes: 30,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    const output = formatStandupSummary(tasks, { todayStr: '2026-09-28' });
    expect(output).toBe('# BÁO CÁO STANDUP NGÀY 2026-09-28\n\nKhông có tác vụ nào để báo cáo standup.');
  });

  it('groups tasks into 3 status sections (Done, In Progress / In Review / Resolved, Open)', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        crId: 'cr-seed',
        name: 'Done task item',
        status: 'Done',
        priority: 'Medium',
        progress: 100,
        estimateMinutes: 60,
        workType: 'code',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
      {
        id: 't2',
        crId: 'cr-seed',
        name: 'In progress task',
        status: 'In Progress',
        priority: 'High',
        progress: 50,
        estimateMinutes: 120,
        workType: 'document',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
      {
        id: 't3',
        crId: 'cr-seed',
        name: 'In review task',
        status: 'In Review',
        priority: 'Low',
        progress: 90,
        estimateMinutes: 30,
        workType: 'review_code',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
      {
        id: 't4',
        crId: 'cr-seed',
        name: 'Resolved task',
        status: 'Resolved',
        priority: 'Medium',
        progress: 100,
        estimateMinutes: 45,
        workType: 'investigate',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
      {
        id: 't5',
        crId: 'cr-seed',
        name: 'Pending open task',
        status: 'Open',
        priority: 'Low',
        progress: 0,
        estimateMinutes: 60,
        workType: 'meeting',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
      {
        id: 't-pending',
        crId: 'cr-seed',
        name: 'Explicit pending task',
        status: 'Pending',
        priority: 'Medium',
        progress: 0,
        estimateMinutes: 45,
        workType: 'support_testing',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
      {
        id: 't6',
        crId: 'cr-seed',
        name: 'Cancelled should be omitted',
        status: 'Cancelled',
        priority: 'Low',
        progress: 0,
        estimateMinutes: 15,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    const output = formatStandupSummary(tasks, { todayStr: '2026-09-28' });

    expect(output).toContain('### ✅ Đã hoàn thành');
    expect(output).toContain('### 🔄 Đang thực hiện');
    expect(output).toContain('### 📋 Kế hoạch / Đang chờ');
    expect(output).toContain('Explicit pending task');
    expect(output).not.toContain('Cancelled should be omitted');
  });

  it('formats task items with Vietnamese WorkType labels, CR name, deadline, and assigned tags', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        name: 'Thực hiện kết nối API Gateway',
        status: 'In Progress',
        priority: 'High',
        progress: 60,
        estimateMinutes: 180,
        crId: 'c1',
        workType: 'code',
        opsOwners: ['Nguyễn Văn A'],
        businessAnalysts: ['Trần Thị B'],
        deadline: '2026-09-30',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    const context: StandupTaskContext = {
      crMap,
      systemMap,
      todayStr: '2026-09-28',
    };

    const output = formatStandupSummary(tasks, context);

    expect(output).toContain(
      '- [Lập trình] Thực hiện kết nối API Gateway (CR: Core Banking | Hạn: 2026-09-30 | Phụ trách: Ops: Nguyễn Văn A | BA: Trần Thị B)'
    );
  });

  it('formats task items with [JiraKey] immediately following [WorkType] when jiraKey is present (JIRA-05, D-14)', () => {
    const tasks: Task[] = [
      {
        id: 't-jira',
        name: 'Tích hợp API thanh toán thẻ',
        status: 'In Progress',
        priority: 'High',
        progress: 50,
        estimateMinutes: 120,
        crId: 'c1',
        workType: 'code',
        jiraKey: 'SHB-1234',
        deadline: '2026-09-30',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    const context: StandupTaskContext = {
      crMap,
      systemMap,
      todayStr: '2026-09-28',
    };

    const output = formatStandupSummary(tasks, context);

    expect(output).toContain(
      '- [Lập trình][SHB-1234] Tích hợp API thanh toán thẻ (CR: Core Banking | Hạn: 2026-09-30 | Phụ trách: Ops: Ops-Lead | BA: BA-Lead)'
    );
  });

  it('falls back to inherited tags from the CR when task has no direct tags', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        name: 'Họp kỹ thuật hạ tầng',
        status: 'Open',
        priority: 'Medium',
        progress: 0,
        estimateMinutes: 60,
        crId: 'c1',
        workType: 'meeting',
        // No direct tags
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    const context: StandupTaskContext = {
      crMap,
      systemMap,
      todayStr: '2026-09-28',
    };

    const output = formatStandupSummary(tasks, context);

    expect(output).toContain(
      '- [Họp] Họp kỹ thuật hạ tầng (CR: Core Banking | Hạn: Không có | Phụ trách: Ops: Ops-Lead | BA: BA-Lead)'
    );
  });

  it('displays "Cá nhân", fallback "Khác" workType, and "Chưa gán" when task has no CR or assignees', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        crId: 'cr-seed',
        name: 'Ghi chú cá nhân',
        status: 'Open',
        priority: 'Low',
        progress: 0,
        estimateMinutes: 15,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    const output = formatStandupSummary(tasks, { todayStr: '2026-09-28' });

    expect(output).toContain(
      '- [Khác] Ghi chú cá nhân (CR: Cá nhân | Hạn: Không có | Phụ trách: Chưa gán)'
    );
  });

  it('appends urgent warning mark when priority is Urgent', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        crId: 'cr-seed',
        name: 'Khắc phục sự cố Prod',
        status: 'In Progress',
        priority: 'Urgent',
        progress: 30,
        estimateMinutes: 120,
        workType: 'investigate',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    const output = formatStandupSummary(tasks, { todayStr: '2026-09-28' });

    expect(output).toContain('  - ⚠️ Ưu tiên khẩn cấp');
  });
});
