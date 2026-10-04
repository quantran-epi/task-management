import React, { useEffect, useState } from 'react';
import { Button, Modal, Tag, Typography } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Note, NoteAttachment } from '../../types/models';
import { renderSafeMarkdown } from '../../utils/markdown';
import { NoteAttachmentsPanel } from './NoteAttachmentsPanel';

export interface NoteDetailModalProps {
  open: boolean;
  note: Note | null;
  onClose: () => void;
  onEdit: (note: Note) => void;
  onNavigateToNotes?: () => void;
  db?: TaskPlannerDatabase;
}

export const NoteDetailModal: React.FC<NoteDetailModalProps> = ({
  open,
  note,
  onClose,
  onEdit,
  onNavigateToNotes,
  db = defaultDb,
}) => {
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [entityName, setEntityName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!open || !note) {
      setAttachments([]);
      setEntityName(null);
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

    if (note.entityType && note.entityId) {
      const loadEntity = async () => {
        try {
          let name: string | null = null;
          if (note.entityType === 'task') {
            const task = await db.tasks.get(note.entityId!);
            name = task?.name ?? null;
          } else if (note.entityType === 'project') {
            const project = await db.projects.get(note.entityId!);
            name = project?.name ?? null;
          } else if (note.entityType === 'milestone') {
            const milestone = await db.milestones.get(note.entityId!);
            name = milestone?.name ?? null;
          }
          if (active) setEntityName(name);
        } catch {
          if (active) setEntityName(null);
        }
      };
      void loadEntity();
    } else {
      setEntityName(null);
    }

    return () => {
      active = false;
    };
  }, [db, note, open]);

  const getEntityDisplayText = () => {
    if (!note?.entityType) return 'Độc lập';
    const typeLabel =
      note.entityType === 'task'
        ? 'Tác vụ'
        : note.entityType === 'project'
          ? 'Dự án'
          : note.entityType === 'milestone'
            ? 'Cột mốc'
            : note.entityType;
    const target = entityName || note.entityId;
    return target ? `${typeLabel}: ${target}` : typeLabel;
  };

  return (
    <Modal
      title={note?.title || 'Chi tiết ghi chú'}
      open={open && Boolean(note)}
      onCancel={onClose}
      width={680}
      scrollLock={false}
      footer={[
        onNavigateToNotes && (
          <Button key="navigate" icon={<ExportOutlined />} onClick={onNavigateToNotes}>
            Mở trong trang Ghi chú
          </Button>
        ),
        <Button key="close" onClick={onClose}>Đóng</Button>,
        <Button key="edit" type="primary" onClick={() => note && onEdit(note)}>
          Chỉnh sửa đầy đủ
        </Button>,
      ].filter(Boolean)}
    >
      {note && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            {note.entityType ? (
              <Tag color="purple">{getEntityDisplayText()}</Tag>
            ) : (
              <Tag>{getEntityDisplayText()}</Tag>
            )}
          </div>
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
