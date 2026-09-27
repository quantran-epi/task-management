import React, { useEffect, useRef } from 'react';
import { Modal, Form, Input, DatePicker, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { Milestone, MilestoneStatus } from '../../types/models';
import { createFocusRestorer } from '../../utils/focus';
import { useRegisterActiveForm } from '../../context/FormGuardContext';

export interface MilestoneModalProps {
  open: boolean;
  projectId: string;
  milestone?: Milestone | null;
  onClose: () => void;
  onSave: (values: {
    projectId: string;
    name: string;
    description?: string | undefined;
    deadline?: string | undefined;
    status: MilestoneStatus;
  }) => Promise<void> | void;
  loading?: boolean;
}

interface MilestoneFormValues {
  name: string;
  description?: string;
  deadline?: Dayjs | null;
  status: MilestoneStatus;
}

const MILESTONE_STATUSES: MilestoneStatus[] = ['Open', 'In Progress', 'Done', 'Cancelled'];

const STATUS_LABELS: Record<MilestoneStatus, string> = {
  Open: 'Mở',
  'In Progress': 'Đang làm',
  Done: 'Hoàn thành',
  Cancelled: 'Đã hủy',
};

export const MilestoneModal: React.FC<MilestoneModalProps> = ({
  open,
  projectId,
  milestone,
  onClose,
  onSave,
  loading = false,
}) => {
  useRegisterActiveForm('milestone-modal', open);

  const [form] = Form.useForm<MilestoneFormValues>();
  const restorerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (open) {
      restorerRef.current = createFocusRestorer();
      if (milestone) {
        form.setFieldsValue({
          name: milestone.name,
          description: milestone.description || '',
          deadline: milestone.deadline ? dayjs(milestone.deadline, 'YYYY-MM-DD') : null,
          status: milestone.status,
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ status: 'Open' });
      }
    }
  }, [open, milestone, form]);

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
        projectId,
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
        status: values.status,
      });
      handleClose();
    } catch {
      // Form validation error
    }
  };

  return (
    <Modal
      title={milestone ? 'Sửa cột mốc' : 'Cột mốc mới'}
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={loading}
      okText={milestone ? 'Lưu thay đổi' : 'Tạo cột mốc'}
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
          label="Tên cột mốc"
          rules={[
            { required: true, message: 'Vui lòng nhập tên cột mốc hợp lệ (1-120 ký tự).' },
            { max: 120, message: 'Tên không được vượt quá 120 ký tự.' },
          ]}
        >
          <Input placeholder="vd: Giai đoạn 1 MVP" autoFocus />
        </Form.Item>

        <Form.Item name="description" label="Mô tả">
          <Input placeholder="Phạm vi đạt được trong cột mốc này" />
        </Form.Item>

        <div style={{ display: 'flex', gap: 16 }}>
          <Form.Item name="status" label="Trạng thái" style={{ flex: 1 }}>
            <Select options={MILESTONE_STATUSES.map((s) => ({ label: STATUS_LABELS[s] || s, value: s }))} />
          </Form.Item>

          <Form.Item name="deadline" label="Hạn chót mục tiêu" style={{ flex: 1 }}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
};
