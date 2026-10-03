import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { ItemInsightView } from '../../src/views/ItemInsightView';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask } from '../../src/db/repositories/taskRepo';
import { createProject } from '../../src/db/repositories/projectRepo';
import { createMilestone } from '../../src/db/repositories/milestoneRepo';
import { createWorkSession } from '../../src/db/repositories/workSessionRepo';
import { upsertAllocation } from '../../src/db/repositories/allocationRepo';
import { createNote } from '../../src/db/repositories/noteRepo';

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
    const task = await createTask(
      {
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
      <ItemInsightView
        itemType="task"
        itemId={task.id}
        onNavigate={mockNavigate}
        db={testDb}
      />
    );

    // Title and tags
    expect((await screen.findAllByText('Triển khai tính năng AI Sizing')).length).toBeGreaterThan(0);
    expect(screen.getByText('Ưu tiên High')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/spec')).toBeInTheDocument();

    // Recommendation for large task (>4h)
    expect(await screen.findByText(/Tác vụ có quy mô lớn/i)).toBeInTheDocument();

    // Checklist item
    expect(screen.getByText('Thiết kế prompt')).toBeInTheDocument();
    expect(screen.getByText('Viết unit tests')).toBeInTheDocument();

    // Quick action buttons
    expect(screen.getByRole('button', { name: /bắt đầu làm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /phân bổ lịch/i })).toBeInTheDocument();
  });

  it('renders project insight with task metrics and pre-implementation warnings', async () => {
    const project = await createProject(
      {
        name: 'Dự án Mobile App V2',
        status: 'In Progress',
        deadline: '2026-12-31',
        description: 'Ứng dụng di động mới',
      },
      testDb
    );

    // Create 1 task without estimate
    await createTask(
      {
        name: 'Setup repository',
        projectId: project.id,
        status: 'Open',
        priority: 'Medium',
        estimateMinutes: 0,
      },
      testDb
    );

    render(
      <ItemInsightView
        itemType="project"
        itemId={project.id}
        onNavigate={mockNavigate}
        db={testDb}
      />
    );

    expect((await screen.findAllByText('Dự án Mobile App V2')).length).toBeGreaterThan(0);
    expect(screen.getByText('Ứng dụng di động mới')).toBeInTheDocument();

    // Unestimated warning
    expect(await screen.findByText(/chưa được ước lượng thời gian/i)).toBeInTheDocument();

    // Action buttons
    expect(screen.getByRole('button', { name: /chỉnh sửa dự án/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /thêm tác vụ/i })).toBeInTheDocument();
  });

  it('renders milestone insight with burndown button and capacity check', async () => {
    const project = await createProject(
      {
        name: 'Dự án Web',
        status: 'Open',
      },
      testDb
    );

    const milestone = await createMilestone(
      {
        projectId: project.id,
        name: 'Sprint 1 - Scaffolding',
        status: 'In Progress',
        deadline: '2026-10-10',
      },
      testDb
    );

    await createTask(
      {
        name: 'Core framework setup',
        projectId: project.id,
        milestoneId: milestone.id,
        status: 'In Progress',
        priority: 'Urgent',
        estimateMinutes: 120,
      },
      testDb
    );

    render(
      <ItemInsightView
        itemType="milestone"
        itemId={milestone.id}
        onNavigate={mockNavigate}
        db={testDb}
      />
    );

    expect((await screen.findAllByText('Sprint 1 - Scaffolding')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /xem burndown/i })).toBeInTheDocument();

    // High/Urgent open task advice
    expect(await screen.findByText(/tác vụ ưu tiên Cao \/ Khẩn cấp cần giải quyết/i)).toBeInTheDocument();
  });
});
