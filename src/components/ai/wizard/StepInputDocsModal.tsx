import React, { useEffect, useState } from 'react';
import { Button, DatePicker, Form, Input, Modal, Tag, Typography, theme } from 'antd';
import { FileTextOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import type { SdlcWorkflowMetadata } from '../../../services/wizard/workflowSchemas';
import type { SdlcSourceRef } from '../../../services/wizard/sourceMerge';
import { NoteSourcePickerModal } from './NoteSourcePickerModal';

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
    pl01Sources?: SdlcSourceRef[] | undefined;
    pl02Sources?: SdlcSourceRef[] | undefined;
  } | undefined;
  onSubmit: (
    metadata: SdlcWorkflowMetadata,
    pl01: string,
    pl02: string,
    pl01Sources?: SdlcSourceRef[],
    pl02Sources?: SdlcSourceRef[]
  ) => void | Promise<void>;
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
  const [loading, setLoading] = useState(false);

  // Independent multi-source states for PL01 and PL02
  const [pl01Sources, setPl01Sources] = useState<SdlcSourceRef[]>(initialValues?.pl01Sources ?? []);
  const [pl02Sources, setPl02Sources] = useState<SdlcSourceRef[]>(initialValues?.pl02Sources ?? []);

  // Modal pickers
  const [activePickerKind, setActivePickerKind] = useState<'PL01' | 'PL02' | null>(null);

  useEffect(() => {
    if (!open) return;

    setPl01Sources(initialValues?.pl01Sources ?? []);
    setPl02Sources(initialValues?.pl02Sources ?? []);

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

      const pl01Text = values.pl01Content?.trim() || '';
      const pl02Text = values.pl02Content?.trim() || '';

      const finalPl01 = pl01Text || pl01Sources.map((s) => s.body || s.title).join('\n\n') || '(Tài liệu nguồn PL01)';
      const finalPl02 = pl02Text || pl02Sources.map((s) => s.body || s.title).join('\n\n') || '(Tài liệu nguồn PL02)';

      await onSubmit(metadata, finalPl01, finalPl02, pl01Sources, pl02Sources);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const removePl01Source = (sourceId: string) => {
    setPl01Sources((prev) => prev.filter((s) => s.id !== sourceId));
  };

  const removePl02Source = (sourceId: string) => {
    setPl02Sources((prev) => prev.filter((s) => s.id !== sourceId));
  };

  return (
    <>
      <Modal
        open={open}
        title={
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>Nạp Hồ sơ Đầu vào (PL01 & PL02)</span>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Cung cấp Yêu cầu nghiệp vụ (PL01) và Đặc tả chức năng (PL02) từ ghi chú hoặc Note để AI phân tích SOLUTION.md
            </Text>
          </div>
        }
        onCancel={onClose}
        width="min(720px, calc(100vw - 32px))"
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, width: '100%' }}>
            <Form.Item
              name="cr"
              label="Mã CR / Dự án"
              rules={[{ required: true, message: 'Nhập mã CR/Dự án' }]}
              style={{ flex: '1 1 180px' }}
            >
              <Input placeholder="CR-001 / TaskMate" />
            </Form.Item>
            <Form.Item
              name="featureName"
              label="Tên Tính năng"
              rules={[{ required: true, message: 'Nhập tên tính năng' }]}
              style={{ flex: '2 1 240px' }}
            >
              <Input placeholder="Tên tính năng SDLC" />
            </Form.Item>
            <Form.Item name="date" label="Ngày lập" rules={[{ required: true, message: 'Chọn ngày' }]} style={{ flex: '1 1 140px' }}>
              <DatePicker format="YYYY-MM-DD" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, width: '100%' }}>
            <Form.Item name="author" label="Người lập" style={{ flex: '1 1 200px' }}>
              <Input placeholder="Họ và tên" />
            </Form.Item>
            <Form.Item name="requestingUnit" label="Đơn vị yêu cầu" style={{ flex: '1 1 200px' }}>
              <Input placeholder="Phòng ban / Đơn vị" />
            </Form.Item>
          </div>

          {/* Khung nhập PL01 */}
          <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 12, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <Text strong>1. Tài liệu Yêu cầu Nghiệp vụ (PL01)</Text>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => setActivePickerKind('PL01')}
              >
                Chọn nguồn ({pl01Sources.length})
              </Button>
            </div>

            {pl01Sources.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {pl01Sources.map((s) => (
                  <Tag
                    key={s.id}
                    closable
                    onClose={() => removePl01Source(s.id)}
                    icon={<FileTextOutlined />}
                    color="blue"
                  >
                    {s.title} (v{s.version})
                  </Tag>
                ))}
              </div>
            )}

            <Form.Item
              name="pl01Content"
              rules={[
                {
                  validator: async (_, value) => {
                    if ((!value || !value.trim()) && pl01Sources.length === 0) {
                      throw new Error('Vui lòng dán nội dung hoặc chọn ít nhất 1 tài liệu nguồn cho PL01');
                    }
                  },
                },
              ]}
            >
              <TextArea
                rows={4}
                placeholder="Dán nội dung Yêu cầu nghiệp vụ PL01 tại đây (có thể kết hợp với nguồn tài liệu đã chọn)..."
                showCount
              />
            </Form.Item>
          </div>

          {/* Khung nhập PL02 */}
          <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 12, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <Text strong>2. Tài liệu Đặc tả Chức năng (PL02)</Text>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => setActivePickerKind('PL02')}
              >
                Chọn nguồn ({pl02Sources.length})
              </Button>
            </div>

            {pl02Sources.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {pl02Sources.map((s) => (
                  <Tag
                    key={s.id}
                    closable
                    onClose={() => removePl02Source(s.id)}
                    icon={<FileTextOutlined />}
                    color="cyan"
                  >
                    {s.title} (v{s.version})
                  </Tag>
                ))}
              </div>
            )}

            <Form.Item
              name="pl02Content"
              rules={[
                {
                  validator: async (_, value) => {
                    if ((!value || !value.trim()) && pl02Sources.length === 0) {
                      throw new Error('Vui lòng dán nội dung hoặc chọn ít nhất 1 tài liệu nguồn cho PL02');
                    }
                  },
                },
              ]}
            >
              <TextArea
                rows={5}
                placeholder="Dán nội dung Đặc tả chức năng PL02 tại đây (có thể kết hợp với nguồn tài liệu đã chọn)..."
                showCount
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* Note Source Picker Modal for PL01 or PL02 */}
      {activePickerKind && (
        <NoteSourcePickerModal
          open={Boolean(activePickerKind)}
          kind={activePickerKind}
          projectId={project.id}
          projectName={project.name}
          initialSelectedIds={
            activePickerKind === 'PL01'
              ? pl01Sources.map((s) => s.id)
              : pl02Sources.map((s) => s.id)
          }
          onApply={(sources) => {
            if (activePickerKind === 'PL01') {
              setPl01Sources(sources);
            } else {
              setPl02Sources(sources);
            }
            setActivePickerKind(null);
          }}
          onClose={() => setActivePickerKind(null)}
        />
      )}
    </>
  );
};
