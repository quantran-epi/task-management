import React, { useState } from 'react';
import { Form, Input, Button, DatePicker, Space, Typography, theme, Modal, List, message } from 'antd';
import { FileTextOutlined, ArrowRightOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import type { SdlcWorkflowMetadata } from '../../../services/wizard/workflowSchemas';
import type { Note } from '../../../types/models';
import dayjs from 'dayjs';

export interface Step1IntakeViewProps {
  projectId: string;
  initialMetadata?: Partial<SdlcWorkflowMetadata>;
  initialPl01?: string;
  initialPl02?: string;
  onStartIntake: (
    metadata: SdlcWorkflowMetadata,
    pl01Content: string,
    pl02Content: string
  ) => Promise<void>;
  db?: TaskPlannerDatabase;
}

export const Step1IntakeView: React.FC<Step1IntakeViewProps> = ({
  projectId,
  initialMetadata,
  initialPl01 = '',
  initialPl02 = '',
  onStartIntake,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Note picker state
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const [noteTargetField, setNoteTargetField] = useState<'pl01' | 'pl02'>('pl01');

  // Load project notes for picker
  const notes = useLiveQuery(
    () => db.notes.where('entityId').equals(projectId).toArray(),
    [projectId, db]
  ) ?? [];

  const handleOpenNotePicker = (field: 'pl01' | 'pl02') => {
    setNoteTargetField(field);
    setNotePickerOpen(true);
  };

  const handleSelectNote = (note: Note) => {
    const text = note.content ?? '';
    if (noteTargetField === 'pl01') {
      form.setFieldsValue({ pl01: text });
    } else {
      form.setFieldsValue({ pl02: text });
    }
    setNotePickerOpen(false);
    message.success(`Đã lấy nội dung từ ghi chú "${note.title || 'Không tiêu đề'}"`);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const metadata: SdlcWorkflowMetadata = {
        cr: values.cr.trim(),
        featureName: values.featureName.trim(),
        author: values.author?.trim() || '(chưa cung cấp)',
        requestingUnit: values.requestingUnit?.trim() || '(chưa cung cấp)',
        date: values.date ? values.date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      };
      await onStartIntake(metadata, values.pl01.trim(), values.pl02.trim());
    } catch {
      // Form validation error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Bước 1: Nạp hồ sơ yêu cầu đầu vào (PL01 & PL02)
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
          Cung cấp thông tin nghiệp vụ và đặc tả tính năng để AI phân tích kiến trúc giải pháp SOLUTION.md.
        </Typography.Paragraph>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          cr: initialMetadata?.cr || '',
          featureName: initialMetadata?.featureName || '',
          author: initialMetadata?.author || '',
          requestingUnit: initialMetadata?.requestingUnit || '',
          date: initialMetadata?.date ? dayjs(initialMetadata.date) : dayjs(),
          pl01: initialPl01,
          pl02: initialPl02,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Form.Item
            name="cr"
            label="Mã Change Request (CR)"
            rules={[{ required: true, message: 'Vui lòng nhập mã CR' }]}
          >
            <Input placeholder="Mã CR (ví dụ: CR-2026-001)" />
          </Form.Item>

          <Form.Item
            name="featureName"
            label="Tên tính năng"
            rules={[{ required: true, message: 'Vui lòng nhập tên tính năng' }]}
          >
            <Input placeholder="Tên tính năng (ví dụ: Nâng cấp chuyển tiền Napas)" />
          </Form.Item>

          <Form.Item name="author" label="Người lập">
            <Input placeholder="Người lập (ví dụ: Nguyễn Văn A)" />
          </Form.Item>

          <Form.Item name="requestingUnit" label="Đơn vị yêu cầu">
            <Input placeholder="Đơn vị yêu cầu (ví dụ: Khối Ngân hàng số)" />
          </Form.Item>

          <Form.Item name="date" label="Ngày lập">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </div>

        {/* PL01 Input */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Typography.Text strong>Yêu cầu nghiệp vụ (PL01)</Typography.Text>
            <Button
              size="small"
              icon={<FolderOpenOutlined />}
              onClick={() => handleOpenNotePicker('pl01')}
            >
              Chọn từ Notes
            </Button>
          </div>
          <Form.Item
            name="pl01"
            rules={[{ required: true, message: 'Vui lòng nhập hoặc chọn tài liệu PL01' }]}
          >
            <Input.TextArea
              rows={6}
              placeholder="Nội dung Yêu cầu nghiệp vụ (PL01)..."
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>
        </div>

        {/* PL02 Input */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Typography.Text strong>Đặc tả chức năng (PL02)</Typography.Text>
            <Button
              size="small"
              icon={<FolderOpenOutlined />}
              onClick={() => handleOpenNotePicker('pl02')}
            >
              Chọn từ Notes
            </Button>
          </div>
          <Form.Item
            name="pl02"
            rules={[{ required: true, message: 'Vui lòng nhập hoặc chọn tài liệu PL02' }]}
          >
            <Input.TextArea
              rows={6}
              placeholder="Nội dung Đặc tả chức năng (PL02)..."
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button
            type="primary"
            size="large"
            icon={<ArrowRightOutlined />}
            loading={submitting}
            onClick={handleSubmit}
          >
            Bắt đầu phân tích Solution
          </Button>
        </div>
      </Form>

      {/* Note Picker Modal */}
      <Modal
        title={`Chọn ghi chú nạp vào ${noteTargetField === 'pl01' ? 'PL01' : 'PL02'}`}
        open={notePickerOpen}
        onCancel={() => setNotePickerOpen(false)}
        footer={null}
        destroyOnClose
      >
        <List
          dataSource={notes}
          locale={{ emptyText: 'Dự án này chưa có ghi chú nào' }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="select" type="link" onClick={() => handleSelectNote(item)}>
                  Chọn
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={<FileTextOutlined style={{ fontSize: 20, color: token.colorPrimary }} />}
                title={item.title || 'Ghi chú không tiêu đề'}
                description={
                  <div style={{ maxHeight: 40, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.content || '(trống)'}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
};
