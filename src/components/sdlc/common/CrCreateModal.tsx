import React from 'react';
import { Modal, Form, Input, DatePicker, Checkbox, message } from 'antd';
import dayjs from 'dayjs';
import type { TaskPlannerDatabase } from '../../../db';
import { db as defaultDb } from '../../../db';
import { createChangeRequest } from '../../../db/repositories/changeRequestRepo';
import type { ChangeRequest, CrTarget } from '../../../types/models';

export interface CrCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCrCreated?: (cr: ChangeRequest) => void;
  /** Subsystem the modal was opened from; becomes the CR's single target. */
  initialTargets?: readonly CrTarget[] | undefined;
  db?: TaskPlannerDatabase;
}

export const CrCreateModal: React.FC<CrCreateModalProps> = ({
  open,
  onClose,
  onCrCreated,
  initialTargets,
  db = defaultDb,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const cr = await createChangeRequest(
        {
          code: values.cr.trim(),
          name: values.featureName.trim(),
          type: 'ENHANCEMENT',
          status: 'Open',
          targets: [...(initialTargets ?? [])],
          // The CR model has no author/requestingUnit/date columns; keep the values the
          // user typed rather than discarding them at the trust boundary.
          description: [
            `Người lập: ${values.author.trim()}`,
            `Đơn vị yêu cầu: ${values.requestingUnit.trim()}`,
            `Ngày lập: ${values.date.format('YYYY-MM-DD')}`,
          ].join('\n'),
        },
        db
      );

      message.success('Đã tạo CR mới thành công');
      form.resetFields();
      onClose();
      onCrCreated?.(cr);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        // Validation errors handled by Ant Form UI
        return;
      }
      message.error('Lỗi khi tạo CR: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Tạo Change Request (CR) mới"
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Tạo CR"
      cancelText="Hủy"
      confirmLoading={loading}
      destroyOnClose
      data-testid="cr-create-modal"
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          date: dayjs(),
          inheritContext: true,
        }}
      >
        <Form.Item
          name="cr"
          label="Mã CR"
          rules={[{ required: true, message: 'Vui lòng nhập mã CR' }]}
        >
          <Input placeholder="Ví dụ: CR-2026-001" data-testid="cr-input-code" />
        </Form.Item>
        <Form.Item
          name="featureName"
          label="Tên tính năng"
          rules={[{ required: true, message: 'Vui lòng nhập tên tính năng' }]}
        >
          <Input placeholder="Ví dụ: Nâng cấp luồng chuyển tiền Napas 247" data-testid="cr-input-feature" />
        </Form.Item>
        <Form.Item
          name="author"
          label="Người lập"
          rules={[{ required: true, message: 'Vui lòng nhập tên người lập' }]}
        >
          <Input placeholder="Ví dụ: Nguyễn Văn A" data-testid="cr-input-author" />
        </Form.Item>
        <Form.Item
          name="requestingUnit"
          label="Đơn vị yêu cầu"
          rules={[{ required: true, message: 'Vui lòng nhập đơn vị yêu cầu' }]}
        >
          <Input placeholder="Ví dụ: Khối Ngân hàng số" data-testid="cr-input-unit" />
        </Form.Item>
        <Form.Item
          name="date"
          label="Ngày lập"
          rules={[{ required: true, message: 'Vui lòng chọn ngày lập' }]}
        >
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" data-testid="cr-input-date" />
        </Form.Item>
        <Form.Item name="inheritContext" valuePropName="checked">
          <Checkbox data-testid="cr-input-inherit">Kế thừa tri thức từ CR trước</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
};
