import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  DatePicker,
  Select,
  Button,
  Space,
  Radio,
  Tag,
  message,
} from 'antd';
import {
  DeleteOutlined,
  LinkOutlined,
  PlusOutlined,
  ApiOutlined,
  FolderOpenOutlined,
  ExportOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  BugOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { ChangeRequest, CrTarget, CrType, CrStatus } from '../../types/models';
import { openDocumentLink, browseLocalFolder } from '../../utils/documentLinks';
import { createFocusRestorer } from '../../utils/focus';
import { useRegisterActiveForm } from '../../context/FormGuardContext';
import { TagSelect } from '../common/TagSelect';
import { RemindersFormList, formatRemindersForForm, formatRemindersForSave } from '../common/RemindersFormList';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { JiraConfig, JiraCreateIssuePayload } from '../../services/jira/types';
import { createJiraIssue } from '../../services/jira/jiraApi';
import { textToAdf } from '../../services/jira/adf';
import { getJiraApiToken } from '../../services/jiraTokenService';
import { TargetSystemsSelector } from './TargetSystemsSelector';
import type { ChangeRequestInput, ChangeRequestUpdate } from '../../validation/schemas';

export interface ChangeRequestModalProps {
  open: boolean;
  changeRequest?: ChangeRequest | null;
  onClose: () => void;
  onSave: (values: ChangeRequestInput | ChangeRequestUpdate) => Promise<void> | void;
  loading?: boolean;
  db?: TaskPlannerDatabase;
  /** D-34: subsystems pre-filled by the caller (e.g. "Tạo CR" from a subsystem). Soft lock. */
  initialTargets?: CrTarget[];
  /** Pre-loaded system list so preselected codes render on first paint, not as raw ids. */
  systems?: import('../../types/models').System[] | undefined;
}

interface ChangeRequestFormValues {
  name: string;
  code?: string;
  type: CrType;
  targets: string[];
  status: CrStatus;
  description?: string;
  deadline?: Dayjs | null;
  jiraEpicKey?: string;
  opsOwners?: string[];
  businessAnalysts?: string[];
  documentLinks?: string[];
  reminders?: unknown[];
}

const CR_STATUSES: CrStatus[] = ['Open', 'Pending', 'In Progress', 'Done', 'Cancelled'];

const STATUS_LABELS: Record<CrStatus, string> = {
  Open: 'Mở',
  Pending: 'Chờ xử lý',
  'In Progress': 'Đang làm',
  Done: 'Hoàn thành',
  Cancelled: 'Đã hủy',
};

export const ChangeRequestModal: React.FC<ChangeRequestModalProps> = ({
  open,
  changeRequest,
  onClose,
  onSave,
  loading = false,
  db = defaultDb,
  initialTargets,
  systems,
}) => {
  useRegisterActiveForm('change-request-modal', open);

  const [form] = Form.useForm<ChangeRequestFormValues>();
  const restorerRef = useRef<(() => void) | null>(null);
  const [creatingEpic, setCreatingEpic] = useState(false);

  // Stable key so an inline `initialTargets={[...]}` literal does not re-seed every render.
  const initialTargetIds = (initialTargets ?? []).map((t) => t.systemId);
  const initialTargetsKey = initialTargetIds.join(',');

  useEffect(() => {
    if (open) {
      restorerRef.current = createFocusRestorer();
      if (changeRequest) {
        form.setFieldsValue({
          name: changeRequest.name,
          code: changeRequest.code || '',
          type: changeRequest.type || 'ENHANCEMENT',
          targets: (changeRequest.targets ?? []).map((t) => t.systemId),
          status: changeRequest.status,
          description: changeRequest.description || '',
          deadline: changeRequest.deadline ? dayjs(changeRequest.deadline, 'YYYY-MM-DD') : null,
          jiraEpicKey: changeRequest.jiraEpicKey || '',
          opsOwners: changeRequest.opsOwners ?? [],
          businessAnalysts: changeRequest.businessAnalysts ?? [],
          documentLinks: changeRequest.documentLinks ?? [],
          reminders: formatRemindersForForm(changeRequest),
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          name: '',
          code: '',
          type: 'ENHANCEMENT',
          targets: initialTargetsKey ? initialTargetsKey.split(',') : [],
          status: 'Open',
          description: '',
          jiraEpicKey: '',
          opsOwners: [],
          businessAnalysts: [],
          documentLinks: [],
          reminders: [],
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, changeRequest, form, initialTargetsKey]);

  const handleClose = () => {
    onClose();
    if (restorerRef.current) {
      restorerRef.current();
    }
  };

  const handleCreateJiraEpic = async () => {
    const crName = form.getFieldValue('name')?.trim();
    if (!crName) {
      message.error('Vui lòng nhập tên Change Request trước khi tạo Jira Epic.');
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
          summary: crName,
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

      const payload = {
        name: values.name.trim(),
        code: values.code?.trim().toUpperCase() || undefined,
        type: values.type,
        // D-25: `featureBranch` default is applied by the CR repo, never here.
        targets: (values.targets ?? []).map((systemId) => ({ systemId })),
        status: values.status,
        description: values.description?.trim() || undefined,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
        jiraEpicKey: epicKeyTrimmed || undefined,
        opsOwners: (values.opsOwners ?? []).length > 0 ? values.opsOwners : undefined,
        businessAnalysts:
          (values.businessAnalysts ?? []).length > 0 ? values.businessAnalysts : undefined,
        documentLinks: cleanedLinks.length > 0 ? cleanedLinks : undefined,
        reminders: savedReminders ?? [],
        reminderDate: savedReminders?.[0]?.date,
        reminderNote: savedReminders?.[0]?.note,
      };

      await onSave(payload);
      handleClose();
    } catch (err) {
      // Ant Design validation errors carry `errorFields` and are already rendered inline.
      if (err instanceof Error && !('errorFields' in err)) {
        message.error(err.message);
      }
    }
  };

  return (
    <Modal
      title={changeRequest ? 'Sửa Change Request' : 'Change Request mới'}
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={loading}
      okText={changeRequest ? 'Lưu thay đổi' : 'Tạo Change Request'}
      cancelText="Hủy"
      width={680}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ status: 'Open', type: 'ENHANCEMENT' }}
        style={{ marginTop: 16 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <Form.Item
            name="name"
            label="Tên Change Request"
            rules={[
              { required: true, message: 'Vui lòng nhập tên Change Request hợp lệ (1-120 ký tự).' },
              { max: 120, message: 'Tên không được vượt quá 120 ký tự.' },
            ]}
          >
            <Input placeholder="vd: Tích hợp xác thực SmartCard và hoàn tiền tự động" autoFocus />
          </Form.Item>

          <Form.Item
            name="code"
            label="Mã CR"
            rules={[
              { required: true, message: 'Vui lòng nhập Mã CR.' },
              { max: 64, message: 'Mã CR tối đa 64 ký tự.' },
            ]}
          >
            <Input placeholder="vd: CR-2026-001" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
        </div>

        {/* 3 Explicit CR Types */}
        <Form.Item
          name="type"
          label="Loại Change Request (CR Type)"
          rules={[{ required: true, message: 'Vui lòng chọn loại Change Request.' }]}
        >
          <Radio.Group style={{ width: '100%', display: 'flex', gap: 12 }}>
            <Radio.Button value="NEW_FEATURE" style={{ flex: 1, textAlign: 'center', height: 'auto', padding: '6px 8px' }}>
              <div style={{ fontWeight: 600 }}>
                <ThunderboltOutlined style={{ color: '#1677ff', marginRight: 6 }} />
                Tạo mới tính năng
              </div>
              <Tag color="#1677ff" style={{ marginTop: 4, marginRight: 0, fontSize: 11 }}>
                New Feature
              </Tag>
            </Radio.Button>

            <Radio.Button value="ENHANCEMENT" style={{ flex: 1, textAlign: 'center', height: 'auto', padding: '6px 8px' }}>
              <div style={{ fontWeight: 600 }}>
                <ToolOutlined style={{ color: '#52c41a', marginRight: 6 }} />
                Nâng cấp / Cập nhật
              </div>
              <Tag color="#52c41a" style={{ marginTop: 4, marginRight: 0, fontSize: 11 }}>
                Enhancement
              </Tag>
            </Radio.Button>

            <Radio.Button value="BUGFIX" style={{ flex: 1, textAlign: 'center', height: 'auto', padding: '6px 8px' }}>
              <div style={{ fontWeight: 600 }}>
                <BugOutlined style={{ color: '#faad14', marginRight: 6 }} />
                Sửa lỗi
              </div>
              <Tag color="#faad14" style={{ marginTop: 4, marginRight: 0, fontSize: 11 }}>
                Bugfix
              </Tag>
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        {/* Multi-System Target Selector */}
        <Form.Item
          name="targets"
          label="Các subsystem chịu ảnh hưởng (Target Subsystems)"
          rules={[
            {
              required: true,
              type: 'array',
              min: 1,
              message: 'Vui lòng chọn ít nhất 1 subsystem chịu ảnh hưởng.',
            },
          ]}
          extra="Chọn các dịch vụ, database schema hoặc worker job trong Enterprise Catalog sẽ thay đổi mã nguồn trong đợt CR này."
        >
          <TargetSystemsSelector db={db} preselectedIds={initialTargetIds} systems={systems} />
        </Form.Item>

        <Form.Item name="description" label="Mô tả phạm vi thay đổi">
          <Input.TextArea rows={2} placeholder="Tóm tắt yêu cầu kinh doanh, phạm vi ảnh hưởng, và mục tiêu..." />
        </Form.Item>

        <div style={{ display: 'flex', gap: 16 }}>
          <Form.Item name="status" label="Trạng thái" style={{ flex: 1 }}>
            <Select options={CR_STATUSES.map((s) => ({ label: STATUS_LABELS[s] || s, value: s }))} />
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

        {/* Reminders */}
        <RemindersFormList />

        {/* Document Links */}
        <Form.Item label="Tài liệu liên kết">
          <Form.List name="documentLinks">
            {(fields, { add, remove }) => (
              <Space direction="vertical" style={{ width: '100%' }}>
                {fields.map((field) => (
                  <div key={field.key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
                        style={{ flex: 1, minWidth: 0 }}
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      icon={<FolderOpenOutlined />}
                      title="Duyệt thư mục trên máy"
                      aria-label="Duyệt thư mục"
                      onClick={async () => {
                        const picked = await browseLocalFolder();
                        if (picked) {
                          form.setFieldValue(['documentLinks', field.name], picked);
                        }
                      }}
                    />
                    <Button
                      type="text"
                      icon={<ExportOutlined />}
                      title="Mở liên kết"
                      aria-label="Mở liên kết"
                      onClick={() => {
                        const val = form.getFieldValue(['documentLinks', field.name]);
                        if (val) {
                          void openDocumentLink(val);
                        }
                      }}
                    />
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                      aria-label="Xóa liên kết"
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    type="dashed"
                    onClick={() => add('')}
                    icon={<PlusOutlined />}
                    style={{ flex: 1 }}
                  >
                    Thêm liên kết
                  </Button>
                  <Button
                    type="default"
                    icon={<FolderOpenOutlined />}
                    onClick={async () => {
                      const picked = await browseLocalFolder();
                      if (picked) {
                        add(picked);
                      }
                    }}
                  >
                    Chọn thư mục từ máy
                  </Button>
                </div>
              </Space>
            )}
          </Form.List>
        </Form.Item>

        {/* Jira Epic Mapping */}
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
            extra="Liên kết Change Request với một Jira Epic. Các tác vụ con khi tạo Jira Issue sẽ mặc định gắn Epic này."
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
                  Tạo Jira Epic từ CR
                </Button>
              }
            />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
};
