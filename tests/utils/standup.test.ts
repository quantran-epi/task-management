import { describe, it, expect } from 'vitest';
import type { Task, Project, Milestone } from '../../src/types/models';
import { formatStandupSummary, type StandupTaskContext } from '../../src/utils/standup';

describe('formatStandupSummary (SRCH-04, D-08, D-09, D-10)', () => {
  const project1: Project = {
    id: 'p1',
    name: 'Core Banking',
    status: 'In Progress',
    opsOwners: ['Ops-Lead'],
    businessAnalysts: ['BA-Lead'],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const projectMap = new Map<string, Project>([['p1', project1]]);
  const milestoneMap = new Map<string, Milestone>();

  it('returns empty notice when task list is empty', () => {
    const output = formatStandupSummary([], { todayStr: '2026-09-28' });
    expect(output).toBe('# BÁO CÁO STANDUP NGÀY 2026-09-28\n\nKhông có tác vụ nào để báo cáo standup.');
  });

  it('excludes Cancelled tasks and returns empty notice if all tasks are Cancelled', () => {
    const tasks: Task[] = [
      {
        id: 't-cancel',
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
        id: 't6',
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
    expect(output).not.toContain('Cancelled should be omitted');
  });

  it('formats task items with Vietnamese WorkType labels, project name, deadline, and assigned tags', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        name: 'Thực hiện kết nối API Gateway',
        status: 'In Progress',
        priority: 'High',
        progress: 60,
        estimateMinutes: 180,
        projectId: 'p1',
        workType: 'code',
        opsOwners: ['Nguyễn Văn A'],
        businessAnalysts: ['Trần Thị B'],
        deadline: '2026-09-30',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    const context: StandupTaskContext = {
      projectMap,
      milestoneMap,
      todayStr: '2026-09-28',
    };

    const output = formatStandupSummary(tasks, context);

    expect(output).toContain(
      '- [Lập trình] Thực hiện kết nối API Gateway (Dự án: Core Banking | Hạn: 2026-09-30 | Phụ trách: Ops: Nguyễn Văn A | BA: Trần Thị B)'
    );
  });

  it('falls back to inherited tags from project when task has no direct tags', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        name: 'Họp kỹ thuật hạ tầng',
        status: 'Open',
        priority: 'Medium',
        progress: 0,
        estimateMinutes: 60,
        projectId: 'p1',
        workType: 'meeting',
        // No direct tags
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    const context: StandupTaskContext = {
      projectMap,
      milestoneMap,
      todayStr: '2026-09-28',
    };

    const output = formatStandupSummary(tasks, context);

    expect(output).toContain(
      '- [Họp] Họp kỹ thuật hạ tầng (Dự án: Core Banking | Hạn: Không có | Phụ trách: Ops: Ops-Lead | BA: BA-Lead)'
    );
  });

  it('displays "Cá nhân", fallback "Khác" workType, and "Chưa gán" when task has no project or assignees', () => {
    const tasks: Task[] = [
      {
        id: 't1',
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
      '- [Khác] Ghi chú cá nhân (Dự án: Cá nhân | Hạn: Không có | Phụ trách: Chưa gán)'
    );
  });

  it('appends urgent warning mark when priority is Urgent', () => {
    const tasks: Task[] = [
      {
        id: 't1',
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
