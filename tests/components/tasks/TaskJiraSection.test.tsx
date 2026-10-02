import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import type { Task } from '../../../src/types/models';
import { TaskJiraSection } from '../../../src/components/tasks/TaskJiraSection';
import * as jiraApi from '../../../src/services/jira/jiraApi';

describe('TaskJiraSection', () => {
  let testDb: TaskPlannerDatabase;

  const baseTask: Task = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Integrate Jira Task Lifecycle',
    status: 'In Progress',
    priority: 'High',
    progress: 50,
    estimateMinutes: 180,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`test-task-jira-${Math.random()}`);
    await testDb.open();
    vi.clearAllMocks();
  });

  describe('Unlinked View', () => {
    it('renders unlinked empty state with Create Modal button and manual link form', async () => {
      render(
        <TaskJiraSection
          task={baseTask}
          onUpdateTask={vi.fn()}
          db={testDb}
        />
      );

      expect(
        screen.getByText('Tác vụ chưa được liên kết với Jira Issue nào.')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tạo Jira Issue mới' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('SHB-1234')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Gắn Jira Key' })).toBeInTheDocument();
    });

    it('rejects invalid Jira key format with regex validation', async () => {
      const onUpdateTask = vi.fn();
      render(
        <TaskJiraSection
          task={baseTask}
          onUpdateTask={onUpdateTask}
          db={testDb}
        />
      );

      const input = screen.getByPlaceholderText('SHB-1234');
      const linkBtn = screen.getByRole('button', { name: 'Gắn Jira Key' });

      // Invalid: starts with digits or lower case without proper pattern
      fireEvent.change(input, { target: { value: '123-abc' } });
      fireEvent.click(linkBtn);

      expect(
        await screen.findByText('Mã Jira Key không hợp lệ. Ví dụ đúng: SHB-1234')
      ).toBeInTheDocument();
      expect(onUpdateTask).not.toHaveBeenCalled();
    });

    it('links valid Jira key and calls onUpdateTask with uppercase key', async () => {
      const onUpdateTask = vi.fn().mockResolvedValue(undefined);
      render(
        <TaskJiraSection
          task={baseTask}
          onUpdateTask={onUpdateTask}
          db={testDb}
        />
      );

      const input = screen.getByPlaceholderText('SHB-1234');
      const linkBtn = screen.getByRole('button', { name: 'Gắn Jira Key' });

      fireEvent.change(input, { target: { value: 'shb-987' } });
      fireEvent.click(linkBtn);

      await waitFor(() => {
        expect(onUpdateTask).toHaveBeenCalledWith({ jiraKey: 'SHB-987' });
      });
    });

    it('opens CreateJiraIssueModal when clicking Tạo Jira Issue mới', async () => {
      render(
        <TaskJiraSection
          task={baseTask}
          onUpdateTask={vi.fn()}
          db={testDb}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Tạo Jira Issue mới' }));

      // Modal title should appear
      expect(await screen.findByText('Tạo Jira Issue mới', { selector: '.ant-modal-title' })).toBeInTheDocument();
    });
  });

  describe('Linked View & Unlink', () => {
    const linkedTask: Task = {
      ...baseTask,
      jiraKey: 'SHB-456',
    };

    it('renders Jira key badge with external link and calls window.open on click', async () => {
      await testDb.settings.put({ key: 'jira_domain', value: 'shb-bank.atlassian.net' });
      await testDb.settings.put({ key: 'jira_email', value: 'user@shb.com.vn' });
      await testDb.settings.put({ key: 'jira_api_token', value: 'token123' });

      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const getTransitionsSpy = vi
        .spyOn(jiraApi, 'getJiraTransitions')
        .mockResolvedValue({ transitions: [] });

      render(
        <TaskJiraSection
          task={linkedTask}
          onUpdateTask={vi.fn()}
          db={testDb}
        />
      );

      await waitFor(() => {
        expect(getTransitionsSpy).toHaveBeenCalled();
      });

      const keyTag = screen.getByText('SHB-456');
      expect(keyTag).toBeInTheDocument();

      fireEvent.click(keyTag);

      expect(openSpy).toHaveBeenCalledWith(
        'https://shb-bank.atlassian.net/browse/SHB-456',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('unlinks Jira issue when confirmed in Popconfirm', async () => {
      const onUpdateTask = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(jiraApi, 'getJiraTransitions').mockResolvedValue({ transitions: [] });

      render(
        <TaskJiraSection
          task={linkedTask}
          onUpdateTask={onUpdateTask}
          db={testDb}
        />
      );

      await screen.findByText('SHB-456');

      // Click Unlink button to trigger Popconfirm
      const unlinkBtn = screen.getByRole('button', { name: 'Hủy liên kết Jira' });
      fireEvent.click(unlinkBtn);

      // Confirm in Popconfirm
      const confirmBtn = await screen.findByRole('button', { name: 'Hủy liên kết' });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(onUpdateTask).toHaveBeenCalledWith({ jiraKey: undefined });
      });
    });
  });



    it('does not show mismatch when local In Progress maps to cached Jira Doing by name token', async () => {
      const semanticTask: Task = { ...baseTask, jiraKey: 'SHB-DOING' };
      await testDb.settings.bulkPut([
        { key: 'jira_status_mappings', value: { 'In Progress': ['doing'] } },
        {
          key: `jira_cached_status_${semanticTask.id}`,
          value: {
            statusId: '99999',
            statusName: 'Doing',
            statusCategory: 'In Progress',
            syncedAt: new Date().toISOString(),
          },
        },
      ]);

      render(
        <TaskJiraSection
          task={semanticTask}
          onUpdateTask={vi.fn()}
          db={testDb}
        />
      );

      expect(await screen.findByText('Doing')).toBeInTheDocument();
      expect(screen.queryByText('Lệch trạng thái')).not.toBeInTheDocument();
    });

  describe('Workflow Transitions', () => {
    const linkedTask: Task = {
      ...baseTask,
      jiraKey: 'SHB-789',
      status: 'In Progress',
    };

    it('fetches transitions, executes transition, and updates local task status to Done', async () => {
      await testDb.settings.put({ key: 'jira_domain', value: 'shb-bank.atlassian.net' });
      await testDb.settings.put({ key: 'jira_email', value: 'user@shb.com.vn' });
      await testDb.settings.put({ key: 'jira_api_token', value: 'token123' });

      const mockTransitions = [
        {
          id: '21',
          name: 'Close Issue',
          to: {
            id: '6',
            name: 'Closed',
            statusCategory: { id: 3, key: 'done', name: 'Done' },
          },
        },
        {
          id: '31',
          name: 'Under Review',
          to: {
            id: '4',
            name: 'In Review',
            statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' },
          },
        },
      ];

      vi.spyOn(jiraApi, 'getJiraTransitions').mockResolvedValue({
        transitions: mockTransitions,
      });
      const executeSpy = vi.spyOn(jiraApi, 'executeJiraTransition').mockResolvedValue(undefined);
      const onUpdateTask = vi.fn().mockResolvedValue(undefined);

      render(
        <TaskJiraSection
          task={linkedTask}
          onUpdateTask={onUpdateTask}
          db={testDb}
        />
      );

      // Wait for transitions to load and default to first transition ('Close Issue')
      expect(await screen.findByText('Close Issue')).toBeInTheDocument();

      // Click execute button
      const execBtn = screen.getByRole('button', { name: 'Thực hiện chuyển trạng thái' });
      fireEvent.click(execBtn);

      await waitFor(() => {
        expect(executeSpy).toHaveBeenCalledWith(
          expect.objectContaining({ domain: 'shb-bank.atlassian.net' }),
          'SHB-789',
          '21'
        );
      });

      // Status mapped to Done
      await waitFor(() => {
        expect(onUpdateTask).toHaveBeenCalledWith({ status: 'Done' });
      });
    });

    it('does not transition Jira when local task status changes', async () => {
      await testDb.settings.bulkPut([
        { key: 'jira_domain', value: 'shb-bank.atlassian.net' },
        { key: 'jira_email', value: 'user@shb.com.vn' },
        { key: 'jira_api_token', value: 'token123' },
        { key: 'jira_status_mappings', value: { Done: ['6'] } },
      ]);
      vi.spyOn(jiraApi, 'getJiraTransitions').mockResolvedValue({ transitions: [] });
      const executeSpy = vi.spyOn(jiraApi, 'executeJiraTransition').mockResolvedValue(undefined);

      const { rerender } = render(
        <TaskJiraSection task={linkedTask} onUpdateTask={vi.fn()} db={testDb} />
      );
      await screen.findByText('SHB-789');

      rerender(
        <TaskJiraSection
          task={{ ...linkedTask, status: 'Done' }}
          onUpdateTask={vi.fn()}
          db={testDb}
        />
      );

      await waitFor(() => expect(executeSpy).not.toHaveBeenCalled());
      expect(screen.queryByText('Xác nhận đồng bộ trạng thái sang Jira')).not.toBeInTheDocument();
    });

    it('shows alert with direct Jira Web link when transition requires workflow screen', async () => {
      await testDb.settings.put({ key: 'jira_domain', value: 'shb-bank.atlassian.net' });
      await testDb.settings.put({ key: 'jira_email', value: 'user@shb.com.vn' });
      await testDb.settings.put({ key: 'jira_api_token', value: 'token123' });

      const mockTransitions = [
        {
          id: '51',
          name: 'Resolve Issue',
          hasScreen: true,
          to: {
            id: '5',
            name: 'Resolved',
            statusCategory: { id: 3, key: 'done', name: 'Done' },
          },
        },
      ];

      vi.spyOn(jiraApi, 'getJiraTransitions').mockResolvedValue({
        transitions: mockTransitions,
      });
      vi.spyOn(jiraApi, 'executeJiraTransition').mockRejectedValue(
        new Error('Resolution is required for this transition (Screen/Resolution required)')
      );

      render(
        <TaskJiraSection
          task={linkedTask}
          onUpdateTask={vi.fn()}
          db={testDb}
        />
      );

      expect(await screen.findByText('Resolve Issue')).toBeInTheDocument();

      const execBtn = screen.getByRole('button', { name: 'Thực hiện chuyển trạng thái' });
      fireEvent.click(execBtn);

      expect(
        await screen.findByText(
          'Không thể chuyển trạng thái trực tiếp do workflow Jira yêu cầu nhập màn hình (Screen/Resolution). Vui lòng thực hiện trên Jira Web.'
        )
      ).toBeInTheDocument();

      const jiraWebBtn = screen.getByRole('button', { name: 'Mở trên Jira Web' });
      expect(jiraWebBtn).toBeInTheDocument();
    });
  });
});
