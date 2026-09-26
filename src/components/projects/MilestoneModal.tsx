import React, { useEffect, useRef } from 'react';
import { Modal, Form, Input, DatePicker, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { Milestone, MilestoneStatus } from '../../types/models';
import { createFocusRestorer } from '../../utils/focus';

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

export const MilestoneModal: React.FC<MilestoneModalProps> = ({
  open,
  projectId,
  milestone,
  onClose,
  onSave,
  loading = false,
}) => {
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
      title={milestone ? 'Edit Milestone' : 'New Milestone'}
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={loading}
      okText={milestone ? 'Save Milestone' : 'Save Milestone'}
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
          label="Milestone Name"
          rules={[
            { required: true, message: 'Please enter a valid milestone name (1-120 characters).' },
            { max: 120, message: 'Name cannot exceed 120 characters.' },
          ]}
        >
          <Input placeholder="e.g. Phase 1 MVP" autoFocus />
        </Form.Item>

        <Form.Item name="description" label="Description">
          <Input placeholder="Scope delivered in this milestone" />
        </Form.Item>

        <div style={{ display: 'flex', gap: 16 }}>
          <Form.Item name="status" label="Status" style={{ flex: 1 }}>
            <Select options={MILESTONE_STATUSES.map((s) => ({ label: s, value: s }))} />
          </Form.Item>

          <Form.Item name="deadline" label="Target Deadline" style={{ flex: 1 }}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
};
