import React, { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  Tag,
  Badge,
  Popconfirm,
  Empty,
  message,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  PushpinFilled,
  PushpinOutlined,
  EditOutlined,
  DeleteOutlined,
  PaperClipOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Note, NoteEntityType } from '../../types/models';
import { deleteNote, updateNote } from '../../db/repositories/noteRepo';
import { renderSafeMarkdown } from '../../utils/markdown';
import { NoteEditor } from './NoteEditor';
import { NoteDetailModal } from './NoteDetailModal';
import { openNotesPopout } from '../../utils/notesPopout';

export interface EntityNotesSectionProps {
  entityType: NoteEntityType;
  entityId: string;
  db?: TaskPlannerDatabase | undefined;
}

export const EntityNotesSection: React.FC<EntityNotesSectionProps> = ({
  entityType,
  entityId,
  db = defaultDb,
}) => {
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // Live query for entity notes sorted pinned first, then updatedAt desc
  const notes = useLiveQuery(
    async () => {
      const records = await db.notes
        .where('entityId')
        .equals(entityId)
        .filter((n) => n.entityType === entityType)
        .toArray();

      return records.sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    },
    [entityType, entityId, db]
  );

  // Attachment counts map
  const attachmentCounts = useLiveQuery(
    async () => {
      if (!notes || notes.length === 0) return new Map<string, number>();
      const noteIds = notes.map((n) => n.id);
      const attachments = await db.noteAttachments
        .where('noteId')
        .anyOf(noteIds)
        .toArray();

      const counts = new Map<string, number>();
      attachments.forEach((a) => {
        counts.set(a.noteId, (counts.get(a.noteId) || 0) + 1);
      });
      return counts;
    },
    [notes, db]
  );

  const handleDelete = async (id: string) => {
    try {
      await deleteNote(id, db);
      message.success('Đã xóa ghi chú');
    } catch {
      message.error('Không thể xóa ghi chú');
    }
  };

  const handleTogglePin = async (note: Note) => {
    try {
      await updateNote(note.id, { isPinned: !note.isPinned }, db);
    } catch {
      message.error('Không thể thay đổi ghim');
    }
  };

  const handleOpenPopout = () => {
    openNotesPopout({ entityType, entityId }).catch((err) => {
      console.warn('Failed to open notes popout:', err);
    });
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space>
          <Typography.Text strong>Ghi chú liên kết</Typography.Text>
          <Badge count={notes?.length || 0} overflowCount={99} />
        </Space>
        <Space>
          <Tooltip title="Mở danh sách ghi chú trong cửa sổ nổi riêng">
            <Button
              size="small"
              icon={<ExportOutlined />}
              onClick={handleOpenPopout}
            >
              Mở cửa sổ nổi
            </Button>
          </Tooltip>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingNote(null);
              setEditorOpen(true);
            }}
          >
            Thêm ghi chú
          </Button>
        </Space>
      </div>

      {(!notes || notes.length === 0) ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa có ghi chú nào cho mục này"
          style={{ margin: '16px 0' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notes.map((note) => {
            const count = attachmentCounts?.get(note.id) || 0;
            return (
              <Card
                key={note.id}
                size="small"
                style={{
                  borderLeft: note.isPinned ? '3px solid #1677ff' : undefined,
                  background: note.isPinned ? '#f0f7ff' : '#fff',
                }}
                styles={{ body: { padding: '10px 12px' } }}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedNote(note)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedNote(note);
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <Space size={6} wrap>
                    {note.isPinned && (
                      <Tag color="blue" icon={<PushpinFilled style={{ fontSize: 10 }} />}>
                        Đã ghim
                      </Tag>
                    )}
                    {note.title ? (
                      <Typography.Text strong>{note.title}</Typography.Text>
                    ) : (
                      <Typography.Text type="secondary" italic>
                        (Không tiêu đề)
                      </Typography.Text>
                    )}
                    {count > 0 && (
                      <Tag icon={<PaperClipOutlined />}>
                        {count} ảnh
                      </Tag>
                    )}
                  </Space>

                  <Space size={2}>
                    <Tooltip title={note.isPinned ? 'Bỏ ghim' : 'Ghim lên đầu'}>
                      <Button
                        type="text"
                        size="small"
                        icon={note.isPinned ? <PushpinFilled style={{ color: '#1677ff' }} /> : <PushpinOutlined />}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleTogglePin(note);
                        }}
                      />
                    </Tooltip>
                    <Tooltip title="Chỉnh sửa">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingNote(note);
                          setEditorOpen(true);
                        }}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="Xóa ghi chú này?"
                      description="Ghi chú và tất cả ảnh đính kèm sẽ bị xóa."
                      onConfirm={() => void handleDelete(note.id)}
                      okText="Xóa"
                      cancelText="Hủy"
                    >
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </Popconfirm>
                  </Space>
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: '#434343',
                    maxHeight: 120,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                  dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(note.body) }}
                />

                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    Cập nhật: {new Date(note.updatedAt).toLocaleString('vi-VN')}
                  </Typography.Text>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NoteDetailModal
        open={Boolean(selectedNote)}
        note={selectedNote}
        onClose={() => setSelectedNote(null)}
        onEdit={(note) => {
          setSelectedNote(null);
          setEditingNote(note);
          setEditorOpen(true);
        }}
        db={db}
      />

      {editorOpen && (
        <NoteEditor
          open={editorOpen}
          onClose={() => {
            setEditorOpen(false);
            setEditingNote(null);
          }}
          note={editingNote}
          defaultEntityType={entityType}
          defaultEntityId={entityId}
          db={db}
        />
      )}
    </div>
  );
};
