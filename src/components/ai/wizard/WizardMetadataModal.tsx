import React, { useEffect } from 'react';
import { Button, DatePicker, Form, Input, Modal, theme } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { z } from 'zod';
import type { WizardSkill } from '../../../services/ai/wizardSchemas';

dayjs.extend(customParseFormat);

const WizardStartMetadataSchema = z.strictObject({
  cr: z.string().trim().min(1),
  featureName: z.string().trim().min(1),
  requestingUnit: z.string().trim().max(200),
  author: z.string().trim().max(200),
  date: z.iso.date(),
});

export type WizardStartMetadata = z.infer<typeof WizardStartMetadataSchema>;

type FormValues = Omit<WizardStartMetadata, 'date'> & { date: Dayjs };

export interface WizardMetadataModalProps {
  open: boolean;
  skill: Exclude<WizardSkill, 'SOLUTION'>;
  project: { id: string; name: string; code?: string | undefined };
  currentUser?: string | undefined;
  today?: string | undefined;
  triggerRef?: React.RefObject<HTMLElement | null> | undefined;
  onStart: (metadata: WizardStartMetadata) => void;
  onClose: () => void;
}

const SKILL_SUBTITLES: Record<Exclude<WizardSkill, 'SOLUTION'>, string> = {
  PL02: 'PL02 — Tài liệu Đặc tả Chức năng',
  PL03: 'PL03 — Tài liệu Triển khai',
  PL07: 'PL07 — Checklist Review Code',
  CAB: 'CAB — Tờ trình thay đổi',
};

export const WizardMetadataModal: React.FC<WizardMetadataModalProps> = ({
  open,
  skill,
  project,
  currentUser = 'Người dùng hiện tại',
  today,
  triggerRef,
  onStart,
  onClose,
}) => {
  const { token } = theme.useToken();
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      cr: project.code ?? project.name,
      featureName: project.name,
      requestingUnit: '',
      author: currentUser,
      date: dayjs(today ?? undefined),
    });
  }, [currentUser, form, open, project.code, project.name, today]);

  const restoreFocus = () => requestAnimationFrame(() => triggerRef?.current?.focus());
  const close = () => {
    onClose();
    restoreFocus();
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      const metadata = WizardStartMetadataSchema.parse({
        cr: values.cr,
        featureName: values.featureName,
        requestingUnit: values.requestingUnit ?? '',
        author: values.author ?? '',
        date: values.date.format('YYYY-MM-DD'),
      });
      onStart(metadata);
    } catch {
      const firstError = form.getFieldsError().find((field) => field.errors.length > 0);
      if (firstError) form.getFieldInstance(firstError.name)?.focus?.();
    }
  };

  return (
    <Modal
      open={open}
      title={
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>Thông tin tài liệu</div>
          <div style={{ color: token.colorTextSecondary, fontSize: 14, fontWeight: 400, marginTop: 4 }}>
            {SKILL_SUBTITLES[skill]}
          </div>
        </div>
      }
      width={520}
      onCancel={close}
      afterClose={restoreFocus}
      destroyOnHidden
      footer={[
        <Button key="close" onClick={close}>Đóng</Button>,
        <Button key="start" type="primary" onClick={submit}>Bắt đầu soạn thảo</Button>,
      ]}
    >
      <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 16 }}>
        <Form.Item
          label="Mã dự án/CR"
          name="cr"
          rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập Mã dự án/CR.' }]}
        >
          <Input maxLength={100} autoFocus />
        </Form.Item>
        <Form.Item
          label="Tên tính năng"
          name="featureName"
          rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập Tên tính năng.' }]}
        >
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item label="Đơn vị yêu cầu" name="requestingUnit">
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item label="Người lập" name="author">
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item
          label="Ngày lập"
          name="date"
          rules={[{ required: true, message: 'Vui lòng chọn Ngày lập.' }]}
        >
          <DatePicker format="DD/MM/YYYY" allowClear={false} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
