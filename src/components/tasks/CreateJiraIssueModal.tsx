import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, Alert, message } from 'antd';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Task } from '../../types/models';
import type { JiraConfig, JiraCreateIssuePayload } from '../../services/jira/types';
import { textToAdf } from '../../services/jira/adf';
import { createJiraIssue, testJiraConnection } from '../../services/jira/jiraApi';
import { useRegisterActiveForm } from '../../context/FormGuardContext';
import { announceToScreenReader } from '../common/AriaLiveRegion';

export interface CreateJiraIssueModalProps {
  open: boolean;
  task: Task;
  onClose: () => void;
  onSuccess: (jiraKey: string) => void;
  db?: TaskPlannerDatabase;
}

interface FormValues {
  projectKey: string;
  issueType: string;
  summary: string;
  description?: string;
}

export const CreateJiraIssueModal: React.FC<CreateJiraIssueModalProps> = ({
  open,
  task,
  onClose,
  onSuccess,
  db = defaultDb,
}) => {
  useRegisterActiveForm('create-jira-issue', open);
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<JiraConfig | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }

    let active = true;
    async function loadSettings() {
      try {
        const [domainRec, emailRec, tokenRec, proxyRec, projRec, issueTypeRec, accountIdRec] = await Promise.all([
          db.settings.get('jira_domain'),
          db.settings.get('jira_email'),
          db.settings.get('jira_api_token'),
          db.settings.get('jira_cors_proxy'),
          db.settings.get('jira_default_project'),
          db.settings.get('jira_default_issue_type'),
          db.settings.get('jira_account_id'),
        ]);

        if (!active) return;

        setAccountId((accountIdRec?.value as string) || null);

        const defaultProj = (projRec?.value as string) || '';
        const defaultType = (issueTypeRec?.value as string) || 'Task';

        setConfig({
          domain: (domainRec?.value as string) || '',
          email: (emailRec?.value as string) || '',
          apiToken: (tokenRec?.value as string) || '',
          corsProxy: (proxyRec?.value as string) || '',
          defaultProjectKey: defaultProj,
          defaultIssueType: defaultType,
        });

        form.setFieldsValue({
          projectKey: defaultProj,
          issueType: defaultType,
          summary: task.name,
          description: task.description || task.notes || '',
        });
      } catch {
        if (active) {
          setError('Không thể tải cấu hình Jira từ cơ sở dữ liệu.');
        }
      }
    }

    void loadSettings();

    return () => {
      active = false;
    };
  }, [open, task, db, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (!config?.domain || !config?.email || !config?.apiToken) {
        setError(
          'Chưa cấu hình thông tin Jira Cloud (Domain, Email, API Token). Vui lòng thiết lập trong Cài đặt > Tích hợp Jira.'
        );
        return;
      }

      setSubmitting(true);
      setError(null);

      let targetAccountId = accountId;
      if (!targetAccountId) {
        try {
          const myself = await testJiraConnection(config);
          if (myself?.accountId) {
            targetAccountId = myself.accountId;
            setAccountId(targetAccountId);
            await db.settings.put({ key: 'jira_account_id', value: targetAccountId });
          }
        } catch {
          // ponytail: fallback if fetching accountId fails, proceed without assignee
        }
      }

      const descTrimmed = values.description?.trim();
      const adfDoc = descTrimmed ? textToAdf(descTrimmed) : undefined;
      const payload: JiraCreateIssuePayload = {
        fields: {
          project: { key: values.projectKey.trim().toUpperCase() },
          issuetype: { name: values.issueType },
          summary: values.summary.trim(),
          ...(adfDoc ? { description: adfDoc } : {}),
          ...(targetAccountId ? { assignee: { id: targetAccountId } } : {}),
        },
      };

      const res = await createJiraIssue(config, payload);
      message.success(`Đã tạo Jira Issue ${res.key}`);
      announceToScreenReader(`Đã tạo Jira Issue ${res.key}`);
      onSuccess(res.key);
      onClose();
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'Lỗi khi tạo Jira Issue.';
      setError(rawMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Tạo Jira Issue mới"
      open={open}
      onCancel={onClose}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose} disabled={submitting}>
          Hủy
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={submitting}
          onClick={() => void handleSubmit()}
        >
          Tạo Jira Issue
        </Button>,
      ]}
    >
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      <Form form={form} layout="vertical">
        <Form.Item
          name="projectKey"
          label="Mã dự án (Project Key)"
          rules={[{ required: true, message: 'Vui lòng nhập Project Key (ví dụ: SHB)' }]}
          extra="Ví dụ: SHB, CORE, PROJ"
        >
          <Input placeholder="SHB" style={{ textTransform: 'uppercase' }} />
        </Form.Item>

        <Form.Item
          name="issueType"
          label="Loại Issue (Issue Type)"
          rules={[{ required: true, message: 'Vui lòng chọn loại Issue' }]}
        >
          <Select
            options={[
              { value: 'Task', label: 'Task' },
              { value: 'Bug', label: 'Bug' },
              { value: 'Story', label: 'Story' },
              { value: 'Sub-task', label: 'Sub-task' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="summary"
          label="Tiêu đề Issue (Summary)"
          rules={[{ required: true, message: 'Vui lòng nhập tiêu đề Issue' }]}
        >
          <Input placeholder="Tiêu đề tác vụ..." maxLength={255} />
        </Form.Item>

        <Form.Item name="description" label="Mô tả Issue (Description)">
          <Input.TextArea
            rows={5}
            placeholder="Mô tả chi tiết tác vụ (sẽ được chuyển đổi thành định dạng Atlassian Document Format)..."
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
