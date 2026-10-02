import React, { useState } from 'react';
import { Button, Input, Space, Typography, Tooltip, message } from 'antd';
import { CameraOutlined, SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
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
  const [saving, setSaving] = useState(false);

  const createNoteWithAttachment = async (file: File, noteText: string): Promise<Note> => {
    const trimmed = noteText.trim();
    const nowStr = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const note = await createNote(
      {
        body: trimmed || `Ảnh chụp màn hình ${nowStr}`,
        title: trimmed ? undefined : `Ảnh chụp ${dayjs().format('HH:mm DD/MM')}`,
        isPinned: false,
        ...(defaultEntityType ? { entityType: defaultEntityType } : {}),
        ...(defaultEntityId ? { entityId: defaultEntityId } : {}),
      },
      db
    );
    await addNoteAttachment(
      {
        noteId: note.id,
        fileName: file.name,
        mimeType: (file.type as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp') || 'image/png',
        sizeBytes: file.size,
        data: file,
      },
      db
    );
    return note;
  };

  const handleQuickScreenshot = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const file = await captureFocusedWindowScreenshot();
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Dung lượng ảnh không được vượt quá 5MB');
      }
      const note = await createNoteWithAttachment(file, body);
      setBody('');
      onCreated?.(note);
      message.success('Đã tạo ghi chú từ ảnh chụp');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể chụp ảnh');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateText = async () => {
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
      setBody('');
      onCreated?.(note);
      message.success('Đã tạo ghi chú');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể tạo ghi chú');
    } finally {
      setSaving(false);
    }
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          if (file.size > 5 * 1024 * 1024) {
            message.error('Dung lượng ảnh không được vượt quá 5MB');
            return;
          }
          setSaving(true);
          try {
            const note = await createNoteWithAttachment(file, body);
            setBody('');
            onCreated?.(note);
            message.success('Đã tạo ghi chú từ ảnh dán');
          } catch (error) {
            message.error(error instanceof Error ? error.message : 'Không thể tạo ghi chú từ ảnh');
          } finally {
            setSaving(false);
          }
          return;
        }
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid #d9d9d9',
        backgroundColor: '#fafafa',
      }}
    >
      <Input.TextArea
        autoSize={{ minRows: 2, maxRows: 6 }}
        placeholder={placeholder}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onPaste={handlePaste}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void handleCreateText();
          }
        }}
        style={{
          border: 'none',
          backgroundColor: 'transparent',
          boxShadow: 'none',
          padding: 0,
          resize: 'none',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          borderTop: '1px solid #f0f0f0',
          paddingTop: 6,
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          Markdown • Enter để lưu • Shift+Enter xuống dòng • Dán ảnh (Ctrl+V)
        </Typography.Text>
        <Space size={6}>
          <Tooltip title="Chụp ảnh cửa sổ/màn hình và tạo ghi chú ngay">
            <Button
              size="small"
              icon={<CameraOutlined />}
              onClick={() => void handleQuickScreenshot()}
              loading={saving}
              aria-label="Chụp màn hình tạo ghi chú"
            >
              Chụp màn hình
            </Button>
          </Tooltip>
          <Button
            type="primary"
            size="small"
            icon={<SendOutlined />}
            onClick={() => void handleCreateText()}
            loading={saving}
            disabled={!body.trim()}
          >
            Lưu
          </Button>
        </Space>
      </div>
    </div>
  );
};
