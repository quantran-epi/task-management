import React, { useState, useMemo, useDeferredValue } from 'react';
import {
  Form,
  Input,
  Button,
  DatePicker,
  Space,
  Typography,
  theme,
  Modal,
  Select,
  Tag,
  Alert,
  message,
} from 'antd';
import {
  FileTextOutlined,
  ArrowRightOutlined,
  FolderOpenOutlined,
  SearchOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import type { SdlcWorkflowMetadata } from '../../../services/wizard/workflowSchemas';
import type { Note } from '../../../types/models';
import { VirtualizedList } from '../../../workbench/virtual/VirtualizedList';
import dayjs from 'dayjs';
import { ConventionsSummaryCard, type ConventionsSummaryProps } from '../common/ConventionsSummaryCard';

export interface Step1IntakeViewProps {
  projectId: string;
  initialMetadata?: Partial<SdlcWorkflowMetadata> | undefined;
  initialPl01?: string | undefined;
  initialPl02?: string | undefined;
  conventionsSummary?: ConventionsSummaryProps | undefined;
  onStartIntake: (
    metadata: SdlcWorkflowMetadata,
    pl01Content: string,
    pl02Content: string
  ) => Promise<void>;
  db?: TaskPlannerDatabase | undefined;
}

export const Step1IntakeView: React.FC<Step1IntakeViewProps> = ({
  projectId,
  initialMetadata,
  initialPl01 = '',
  initialPl02 = '',
  conventionsSummary,
  onStartIntake,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Note picker state
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const [noteTargetField, setNoteTargetField] = useState<'pl01' | 'pl02'>('pl01');
  const [projectFilter, setProjectFilter] = useState<string>(projectId);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // The picker is optional; do not load every note body on Studio entry.
  const allNotes = useLiveQuery(() => notePickerOpen ? db.notes.toArray() : [], [db, notePickerOpen]) ?? [];
  const allProjects = useLiveQuery(() => notePickerOpen ? db.projects.toArray() : [], [db, notePickerOpen]) ?? [];

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allProjects) {
      map.set(p.id, p.name);
    }
    return map;
  }, [allProjects]);

  const deferredSearch = useDeferredValue(searchQuery);

  const filteredNotes = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return allNotes.filter((note) => {
      if (projectFilter !== 'ALL' && note.entityId !== projectFilter) {
        return false;
      }
      if (q) {
        const matchTitle = (note.title || '').toLowerCase().includes(q);
        if (matchTitle) return true;
        const matchContent = (note.body || '').toLowerCase().includes(q);
        return matchContent;
      }
      return true;
    });
  }, [allNotes, projectFilter, deferredSearch]);

  const handleOpenNotePicker = (field: 'pl01' | 'pl02') => {
    setNoteTargetField(field);
    setProjectFilter(projectId);
    setSearchQuery('');
    setNotePickerOpen(true);
  };

  const handleSelectNote = (note: Note) => {
    const text = note.body ?? '';
    if (noteTargetField === 'pl01') {
      form.setFieldsValue({ pl01: text });
    } else {
      form.setFieldsValue({ pl02: text });
    }
    setNotePickerOpen(false);
    message.success(`Đã lấy nội dung từ ghi chú "${note.title || 'Không tiêu đề'}"`);
  };

  const isIntakeCompleted = Boolean(initialPl01 && initialPl02);

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
      {conventionsSummary && (
        <ConventionsSummaryCard {...conventionsSummary} />
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Bước 1: Nạp hồ sơ yêu cầu đầu vào (PL01 & PL02)
          </Typography.Title>
          {isIntakeCompleted && (
            <Tag icon={<CheckCircleFilled />} color="success" style={{ fontSize: 13, padding: '3px 10px' }}>
              Bước 1 hoàn thành
            </Tag>
          )}
        </div>
        <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
          Cung cấp thông tin nghiệp vụ và đặc tả tính năng để AI phân tích kiến trúc giải pháp SOLUTION.md.
        </Typography.Paragraph>
      </div>

      {isIntakeCompleted && (
        <Alert
          type="success"
          showIcon
          message={`Hồ sơ yêu cầu CR ${initialMetadata?.cr || ''} đã sẵn sàng`}
          description={
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              Tính năng: <strong>{initialMetadata?.featureName || 'Chưa đặt tên'}</strong> • Người lập:{' '}
              {initialMetadata?.author || 'N/A'} • Đơn vị: {initialMetadata?.requestingUnit || 'N/A'}. Bạn có thể
              chỉnh sửa thông tin bên dưới hoặc bấm phân tích lại bất cứ lúc nào.
            </div>
          }
        />
      )}

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

      {/* Note Picker Modal with Project Filter and Search */}
      <Modal
        title={`Chọn ghi chú nạp vào ${noteTargetField === 'pl01' ? 'PL01' : 'PL02'}`}
        open={notePickerOpen}
        onCancel={() => setNotePickerOpen(false)}
        footer={null}
        width={720}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Select
              style={{ width: 220 }}
              value={projectFilter}
              onChange={setProjectFilter}
              aria-label="Lọc theo dự án"
              options={[
                { label: 'Tất cả dự án', value: 'ALL' },
                ...allProjects.map((p) => ({
                  label: p.id === projectId ? `${p.name} (Hiện tại)` : p.name,
                  value: p.id,
                })),
              ]}
            />
            <Input
              prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
              placeholder="Tìm theo tiêu đề hoặc nội dung ghi chú..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
              style={{ flex: 1 }}
            />
          </div>
        </div>

        {filteredNotes.length === 0 ? (
          <div
            style={{
              padding: '36px 0',
              textAlign: 'center',
              color: token.colorTextTertiary,
              fontSize: 14,
            }}
          >
            Không tìm thấy ghi chú nào phù hợp bộ lọc
          </div>
        ) : (
          <VirtualizedList
            items={filteredNotes}
            height={420}
            estimateSize={() => 76}
            role="list"
            aria-label="Danh sách ghi chú"
            renderItem={(item) => {
              const projName = item.entityId ? projectMap.get(item.entityId) : undefined;
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    boxSizing: 'border-box',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
                    <FileTextOutlined
                      style={{ fontSize: 22, color: token.colorPrimary, marginTop: 2, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Space size={8} wrap={false} style={{ maxWidth: '100%', overflow: 'hidden' }}>
                        <span
                          style={{
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.title || 'Ghi chú không tiêu đề'}
                        </span>
                        {projName ? (
                          <Tag
                            color={item.entityId === projectId ? 'blue' : 'default'}
                            style={{ margin: 0, flexShrink: 0 }}
                          >
                            {projName}
                          </Tag>
                        ) : (
                          <Tag style={{ margin: 0, flexShrink: 0 }}>Chung</Tag>
                        )}
                      </Space>
                      <div
                        style={{
                          maxHeight: 38,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontSize: 12,
                          color: token.colorTextSecondary,
                          marginTop: 4,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.body || '(trống)'}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => handleSelectNote(item)}
                    style={{ flexShrink: 0 }}
                  >
                    Chọn
                  </Button>
                </div>
              );
            }}
          />
        )}
      </Modal>
    </div>
  );
};
