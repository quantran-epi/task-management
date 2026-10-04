import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Switch,
  Select,
  Segmented,
  Button,
  message,
} from 'antd';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Note, NoteAttachment, NoteEntityType } from '../../types/models';
import { createNote, updateNote, addNoteAttachment } from '../../db/repositories/noteRepo';
import { renderSafeMarkdown } from '../../utils/markdown';
import { NoteAttachmentsPanel } from './NoteAttachmentsPanel';
import { isModPressed } from '../../utils/keyboard';

export interface NoteEditorProps {
  open: boolean;
  onClose: () => void;
  note?: Note | null | undefined;
  defaultEntityType?: NoteEntityType | undefined;
  defaultEntityId?: string | undefined;
  onSaved?: ((note: Note) => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  open,
  onClose,
  note,
  defaultEntityType,
  defaultEntityId,
  onSaved,
  db = defaultDb,
}) => {
  const [form] = Form.useForm();
  const [tabMode, setTabMode] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState<boolean>(false);
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [stagedFiles, setStagedFiles] = useState<Array<{ file: File; caption?: string | undefined }>>([]);
  const [markdownBody, setMarkdownBody] = useState<string>('');

  // Pre-load entities for selector if needed
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [tasks, setTasks] = useState<Array<{ id: string; name: string }>>([]);
  const [milestones, setMilestones] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!open) return;

    // Load available entities
    db.projects.toArray().then((list) => setProjects(list.map((p) => ({ id: p.id, name: p.name }))));
    db.tasks.toArray().then((list) => setTasks(list.map((t) => ({ id: t.id, name: t.name }))));
    db.milestones.toArray().then((list) => setMilestones(list.map((m) => ({ id: m.id, name: m.name }))));

    if (note) {
      form.setFieldsValue({
        title: note.title || '',
        body: note.body,
        isPinned: note.isPinned,
        entityType: note.entityType || undefined,
        entityId: note.entityId || undefined,
      });
      setMarkdownBody(note.body);
      // Fetch attachments for existing note
      db.noteAttachments.where('noteId').equals(note.id).toArray().then((atts) => {
        setAttachments(atts);
      });
      setStagedFiles([]);
    } else {
      form.setFieldsValue({
        title: '',
        body: '',
        isPinned: false,
        entityType: defaultEntityType || undefined,
        entityId: defaultEntityId || undefined,
      });
      setMarkdownBody('');
      setAttachments([]);
      setStagedFiles([]);
    }
    setTabMode('write');
  }, [open, note, defaultEntityType, defaultEntityId, db, form]);

  const currentEntityType = Form.useWatch('entityType', form);

  const getEntityOptions = () => {
    switch (currentEntityType) {
      case 'task':
        return tasks.map((t) => ({ label: t.name, value: t.id }));
      case 'project':
        return projects.map((p) => ({ label: p.name, value: p.id }));
      case 'milestone':
        return milestones.map((m) => ({ label: m.name, value: m.id }));
      default:
        return [];
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      let savedNote: Note;

      if (note) {
        // Update existing note
        const updated = await updateNote(
          note.id,
          {
            title: values.title?.trim() || undefined,
            body: values.body,
            isPinned: Boolean(values.isPinned),
            entityType: values.entityType || undefined,
            entityId: values.entityType ? values.entityId || undefined : undefined,
          },
          db
        );
        if (!updated) {
          throw new Error('Không tìm thấy ghi chú để cập nhật');
        }
        savedNote = updated;
      } else {
        // Create new note
        savedNote = await createNote(
          {
            title: values.title?.trim() || undefined,
            body: values.body,
            isPinned: Boolean(values.isPinned),
            entityType: values.entityType || undefined,
            entityId: values.entityType ? values.entityId || undefined : undefined,
          },
          db
        );

        // Upload staged attachments
        for (const staged of stagedFiles) {
          await addNoteAttachment(
            {
              noteId: savedNote.id,
              fileName: staged.file.name,
              mimeType: staged.file.type as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
              sizeBytes: staged.file.size,
              data: staged.file,
              caption: staged.caption,
            },
            db
          );
        }
      }

      message.success(note ? 'Đã lưu ghi chú' : 'Đã tạo ghi chú thành công');
      onSaved?.(savedNote);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        message.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isModPressed(e) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, form, note, stagedFiles]);

  return (
    <Modal
      title={note ? 'Chỉnh sửa ghi chú' : 'Tạo ghi chú mới'}
      open={open}
      onCancel={onClose}
      width={680}
      scrollLock={false}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Hủy
        </Button>,
        <Button key="save" type="primary" loading={saving} onClick={() => void handleSave()}>
          Lưu ghi chú
        </Button>,
      ]}
      destroyOnClose
    >
      <Form form={form} layout="vertical" initialValues={{ isPinned: false }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'flex-start' }}>
          <Form.Item name="title" label="Tiêu đề (tùy chọn)">
            <Input placeholder="Tiêu đề ghi chú..." maxLength={120} />
          </Form.Item>
          <Form.Item name="isPinned" label="Ghim lên đầu" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
          <Form.Item name="entityType" label="Liên kết thực thể">
            <Select
              allowClear
              placeholder="Độc lập (Không liên kết)"
              options={[
                { label: 'Tác vụ (Task)', value: 'task' },
                { label: 'Dự án (Project)', value: 'project' },
                { label: 'Cột mốc (Milestone)', value: 'milestone' },
              ]}
              onChange={() => form.setFieldValue('entityId', undefined)}
            />
          </Form.Item>

          <Form.Item
            name="entityId"
            label="Chọn thực thể cụ thể"
            rules={[
              {
                required: Boolean(currentEntityType),
                message: 'Vui lòng chọn thực thể cụ thể',
              },
            ]}
          >
            <Select
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              placeholder={currentEntityType ? 'Chọn thực thể...' : 'Không cần chọn'}
              disabled={!currentEntityType}
              options={getEntityOptions()}
            />
          </Form.Item>
        </div>

        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 500 }}>Nội dung ghi chú (Markdown) *</span>
          <Segmented
            size="small"
            value={tabMode}
            onChange={(val) => setTabMode(val as 'write' | 'preview')}
            options={[
              { label: 'Viết', value: 'write' },
              { label: 'Xem trước', value: 'preview' },
            ]}
          />
        </div>

        {tabMode === 'write' ? (
          <Form.Item
            name="body"
            rules={[{ required: true, message: 'Nội dung ghi chú không được để trống' }]}
            style={{ marginBottom: 16 }}
          >
            <Input.TextArea
              rows={8}
              placeholder="Nhập nội dung markdown... Hỗ trợ tiêu đề (#), in đậm (**), danh sách việc cần làm (- [ ] hoặc - [x]), mã (`code`), liên kết ([text](url))..."
              onChange={(e) => setMarkdownBody(e.target.value)}
            />
          </Form.Item>
        ) : (
          <div
            style={{
              minHeight: 180,
              maxHeight: 300,
              overflowY: 'auto',
              border: '1px solid #d9d9d9',
              borderRadius: 6,
              padding: '12px 16px',
              marginBottom: 16,
              background: '#fafafa',
            }}
            dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(markdownBody) || '<em>(Chưa có nội dung)</em>' }}
          />
        )}

        <NoteAttachmentsPanel
          noteId={note?.id}
          attachments={attachments}
          onChange={setAttachments}
          stagedFiles={stagedFiles}
          onStagedFilesChange={setStagedFiles}
          db={db}
        />
      </Form>
    </Modal>
  );
};
