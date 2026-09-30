import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import type { Task } from '../../../src/types/models';
import { CreateJiraIssueModal } from '../../../src/components/tasks/CreateJiraIssueModal';
import * as jiraApi from '../../../src/services/jira/jiraApi';

describe('CreateJiraIssueModal', () => {
  let testDb: TaskPlannerDatabase;

  const mockTask: Task = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Implement OAuth Token Refresh',
    description: 'Line 1: description\nLine 2: details',
    status: 'Open',
    priority: 'High',
    progress: 0,
    estimateMinutes: 120,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`test-create-jira-${Math.random()}`);
    await testDb.open();
    vi.clearAllMocks();
  });

  it('prefills form fields from settings and task data', async () => {
    await testDb.settings.put({ key: 'jira_domain', value: 'my-org.atlassian.net' });
    await testDb.settings.put({ key: 'jira_email', value: 'user@example.com' });
    await testDb.settings.put({ key: 'jira_api_token', value: 'token123' });
    await testDb.settings.put({ key: 'jira_default_project', value: 'SHB' });
    await testDb.settings.put({ key: 'jira_default_issue_type', value: 'Bug' });

    render(
      <CreateJiraIssueModal
        open={true}
        task={mockTask}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        db={testDb}
      />
    );

    // Summary prefilled from task.name
    expect(await screen.findByDisplayValue('Implement OAuth Token Refresh')).toBeInTheDocument();
    // Description prefilled from task.description
    expect(screen.getByDisplayValue(/Line 1: description/)).toBeInTheDocument();
    // Project Key prefilled from settings
    expect(screen.getByDisplayValue('SHB')).toBeInTheDocument();
    // Issue Type prefilled from settings
    expect(screen.getByText('Bug')).toBeInTheDocument();
  });

  it('submits issue creation with ADF description and triggers onSuccess', async () => {
    await testDb.settings.put({ key: 'jira_domain', value: 'my-org.atlassian.net' });
    await testDb.settings.put({ key: 'jira_email', value: 'user@example.com' });
    await testDb.settings.put({ key: 'jira_api_token', value: 'token123' });

    const createSpy = vi.spyOn(jiraApi, 'createJiraIssue').mockResolvedValue({
      id: '10001',
      key: 'SHB-1234',
      self: 'https://my-org.atlassian.net/rest/api/3/issue/10001',
    });

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <CreateJiraIssueModal
        open={true}
        task={mockTask}
        onClose={onClose}
        onSuccess={onSuccess}
        db={testDb}
      />
    );

    await screen.findByDisplayValue('Implement OAuth Token Refresh');

    // Fill project key
    const projectKeyInput = screen.getByPlaceholderText('SHB');
    fireEvent.change(projectKeyInput, { target: { value: 'shb' } });

    // Click submit
    const submitBtn = screen.getByRole('button', { name: 'Tạo Jira Issue' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'my-org.atlassian.net',
        email: 'user@example.com',
        apiToken: 'token123',
      }),
      {
        fields: {
          project: { key: 'SHB' },
          issuetype: { name: 'Task' },
          summary: 'Implement OAuth Token Refresh',
          description: {
            version: 1,
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Line 1: description' }],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Line 2: details' }],
              },
            ],
          },
        },
      }
    );

    expect(onSuccess).toHaveBeenCalledWith('SHB-1234');
    expect(onClose).toHaveBeenCalled();
  });

  it('auto assigns issue to user accountId when available', async () => {
    await testDb.settings.put({ key: 'jira_domain', value: 'my-org.atlassian.net' });
    await testDb.settings.put({ key: 'jira_email', value: 'user@example.com' });
    await testDb.settings.put({ key: 'jira_api_token', value: 'token123' });
    await testDb.settings.put({ key: 'jira_account_id', value: 'acc-7890' });

    const createSpy = vi.spyOn(jiraApi, 'createJiraIssue').mockResolvedValue({
      id: '10002',
      key: 'SHB-5678',
      self: 'https://my-org.atlassian.net/rest/api/3/issue/10002',
    });

    render(
      <CreateJiraIssueModal
        open={true}
        task={mockTask}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        db={testDb}
      />
    );

    await screen.findByDisplayValue('Implement OAuth Token Refresh');

    const projectKeyInput = screen.getByPlaceholderText('SHB');
    fireEvent.change(projectKeyInput, { target: { value: 'SHB' } });

    const submitBtn = screen.getByRole('button', { name: 'Tạo Jira Issue' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fields: expect.objectContaining({
          assignee: { id: 'acc-7890' },
        }),
      })
    );
  });

  it('displays alert if Jira credentials are not configured', async () => {
    render(
      <CreateJiraIssueModal
        open={true}
        task={mockTask}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        db={testDb}
      />
    );

    await screen.findByDisplayValue('Implement OAuth Token Refresh');

    const projectKeyInput = screen.getByPlaceholderText('SHB');
    fireEvent.change(projectKeyInput, { target: { value: 'SHB' } });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo Jira Issue' }));

    expect(
      await screen.findByText(/Chưa cấu hình thông tin Jira Cloud \(Domain, Email, API Token\)/)
    ).toBeInTheDocument();
  });

  it('displays error alert when Jira API rejects creation', async () => {
    await testDb.settings.put({ key: 'jira_domain', value: 'my-org.atlassian.net' });
    await testDb.settings.put({ key: 'jira_email', value: 'user@example.com' });
    await testDb.settings.put({ key: 'jira_api_token', value: 'token123' });

    vi.spyOn(jiraApi, 'createJiraIssue').mockRejectedValue(
      new Error('Project key SHB does not exist or you lack permission')
    );

    render(
      <CreateJiraIssueModal
        open={true}
        task={mockTask}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        db={testDb}
      />
    );

    await screen.findByDisplayValue('Implement OAuth Token Refresh');
    const projectKeyInput = screen.getByPlaceholderText('SHB');
    fireEvent.change(projectKeyInput, { target: { value: 'SHB' } });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo Jira Issue' }));

    expect(
      await screen.findByText(/Project key SHB does not exist or you lack permission/)
    ).toBeInTheDocument();
  });
});
