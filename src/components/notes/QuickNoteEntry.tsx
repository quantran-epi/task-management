import React, { useState } from 'react';
import { Button, Input, Space, message } from 'antd';
import { CameraOutlined, DeleteOutlined } from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { addNoteAttachment, createNote } from '../../db/repositories/noteRepo';
import type { Note, NoteEntityType } from '../../types/models';
import { captureFocusedWindowScreenshot } from '../../utils/screenshotCapture';

export interface QuickNoteEntryProps {
  defaultEntityType?: NoteEntityType;
  defaultEntityId?: string;
  placeholder?: string;
  db?: TaskPlannerDatabase;
  onCreated?: (note: Note) => void;
}

export const QuickNoteEntry: React.FC<QuickNoteEntryProps> = ({
  defaultEntityType,
  defaultEntityId,
  placeholder = 'Ghi chú nhanh...',
  db = defaultDb,
  onCreated,
}) => {
  const [body, setBody] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCapture = async () => {
    try {
      const file = await captureFocusedWindowScreenshot();
      if (file.size > 5 * 1024 * 1024) throw new Error('Dung lượng ảnh không được vượt quá 5MB');
      setScreenshot(file);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể chụp cửa sổ');
    }
  };

  const handleCreate = async () => {
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const note = await createNote(
        {
          body: text,
          isPinned: false,
          ...(defaultEntityType ? { entityType: defaultEntityType } : {}),
          ...(defaultEntityId ? { entityId: defaultEntityId } : {}),
        },
        db
      );
      if (screenshot) {
        await addNoteAttachment(
          {
            noteId: note.id,
            fileName: screenshot.name,
            mimeType: 'image/png',
            sizeBytes: screenshot.size,
            data: screenshot,
          },
          db
        );
      }
      setBody('');
      setScreenshot(null);
      onCreated?.(note);
      message.success('Đã tạo ghi chú');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể tạo ghi chú');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input.TextArea
        autoSize={{ minRows: 1, maxRows: 4 }}
        placeholder={placeholder}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void handleCreate();
          }
        }}
      />
      <Button
        icon={screenshot ? <DeleteOutlined /> : <CameraOutlined />}
        aria-label={screenshot ? 'Bỏ ảnh chụp' : 'Chụp cửa sổ'}
        onClick={() => (screenshot ? setScreenshot(null) : void handleCapture())}
        loading={saving}
      />
    </Space.Compact>
  );
};
