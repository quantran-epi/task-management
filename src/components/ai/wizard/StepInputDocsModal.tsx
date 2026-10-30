import React, { useEffect, useState } from 'react';
import { Button, DatePicker, Form, Input, Modal, Select, Space, Typography, theme } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import type { SdlcWorkflowMetadata } from '../../../services/wizard/workflowSchemas';
import { db } from '../../../db';
import type { Note } from '../../../types/models';

dayjs.extend(customParseFormat);

const { TextArea } = Input;
const { Text } = Typography;

export interface StepInputDocsModalProps {
  open: boolean;
  project: { id: string; name: string; code?: string | undefined };
  currentUser?: string | undefined;
  today?: string | undefined;
  initialValues?: {
    metadata?: SdlcWorkflowMetadata | undefined;
    pl01?: string | undefined;
    pl02?: string | undefined;
  } | undefined;
  onSubmit: (metadata: SdlcWorkflowMetadata, pl01: string, pl02: string) => void | Promise<void>;
  onClose: () => void;
}

interface FormValues extends Omit<SdlcWorkflowMetadata, 'date'> {
  date: Dayjs;
  pl01Content: string;
  pl02Content: string;
}

export const StepInputDocsModal: React.FC<StepInputDocsModalProps> = ({
  open,
  project,
  currentUser = 'Developer',
  today,
  initialValues,
  onSubmit,
  onClose,
}) => {
  const { token } = theme.useToken();
  const [form] = Form.useForm<FormValues>();
  const [projectNotes, setProjectNotes] = useState<Array<{ id: string; title: string; body: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Tải danh sách note có sẵn trong project để dev chọn nhanh
    void db.notes.where('entityId').equals(project.id).toArray().then((notes: Note[]) => {
      setProjectNotes(notes.map((n: Note) => ({ id: n.id, title: n.title || 'Untitled Note', body: n.body })));
    });

    form.setFieldsValue({
      cr: initialValues?.metadata?.cr ?? project.code ?? project.name,
      featureName: initialValues?.metadata?.featureName ?? project.name,
      requestingUnit: initialValues?.metadata?.requestingUnit ?? 'Trung tâm Phát triển Phần mềm',
      author: initialValues?.metadata?.author ?? currentUser,
      date: dayjs(initialValues?.metadata?.date ?? today ?? undefined),
      pl01Content: initialValues?.pl01 ?? '',
      pl02Content: initialValues?.pl02 ?? '',
    });
  }, [currentUser, form, initialValues, open, project.code, project.id, project.name, today]);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      const metadata: SdlcWorkflowMetadata = {
        cr: values.cr.trim(),
        featureName: values.featureName.trim(),
        requestingUnit: values.requestingUnit?.trim() || '(chưa cung cấp)',
        author: values.author?.trim() || currentUser,
        date: values.date.format('YYYY-MM-DD'),
      };
      await onSubmit(metadata, values.pl01Content.trim(), values.pl02Content.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleSelectNoteForPl01 = (noteId: string) => {
    const note = projectNotes.find((n) => n.id === noteId);
    if (note) form.setFieldValue('pl01Content', note.body);
  };

  const handleSelectNoteForPl02 = (noteId: string) => {
    const note = projectNotes.find((n) => n.id === noteId);
    if (note) form.setFieldValue('pl02Content', note.body);
  };

  return (
    <Modal
      open={open}
      title={
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Nạp Hồ sơ Đầu vào (PL01 & PL02)</span>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Cung cấp Yêu cầu nghiệp vụ (PL01) và Đặc tả chức năng (PL02) để AI phân tích và đề xuất SOLUTION.md
          </Text>
        </div>
      }
      onCancel={onClose}
      width={720}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={loading}>
          Hủy bỏ
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit} loading={loading}>
          Bắt đầu Phân tích Solution
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Space direction="horizontal" style={{ width: '100%' }} size={16}>
          <Form.Item
            name="cr"
            label="Mã CR / Dự án"
            rules={[{ required: true, message: 'Nhập mã CR/Dự án' }]}
            style={{ width: 220 }}
          >
            <Input placeholder="CR-001 / TaskMate" />
          </Form.Item>
          <Form.Item
            name="featureName"
            label="Tên Tính năng"
            rules={[{ required: true, message: 'Nhập tên tính năng' }]}
            style={{ flex: 1 }}
          >
            <Input placeholder="Tên tính năng SDLC" />
          </Form.Item>
          <Form.Item name="date" label="Ngày lập" rules={[{ required: true, message: 'Chọn ngày' }]}>
            <DatePicker format="YYYY-MM-DD" style={{ width: 140 }} />
          </Form.Item>
        </Space>

        <Space direction="horizontal" style={{ width: '100%' }} size={16}>
          <Form.Item name="author" label="Người lập" style={{ flex: 1 }}>
            <Input placeholder="Họ và tên" />
          </Form.Item>
          <Form.Item name="requestingUnit" label="Đơn vị yêu cầu" style={{ flex: 1 }}>
            <Input placeholder="Phòng ban / Đơn vị" />
          </Form.Item>
        </Space>

        {/* Khung nhập PL01 */}
        <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 12, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong>1. Tài liệu Yêu cầu Nghiệp vụ (PL01)</Text>
            {projectNotes.length > 0 && (
              <Select
                placeholder="Chọn từ Note của Dự án..."
                style={{ width: 260 }}
                allowClear
                onChange={handleSelectNoteForPl01}
                options={projectNotes.map((n) => ({ label: n.title, value: n.id }))}
              />
            )}
          </div>
          <Form.Item
            name="pl01Content"
            rules={[{ required: true, message: 'Vui lòng dán hoặc chọn nội dung PL01' }]}
          >
            <TextArea
              rows={4}
              placeholder="Dán nội dung Yêu cầu nghiệp vụ PL01 tại đây..."
              showCount
            />
          </Form.Item>
        </div>

        {/* Khung nhập PL02 */}
        <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 12, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong>2. Tài liệu Đặc tả Chức năng (PL02)</Text>
            {projectNotes.length > 0 && (
              <Select
                placeholder="Chọn từ Note của Dự án..."
                style={{ width: 260 }}
                allowClear
                onChange={handleSelectNoteForPl02}
                options={projectNotes.map((n) => ({ label: n.title, value: n.id }))}
              />
            )}
          </div>
          <Form.Item
            name="pl02Content"
            rules={[{ required: true, message: 'Vui lòng dán hoặc chọn nội dung PL02' }]}
          >
            <TextArea
              rows={5}
              placeholder="Dán nội dung Đặc tả chức năng PL02 tại đây..."
              showCount
            />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
};
