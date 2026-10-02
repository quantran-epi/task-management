import React, { useEffect, useState } from 'react';
import { Button, Modal, Tag, Typography } from 'antd';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Note, NoteAttachment } from '../../types/models';
import { renderSafeMarkdown } from '../../utils/markdown';
import { NoteAttachmentsPanel } from './NoteAttachmentsPanel';

export interface NoteDetailModalProps {
  open: boolean;
  note: Note | null;
  onClose: () => void;
  onEdit: (note: Note) => void;
  db?: TaskPlannerDatabase;
}

export const NoteDetailModal: React.FC<NoteDetailModalProps> = ({
  open,
  note,
  onClose,
  onEdit,
  db = defaultDb,
}) => {
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);

  useEffect(() => {
    let active = true;
    if (!open || !note) {
      setAttachments([]);
      return () => {
        active = false;
      };
    }

    void db.noteAttachments
      .where('noteId')
      .equals(note.id)
      .toArray()
      .then((items) => {
        if (active) setAttachments(items);
      });
    return () => {
      active = false;
    };
  }, [db, note, open]);

  return (
    <Modal
      title={note?.title || 'Chi tiết ghi chú'}
      open={open && Boolean(note)}
      onCancel={onClose}
      width={680}
      footer={[
        <Button key="close" onClick={onClose}>Đóng</Button>,
        <Button key="edit" type="primary" onClick={() => note && onEdit(note)}>
          Chỉnh sửa đầy đủ
        </Button>,
      ]}
    >
      {note && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {note.entityType && <Tag color="purple">{note.entityType}</Tag>}
          <div dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(note.body) }} />
          <Typography.Text type="secondary">
            Cập nhật: {new Date(note.updatedAt).toLocaleString('vi-VN')}
          </Typography.Text>
          <NoteAttachmentsPanel
            noteId={note.id}
            attachments={attachments}
            readOnly
            db={db}
          />
        </div>
      )}
    </Modal>
  );
};
