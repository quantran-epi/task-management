import React, { useEffect, useRef } from 'react';
import { Modal, Form, Input, DatePicker, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { Project, ProjectStatus } from '../../types/models';
import { createFocusRestorer } from '../../utils/focus';

export interface ProjectModalProps {
  open: boolean;
  project?: Project | null;
  onClose: () => void;
  onSave: (values: {
    name: string;
    description?: string | undefined;
    deadline?: string | undefined;
    notes?: string | undefined;
    status: ProjectStatus;
  }) => Promise<void> | void;
  loading?: boolean;
}

interface ProjectFormValues {
  name: string;
  description?: string;
  deadline?: Dayjs | null;
  notes?: string;
  status: ProjectStatus;
}

const PROJECT_STATUSES: ProjectStatus[] = ['Open', 'In Progress', 'Done', 'Cancelled'];

export const ProjectModal: React.FC<ProjectModalProps> = ({
  open,
  project,
  onClose,
  onSave,
  loading = false,
}) => {
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
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ status: 'Open' });
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
      });
      handleClose();
    } catch {
      // Form validation error
    }
  };

  return (
    <Modal
      title={project ? 'Edit Project' : 'New Project'}
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={loading}
      okText={project ? 'Save Project' : 'Save Project'}
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
          label="Project Name"
          rules={[
            { required: true, message: 'Please enter a valid project name (1-120 characters).' },
            { max: 120, message: 'Name cannot exceed 120 characters.' },
          ]}
        >
          <Input placeholder="e.g. Website Redesign" autoFocus />
        </Form.Item>

        <Form.Item name="description" label="Description">
          <Input placeholder="Short summary of project scope" />
        </Form.Item>

        <div style={{ display: 'flex', gap: 16 }}>
          <Form.Item name="status" label="Status" style={{ flex: 1 }}>
            <Select options={PROJECT_STATUSES.map((s) => ({ label: s, value: s }))} />
          </Form.Item>

          <Form.Item name="deadline" label="Target Deadline" style={{ flex: 1 }}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </div>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={3} placeholder="Project context, background, or goals..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};
