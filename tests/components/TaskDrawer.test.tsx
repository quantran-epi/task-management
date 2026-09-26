import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createProject } from '../../src/db/repositories/projectRepo';
import { createMilestone } from '../../src/db/repositories/milestoneRepo';
import { createTask } from '../../src/db/repositories/taskRepo';
import { TaskDrawer } from '../../src/components/tasks/TaskDrawer';

describe('TaskDrawer', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`test-drawer-${Math.random()}`);
    await testDb.open();
    vi.clearAllMocks();
  });

  it('renders slide-out panel editing task properties per D-08, TASK-01', async () => {
    const task = await createTask(
      {
        name: 'Implement OAuth callback',
        notes: 'Handle PKCE verification code',
        priority: 'High',
        status: 'Open',
        estimateMinutes: 90,
      },
      testDb
    );

    const onClose = vi.fn();

    render(
      <TaskDrawer
        taskId={task.id}
        open={true}
        onClose={onClose}
        db={testDb}
      />
    );

    expect(await screen.findByDisplayValue('Implement OAuth callback')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Handle PKCE verification code')).toBeInTheDocument();

    // Estimate is split into hours (1) and minutes (30)
    expect(screen.getByLabelText('Hours')).toHaveValue('1');
    expect(screen.getByLabelText('Minutes')).toHaveValue('30');
  });

  it('cascading reparenting clears milestone when changing project per D-10, WORK-04', async () => {
    const projA = await createProject({ name: 'Project Alpha' }, testDb);
    const projB = await createProject({ name: 'Project Beta' }, testDb);
    const msA = await createMilestone({ projectId: projA.id, name: 'Sprint 1' }, testDb);

    const task = await createTask(
      {
        name: 'Alpha Task',
        projectId: projA.id,
        milestoneId: msA.id,
        status: 'Open',
      },
      testDb
    );

    const onSave = vi.fn();
    render(
      <TaskDrawer
        taskId={task.id}
        open={true}
        onClose={vi.fn()}
        onSave={onSave}
        db={testDb}
      />
    );

    await screen.findByDisplayValue('Alpha Task');

    // Switch Project to Project Beta
    const projectSelect = screen.getByLabelText('Project');
    fireEvent.mouseDown(projectSelect);
    const betaOption = await screen.findByText('Project Beta');
    fireEvent.click(betaOption);

    // Click Save Task
    const saveBtn = screen.getByRole('button', { name: /save task/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const updated = await testDb.tasks.get(task.id);
    expect(updated?.id).toBe(task.id); // Stable UUID preserved (WORK-04)
    expect(updated?.projectId).toBe(projB.id);
    expect(updated?.milestoneId).toBeUndefined(); // Milestone cleared (D-10)
  });

  it('sets standalone (projectId=undefined, milestoneId=undefined) when selecting Standalone per D-09', async () => {
    const proj = await createProject({ name: 'Project Alpha' }, testDb);
    const ms = await createMilestone({ projectId: proj.id, name: 'Sprint 1' }, testDb);
    const task = await createTask(
      {
        name: 'Task with project',
        projectId: proj.id,
        milestoneId: ms.id,
        status: 'Open',
      },
      testDb
    );

    const onSave = vi.fn();
    render(
      <TaskDrawer
        taskId={task.id}
        open={true}
        onClose={vi.fn()}
        onSave={onSave}
        db={testDb}
      />
    );

    await screen.findByDisplayValue('Task with project');

    // Switch Project to None / Standalone
    const projectSelect = screen.getByLabelText('Project');
    fireEvent.mouseDown(projectSelect);
    const standaloneOption = await screen.findByText('None / Standalone');
    fireEvent.click(standaloneOption);

    // Save
    fireEvent.click(screen.getByRole('button', { name: /save task/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const updated = await testDb.tasks.get(task.id);
    expect(updated?.projectId).toBeUndefined();
    expect(updated?.milestoneId).toBeUndefined();
  });

  it('updates estimate using quick preset buttons (+30m, 1h, 2h, 4h, 8h) per D-21', async () => {
    const task = await createTask(
      { name: 'Preset task', status: 'Open', estimateMinutes: 60 },
      testDb
    );

    render(
      <TaskDrawer
        taskId={task.id}
        open={true}
        onClose={vi.fn()}
        db={testDb}
      />
    );

    await screen.findByDisplayValue('Preset task');

    // Click 2h preset
    const preset2h = screen.getByRole('button', { name: '2h' });
    fireEvent.click(preset2h);

    expect(screen.getByLabelText('Hours')).toHaveValue('2');
    expect(screen.getByLabelText('Minutes')).toHaveValue('0');

    // Click +30m preset -> should become 2h 30m
    const presetAdd30 = screen.getByRole('button', { name: '+30m' });
    fireEvent.click(presetAdd30);

    expect(screen.getByLabelText('Hours')).toHaveValue('2');
    expect(screen.getByLabelText('Minutes')).toHaveValue('30');
  });

  it('validates document links with http/https regex per D-25, T-02-05', async () => {
    const task = await createTask({ name: 'Link task', status: 'Open' }, testDb);

    render(
      <TaskDrawer
        taskId={task.id}
        open={true}
        onClose={vi.fn()}
        db={testDb}
      />
    );

    await screen.findByDisplayValue('Link task');

    // Click Add Link
    const addLinkBtn = screen.getByRole('button', { name: /add link/i });
    fireEvent.click(addLinkBtn);

    const linkInput = screen.getByPlaceholderText('https://example.com/spec');

    // Enter invalid javascript: link
    fireEvent.change(linkInput, { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: /save task/i }));

    // Should display validation error
    expect(
      await screen.findByText('Document link must be a valid HTTP or HTTPS URL.')
    ).toBeInTheDocument();
  });

  it('restores focus to trigger element on drawer close per D-29, D-30, UX-03', async () => {
    const task = await createTask({ name: 'Focus task', status: 'Open' }, testDb);

    const triggerBtn = document.createElement('button');
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();

    const onClose = vi.fn();
    const { unmount } = render(
      <TaskDrawer
        taskId={task.id}
        open={true}
        onClose={onClose}
        triggerRef={triggerBtn}
        db={testDb}
      />
    );

    await screen.findByDisplayValue('Focus task');

    // Click Close (Ant Design Drawer close button)
    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalled();

    // Simulate drawer closing unmount
    unmount();

    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(document.activeElement).toBe(triggerBtn);

    document.body.removeChild(triggerBtn);
  });
});
