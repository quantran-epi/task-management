import React, { useEffect, useRef } from 'react';
import { Modal, Form, Input, DatePicker, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { Milestone, MilestoneStatus, Project } from '../../types/models';
import { createFocusRestorer } from '../../utils/focus';
import { useRegisterActiveForm } from '../../context/FormGuardContext';
import { TagSelect } from '../common/TagSelect';
import { resolveInheritedTags } from '../../domain/inheritance';

export interface MilestoneModalProps {
  open: boolean;
  projectId: string;
  project?: Project | null | undefined;
  milestone?: Milestone | null | undefined;
  onClose: () => void;
  onSave: (values: {
    projectId: string;
    name: string;
    description?: string | undefined;
    deadline?: string | undefined;
    status: MilestoneStatus;
    opsOwners?: string[] | undefined;
    businessAnalysts?: string[] | undefined;
    reminderDate?: string | undefined;
    reminderNote?: string | undefined;
  }) => Promise<void> | void;
  loading?: boolean | undefined;
}

interface MilestoneFormValues {
  name: string;
  description?: string;
  deadline?: Dayjs | null;
  status: MilestoneStatus;
  opsOwners?: string[];
  businessAnalysts?: string[];
  reminderDate?: Dayjs | null;
  reminderNote?: string;
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
  project,
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
          opsOwners: milestone.opsOwners ?? [],
          businessAnalysts: milestone.businessAnalysts ?? [],
          reminderDate: milestone.reminderDate ? dayjs(milestone.reminderDate, 'YYYY-MM-DD') : null,
          reminderNote: milestone.reminderNote || '',
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          status: 'Open',
          opsOwners: [],
          businessAnalysts: [],
          reminderDate: null,
          reminderNote: '',
        });
      }
    }
  }, [open, milestone, form]);

  const inheritedOps = resolveInheritedTags('opsOwners', {}, {
    project: project ? { name: project.name, opsOwners: project.opsOwners } : undefined,
  });

  const inheritedBA = resolveInheritedTags('businessAnalysts', {}, {
    project: project ? { name: project.name, businessAnalysts: project.businessAnalysts } : undefined,
  });

  const opsInheritedText =
    inheritedOps.source !== 'none' && inheritedOps.tags.length > 0
      ? `Kế thừa: [${inheritedOps.tags.join(', ')}] (từ Dự án)`
      : undefined;

  const baInheritedText =
    inheritedBA.source !== 'none' && inheritedBA.tags.length > 0
      ? `Kế thừa: [${inheritedBA.tags.join(', ')}] (từ Dự án)`
      : undefined;

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
        opsOwners: (values.opsOwners ?? []).length > 0 ? values.opsOwners : undefined,
        businessAnalysts:
          (values.businessAnalysts ?? []).length > 0 ? values.businessAnalysts : undefined,
        reminderDate: values.reminderDate ? values.reminderDate.format('YYYY-MM-DD') : undefined,
        reminderNote: values.reminderNote?.trim() || undefined,
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Form.Item name="opsOwners" label="Ops Owner">
            <TagSelect
              field="opsOwners"
              inheritedText={opsInheritedText}
            />
          </Form.Item>

          <Form.Item name="businessAnalysts" label="Business Analyst">
            <TagSelect
              field="businessAnalysts"
              inheritedText={baInheritedText}
            />
          </Form.Item>
        </div>

        {/* Reminder (D-08) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Form.Item name="reminderDate" label="Ngày nhắc nhở">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="Chọn ngày nhắc nhở" allowClear />
          </Form.Item>

          <Form.Item name="reminderNote" label="Ghi chú nhắc nhở">
            <Input placeholder="Nhập nội dung cần lưu ý khi đến hạn..." maxLength={500} allowClear />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
};
