import React, { useEffect, useRef, useState } from 'react';
import { Modal, Form, Input, DatePicker, Select, Button, Space, message } from 'antd';
import { DeleteOutlined, LinkOutlined, PlusOutlined, ApiOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { Project, ProjectStatus, ReminderItem } from '../../types/models';
import { createFocusRestorer } from '../../utils/focus';
import { useRegisterActiveForm } from '../../context/FormGuardContext';
import { TagSelect } from '../common/TagSelect';
import { RemindersFormList, formatRemindersForForm, formatRemindersForSave } from '../common/RemindersFormList';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { JiraConfig, JiraCreateIssuePayload } from '../../services/jira/types';
import { createJiraIssue } from '../../services/jira/jiraApi';
import { textToAdf } from '../../services/jira/adf';
import { getJiraApiToken } from '../../services/jiraTokenService';

export interface ProjectModalProps {
  open: boolean;
  project?: Project | null | undefined;
  onClose: () => void;
  onSave: (values: {
    name: string;
    description?: string | undefined;
    deadline?: string | undefined;
    notes?: string | undefined;
    status: ProjectStatus;
    jiraEpicKey?: string | undefined;
    opsOwners?: string[] | undefined;
    businessAnalysts?: string[] | undefined;
    documentLinks?: string[] | undefined;
    reminderDate?: string | undefined;
    reminderNote?: string | undefined;
    reminders?: ReminderItem[] | undefined;
  }) => Promise<void> | void;
  loading?: boolean | undefined;
  db?: TaskPlannerDatabase | undefined;
}

interface ProjectFormValues {
  name: string;
  description?: string;
  deadline?: Dayjs | null;
  notes?: string;
  status: ProjectStatus;
  jiraEpicKey?: string;
  opsOwners?: string[];
  businessAnalysts?: string[];
  documentLinks?: string[];
  reminderDate?: Dayjs | null;
  reminderNote?: string;
  reminders?: unknown[];
}

const PROJECT_STATUSES: ProjectStatus[] = ['Open', 'Pending', 'In Progress', 'Done', 'Cancelled'];

const STATUS_LABELS: Record<ProjectStatus, string> = {
  Open: 'Mở',
  Pending: 'Chờ xử lý',
  'In Progress': 'Đang làm',
  Done: 'Hoàn thành',
  Cancelled: 'Đã hủy',
};

export const ProjectModal: React.FC<ProjectModalProps> = ({
  open,
  project,
  onClose,
  onSave,
  loading = false,
  db = defaultDb,
}) => {
  useRegisterActiveForm('project-modal', open);

  const [form] = Form.useForm<ProjectFormValues>();
  const restorerRef = useRef<(() => void) | null>(null);
  const [creatingEpic, setCreatingEpic] = useState(false);

  useEffect(() => {
    if (open) {
      restorerRef.current = createFocusRestorer();
      if (project) {
        form.setFieldsValue({
          name: project.name,
          description: project.description || '',
          deadline: project.deadline ? dayjs(project.deadline, 'YYYY-MM-DD') : null,
          notes: project.notes || '',
          status: project.status,
          jiraEpicKey: project.jiraEpicKey || '',
          opsOwners: project.opsOwners ?? [],
          businessAnalysts: project.businessAnalysts ?? [],
          documentLinks: project.documentLinks ?? [],
          reminders: formatRemindersForForm(project),
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          status: 'Open',
          jiraEpicKey: '',
          opsOwners: [],
          businessAnalysts: [],
          documentLinks: [],
          reminders: [],
        });
      }
    }
  }, [open, project, form]);

  const handleClose = () => {
    onClose();
    if (restorerRef.current) {
      restorerRef.current();
    }
  };

  const handleCreateJiraEpic = async () => {
    const projectName = form.getFieldValue('name')?.trim();
    if (!projectName) {
      message.error('Vui lòng nhập tên dự án trước khi tạo Jira Epic.');
      return;
    }

    try {
      setCreatingEpic(true);
      const [domainRec, emailRec, tokenRec, proxyRec, projRec] = await Promise.all([
        db.settings.get('jira_domain'),
        db.settings.get('jira_email'),
        getJiraApiToken(db),
        db.settings.get('jira_cors_proxy'),
        db.settings.get('jira_default_project'),
      ]);

      const config: JiraConfig = {
        domain: (domainRec?.value as string) || '',
        email: (emailRec?.value as string) || '',
        apiToken: tokenRec || '',
        corsProxy: (proxyRec?.value as string) || '',
        defaultProjectKey: (projRec?.value as string) || '',
      };

      if (!config.domain || !config.email || !config.apiToken) {
        message.error('Chưa cấu hình Jira Cloud. Vui lòng thiết lập trong Cài đặt > Tích hợp Jira.');
        return;
      }

      if (!config.defaultProjectKey) {
        message.error('Chưa cấu hình Mã dự án Jira mặc định trong Cài đặt > Tích hợp Jira.');
        return;
      }

      const desc = form.getFieldValue('description')?.trim();
      const payload: JiraCreateIssuePayload = {
        fields: {
          project: { key: config.defaultProjectKey.trim().toUpperCase() },
          issuetype: { name: 'Epic' },
          summary: projectName,
          ...(desc ? { description: textToAdf(desc) } : {}),
        },
      };

      const res = await createJiraIssue(config, payload);
      form.setFieldsValue({ jiraEpicKey: res.key });
      message.success(`Đã tạo Jira Epic ${res.key}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi tạo Jira Epic.';
      message.error(msg);
    } finally {
      setCreatingEpic(false);
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const cleanedLinks = (values.documentLinks ?? [])
        .map((l) => (typeof l === 'string' ? l.trim() : ''))
        .filter((l) => l.length > 0);
      const savedReminders = formatRemindersForSave(values.reminders);
      const epicKeyTrimmed = values.jiraEpicKey?.trim().toUpperCase();
      await onSave({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
        notes: values.notes?.trim() || undefined,
        status: values.status,
        jiraEpicKey: epicKeyTrimmed || undefined,
        opsOwners: (values.opsOwners ?? []).length > 0 ? values.opsOwners : undefined,
        businessAnalysts:
          (values.businessAnalysts ?? []).length > 0 ? values.businessAnalysts : undefined,
        documentLinks: cleanedLinks.length > 0 ? cleanedLinks : undefined,
        reminders: savedReminders ?? [],
        reminderDate: savedReminders?.[0]?.date,
        reminderNote: savedReminders?.[0]?.note,
      });
      handleClose();
    } catch {
      // Form validation error
    }
  };

  return (
    <Modal
      title={project ? 'Sửa dự án' : 'Dự án mới'}
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={loading}
      okText={project ? 'Lưu thay đổi' : 'Tạo dự án'}
      cancelText="Hủy"
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ status: 'Open' }}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="name"
          label="Tên dự án"
          rules={[
            { required: true, message: 'Vui lòng nhập tên dự án hợp lệ (1-120 ký tự).' },
            { max: 120, message: 'Tên không được vượt quá 120 ký tự.' },
          ]}
        >
          <Input placeholder="vd: Thiết kế lại Website" autoFocus />
        </Form.Item>

        <Form.Item name="description" label="Mô tả">
          <Input placeholder="Tóm tắt phạm vi dự án" />
        </Form.Item>

        <div style={{ display: 'flex', gap: 16 }}>
          <Form.Item name="status" label="Trạng thái" style={{ flex: 1 }}>
            <Select options={PROJECT_STATUSES.map((s) => ({ label: STATUS_LABELS[s] || s, value: s }))} />
          </Form.Item>

          <Form.Item name="deadline" label="Hạn chót mục tiêu" style={{ flex: 1 }}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Form.Item name="opsOwners" label="Ops Owner">
            <TagSelect field="opsOwners" />
          </Form.Item>

          <Form.Item name="businessAnalysts" label="Business Analyst">
            <TagSelect field="businessAnalysts" />
          </Form.Item>
        </div>

        {/* Reminders (D-03, D-05, NOTIF-06) */}
        <RemindersFormList />

        {/* Document Links */}
        <Form.Item label="Tài liệu liên kết">
          <Form.List name="documentLinks">
            {(fields, { add, remove }) => (
              <Space direction="vertical" style={{ width: '100%' }}>
                {fields.map((field) => (
                  <div key={field.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Form.Item
                      {...field}
                      noStyle
                      rules={[
                        {
                          validator: (_: unknown, value: string) => {
                            if (!value || /^https?:\/\//i.test(value) || /^file:\/\//i.test(value) || /^[A-Za-z]:\\/.test(value) || /^\//.test(value) || /^\\\\/.test(value)) {
                              return Promise.resolve();
                            }
                            return Promise.reject('Liên kết phải là URL (http/https), đường dẫn thư mục, hoặc file URI.');
                          },
                        },
                      ]}
                    >
                      <Input
                        placeholder="https://... hoặc C:\folder hoặc /path/to/folder"
                        prefix={<LinkOutlined style={{ color: '#8c8c8c' }} />}
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                      aria-label="Xóa liên kết"
                    />
                  </div>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add('')}
                  icon={<PlusOutlined />}
                  style={{ width: '100%' }}
                >
                  Thêm liên kết
                </Button>
              </Space>
            )}
          </Form.List>
        </Form.Item>

        {/* Jira Epic Mapping (D-05, D-06) */}
        <div style={{ marginBottom: 16 }}>
          <Form.Item
            name="jiraEpicKey"
            label="Mã Jira Epic (Jira Epic Key)"
            rules={[
              {
                pattern: /^[A-Z][A-Z0-9]+-[0-9]+$/,
                message: 'Mã Jira Epic không hợp lệ (ví dụ: PROJ-100, SHB-12)',
              },
            ]}
            extra="Liên kết dự án với một Jira Epic. Các tác vụ con khi tạo Jira Issue sẽ mặc định gắn Epic này."
          >
            <Input
              placeholder="vd: SHB-100"
              style={{ textTransform: 'uppercase' }}
              addonAfter={
                <Button
                  type="link"
                  size="small"
                  icon={<ApiOutlined />}
                  loading={creatingEpic}
                  onClick={() => void handleCreateJiraEpic()}
                  style={{ padding: '0 4px', height: 'auto' }}
                >
                  Tạo Jira Epic từ Dự án
                </Button>
              }
            />
          </Form.Item>
        </div>

        <Form.Item name="notes" label="Ghi chú">
          <Input.TextArea rows={3} placeholder="Bối cảnh dự án, mục tiêu..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};
