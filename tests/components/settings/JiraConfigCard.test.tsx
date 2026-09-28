import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { JiraConfigCard } from '../../../src/components/settings/JiraConfigCard';
import * as jiraApi from '../../../src/services/jira/jiraApi';
import * as ariaLive from '../../../src/components/common/AriaLiveRegion';

vi.mock('../../../src/services/jira/jiraApi', async (importOriginal) => {
  const actual = await importOriginal<typeof jiraApi>();
  return {
    ...actual,
    testJiraConnection: vi.fn(),
  };
});

describe('JiraConfigCard Component (JIRA-01, JIRA-02, D-01, D-02, D-03, D-04)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-jira-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await db.open();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('renders all form fields and action buttons', () => {
    render(<JiraConfigCard db={db} />);

    expect(screen.getByText('Cấu hình tích hợp Jira Cloud')).toBeInTheDocument();
    expect(screen.getByLabelText('Tên miền Jira')).toBeInTheDocument();
    expect(screen.getByLabelText('Email Jira')).toBeInTheDocument();
    expect(screen.getByLabelText('Jira API Token')).toBeInTheDocument();
    expect(screen.getByLabelText('CORS Proxy URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Mã dự án mặc định')).toBeInTheDocument();
    expect(screen.getByLabelText('Loại Issue mặc định')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Lưu cấu hình Jira/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kiểm tra kết nối/i })).toBeInTheDocument();
  });

  it('loads saved settings from db.settings into form fields', async () => {
    await db.settings.put({ key: 'jira_domain', value: 'shb-bank.atlassian.net' });
    await db.settings.put({ key: 'jira_email', value: 'developer@shb.com.vn' });
    await db.settings.put({ key: 'jira_api_token', value: 'saved_token_123' });
    await db.settings.put({ key: 'jira_cors_proxy', value: 'https://proxy.example.com/' });
    await db.settings.put({ key: 'jira_default_project', value: 'SHB' });
    await db.settings.put({ key: 'jira_default_issue_type', value: 'Bug' });

    render(<JiraConfigCard db={db} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Tên miền Jira')).toHaveValue('shb-bank.atlassian.net');
      expect(screen.getByLabelText('Email Jira')).toHaveValue('developer@shb.com.vn');
      expect(screen.getByLabelText('Jira API Token')).toHaveValue('saved_token_123');
      expect(screen.getByLabelText('CORS Proxy URL')).toHaveValue('https://proxy.example.com/');
      expect(screen.getByLabelText('Mã dự án mặc định')).toHaveValue('SHB');
    });
  });

  it('saves updated form values into db.settings on clicking save', async () => {
    const announceSpy = vi.spyOn(ariaLive, 'announceToScreenReader');

    render(<JiraConfigCard db={db} />);

    fireEvent.change(screen.getByLabelText('Tên miền Jira'), {
      target: { value: 'my-org.atlassian.net' },
    });
    fireEvent.change(screen.getByLabelText('Email Jira'), {
      target: { value: 'ops@my-org.com' },
    });
    fireEvent.change(screen.getByLabelText('Jira API Token'), {
      target: { value: 'my_new_secret_token' },
    });
    fireEvent.change(screen.getByLabelText('CORS Proxy URL'), {
      target: { value: 'https://worker.proxy/?url=' },
    });
    fireEvent.change(screen.getByLabelText('Mã dự án mặc định'), {
      target: { value: 'shb' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Lưu cấu hình Jira/i }));

    await waitFor(async () => {
      const savedDomain = await db.settings.get('jira_domain');
      const savedEmail = await db.settings.get('jira_email');
      const savedToken = await db.settings.get('jira_api_token');
      const savedProxy = await db.settings.get('jira_cors_proxy');
      const savedProject = await db.settings.get('jira_default_project');
      const savedIssueType = await db.settings.get('jira_default_issue_type');

      expect(savedDomain?.value).toBe('my-org.atlassian.net');
      expect(savedEmail?.value).toBe('ops@my-org.com');
      expect(savedToken?.value).toBe('my_new_secret_token');
      expect(savedProxy?.value).toBe('https://worker.proxy/?url=');
      expect(savedProject?.value).toBe('SHB'); // converted to uppercase
      expect(savedIssueType?.value).toBe('Task');
    });

    expect(announceSpy).toHaveBeenCalledWith('Đã lưu cấu hình Jira');
  });

  describe('Diagnostic Connection Test', () => {
    it('disables test connection button when credentials are missing', () => {
      render(<JiraConfigCard db={db} />);

      const testBtn = screen.getByRole('button', { name: /Kiểm tra kết nối/i });
      expect(testBtn).toBeDisabled();
    });

    it('displays success alert when testJiraConnection succeeds', async () => {
      vi.mocked(jiraApi.testJiraConnection).mockResolvedValueOnce({
        accountId: 'acc-123',
        displayName: 'Tran Duc Quan',
        emailAddress: 'quan@shb.com.vn',
        active: true,
      });

      render(<JiraConfigCard db={db} />);

      fireEvent.change(screen.getByLabelText('Tên miền Jira'), {
        target: { value: 'shb.atlassian.net' },
      });
      fireEvent.change(screen.getByLabelText('Email Jira'), {
        target: { value: 'quan@shb.com.vn' },
      });
      fireEvent.change(screen.getByLabelText('Jira API Token'), {
        target: { value: 'valid_token' },
      });

      const testBtn = screen.getByRole('button', { name: /Kiểm tra kết nối/i });
      expect(testBtn).toBeEnabled();

      fireEvent.click(testBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Kết nối thành công! Đã xác thực với tài khoản Tran Duc Quan \(quan@shb.com.vn\)\./i)
        ).toBeInTheDocument();
      });
    });

    it('displays warning alert when testJiraConnection rejects with CORS_BLOCKED', async () => {
      vi.mocked(jiraApi.testJiraConnection).mockRejectedValueOnce(new Error('CORS_BLOCKED'));

      render(<JiraConfigCard db={db} />);

      fireEvent.change(screen.getByLabelText('Tên miền Jira'), {
        target: { value: 'shb.atlassian.net' },
      });
      fireEvent.change(screen.getByLabelText('Email Jira'), {
        target: { value: 'quan@shb.com.vn' },
      });
      fireEvent.change(screen.getByLabelText('Jira API Token'), {
        target: { value: 'valid_token' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Kiểm tra kết nối/i }));

      await waitFor(() => {
        expect(
          screen.getByText(
            /Yêu cầu mạng bị chặn do chính sách CORS của trình duyệt\. Vui lòng cấu hình CORS Proxy URL hợp lệ để kết nối với Jira Cloud\./i
          )
        ).toBeInTheDocument();
      });
    });

    it('displays auth error alert when testJiraConnection fails with 401 or 403', async () => {
      vi.mocked(jiraApi.testJiraConnection).mockRejectedValueOnce(
        new Error('Lỗi Jira API: HTTP 401 Unauthorized')
      );

      render(<JiraConfigCard db={db} />);

      fireEvent.change(screen.getByLabelText('Tên miền Jira'), {
        target: { value: 'shb.atlassian.net' },
      });
      fireEvent.change(screen.getByLabelText('Email Jira'), {
        target: { value: 'quan@shb.com.vn' },
      });
      fireEvent.change(screen.getByLabelText('Jira API Token'), {
        target: { value: 'wrong_token' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Kiểm tra kết nối/i }));

      await waitFor(() => {
        expect(
          screen.getByText(
            /Xác thực thất bại \(401\/403\)\. Vui lòng kiểm tra lại Jira Domain, Email và API Token\./i
          )
        ).toBeInTheDocument();
      });
    });
  });
});
