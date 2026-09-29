import React, { useEffect, useRef } from 'react';
import { Modal, Form, Input, DatePicker, Select, Button, Space } from 'antd';
import { DeleteOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { Project, ProjectStatus, ReminderItem } from '../../types/models';
import { createFocusRestorer } from '../../utils/focus';
import { useRegisterActiveForm } from '../../context/FormGuardContext';
import { TagSelect } from '../common/TagSelect';
import { RemindersFormList, formatRemindersForForm, formatRemindersForSave } from '../common/RemindersFormList';

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
    opsOwners?: string[] | undefined;
    businessAnalysts?: string[] | undefined;
    documentLinks?: string[] | undefined;
    reminderDate?: string | undefined;
    reminderNote?: string | undefined;
    reminders?: ReminderItem[] | undefined;
  }) => Promise<void> | void;
  loading?: boolean | undefined;
}

interface ProjectFormValues {
  name: string;
  description?: string;
  deadline?: Dayjs | null;
  notes?: string;
  status: ProjectStatus;
  opsOwners?: string[];
  businessAnalysts?: string[];
  documentLinks?: string[];
  reminderDate?: Dayjs | null;
  reminderNote?: string;
  reminders?: unknown[];
}

const PROJECT_STATUSES: ProjectStatus[] = ['Open', 'In Progress', 'Done', 'Cancelled'];

const STATUS_LABELS: Record<ProjectStatus, string> = {
  Open: 'Mở',
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
}) => {
  useRegisterActiveForm('project-modal', open);

  const [form] = Form.useForm<ProjectFormValues>();
  const restorerRef = useRef<(() => void) | null>(null);

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
          opsOwners: project.opsOwners ?? [],
          businessAnalysts: project.businessAnalysts ?? [],
          documentLinks: project.documentLinks ?? [],
          reminders: formatRemindersForForm(project),
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          status: 'Open',
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

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const cleanedLinks = (values.documentLinks ?? [])
        .map((l) => (typeof l === 'string' ? l.trim() : ''))
        .filter((l) => l.length > 0);
      const savedReminders = formatRemindersForSave(values.reminders);
      await onSave({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
        notes: values.notes?.trim() || undefined,
        status: values.status,
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

        <Form.Item name="notes" label="Ghi chú">
          <Input.TextArea rows={3} placeholder="Bối cảnh dự án, mục tiêu..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};
