import React, { useEffect, useRef } from 'react';
import { Modal, Form, Input, DatePicker, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { Project, ProjectStatus } from '../../types/models';
import { createFocusRestorer } from '../../utils/focus';
import { useRegisterActiveForm } from '../../context/FormGuardContext';
import { TagSelect } from '../common/TagSelect';

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
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ status: 'Open', opsOwners: [], businessAnalysts: [] });
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
      await onSave({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
        notes: values.notes?.trim() || undefined,
        status: values.status,
        opsOwners: (values.opsOwners ?? []).length > 0 ? values.opsOwners : undefined,
        businessAnalysts:
          (values.businessAnalysts ?? []).length > 0 ? values.businessAnalysts : undefined,
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

        <Form.Item name="notes" label="Ghi chú">
          <Input.TextArea rows={3} placeholder="Bối cảnh dự án, mục tiêu..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};
