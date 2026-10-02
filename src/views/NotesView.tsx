import React, { useState, useMemo } from 'react';
import {
  Card,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Typography,
  Empty,
  Popconfirm,
  Tooltip,
  message,
} from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  PushpinFilled,
  PushpinOutlined,
  EditOutlined,
  DeleteOutlined,
  PaperClipOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { Note, NoteEntityType } from '../types/models';
import { deleteNote, updateNote } from '../db/repositories/noteRepo';
import { renderSafeMarkdown } from '../utils/markdown';
import { NoteEditor } from '../components/notes/NoteEditor';
import { NoteDetailModal } from '../components/notes/NoteDetailModal';
import { QuickNoteEntry } from '../components/notes/QuickNoteEntry';
import { openNotesPopout } from '../utils/notesPopout';

export interface NotesViewProps {
  db?: TaskPlannerDatabase | undefined;
}

export const NotesView: React.FC<NotesViewProps> = ({ db = defaultDb }) => {
  const [searchText, setSearchText] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<'all' | 'standalone' | NoteEntityType>('all');
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // Fetch all notes
  const allNotes = useLiveQuery(
    async () => {
      const records = await db.notes.toArray();
      // Sort pinned first, then updatedAt descending (D-24)
      return records.sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    },
    [db]
  );

  // Fetch all note attachments for search across filenames and captions (D-17)
  const allAttachments = useLiveQuery(
    async () => {
      return await db.noteAttachments.toArray();
    },
    [db]
  );

  // Attachment count & metadata mapping
  const noteAttachmentMeta = useMemo(() => {
    const counts = new Map<string, number>();
    const searchTexts = new Map<string, string[]>();

    allAttachments?.forEach((att) => {
      counts.set(att.noteId, (counts.get(att.noteId) || 0) + 1);
      const list = searchTexts.get(att.noteId) || [];
      if (att.fileName) list.push(att.fileName.toLowerCase());
      if (att.caption) list.push(att.caption.toLowerCase());
      searchTexts.set(att.noteId, list);
    });

    return { counts, searchTexts };
  }, [allAttachments]);

  // Names map for attached entities
  const entityNames = useLiveQuery(
    async () => {
      const map = new Map<string, string>();
      const [tasks, projects, milestones] = await Promise.all([
        db.tasks.toArray(),
        db.projects.toArray(),
        db.milestones.toArray(),
      ]);

      tasks.forEach((t) => map.set(`task:${t.id}`, t.name));
      projects.forEach((p) => map.set(`project:${p.id}`, p.name));
      milestones.forEach((m) => map.set(`milestone:${m.id}`, m.name));
      return map;
    },
    [db]
  );

  // Filter notes by search text and entity category
  const filteredNotes = useMemo(() => {
    if (!allNotes) return [];

    const lowerSearch = searchText.trim().toLowerCase();

    return allNotes.filter((note) => {
      // 1. Entity Filter
      if (entityFilter === 'standalone') {
        if (note.entityType) return false;
      } else if (entityFilter !== 'all') {
        if (note.entityType !== entityFilter) return false;
      }

      // 2. Search Text
      if (!lowerSearch) return true;

      const titleMatch = note.title?.toLowerCase().includes(lowerSearch);
      const bodyMatch = note.body.toLowerCase().includes(lowerSearch);

      // Search in attachment filename and caption (D-17)
      const attTexts = noteAttachmentMeta.searchTexts.get(note.id) || [];
      const attachmentMatch = attTexts.some((t) => t.includes(lowerSearch));

      return Boolean(titleMatch || bodyMatch || attachmentMatch);
    });
  }, [allNotes, searchText, entityFilter, noteAttachmentMeta]);

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
    openNotesPopout().catch((err) => {
      console.warn('Failed to open notes popout:', err);
    });
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <Space wrap size="middle">
          <Input
            placeholder="Tìm theo nội dung, tiêu đề, tên ảnh, chú thích..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 320 }}
          />

          <Select
            value={entityFilter}
            onChange={(val) => setEntityFilter(val)}
            style={{ width: 200 }}
            options={[
              { label: 'Tất cả ghi chú', value: 'all' },
              { label: 'Ghi chú độc lập', value: 'standalone' },
              { label: 'Gắn với Tác vụ', value: 'task' },
              { label: 'Gắn với Dự án', value: 'project' },
              { label: 'Gắn với Cột mốc', value: 'milestone' },
            ]}
          />
        </Space>

        <Space>
          <Tooltip title="Mở danh sách ghi chú trong cửa sổ nổi riêng biệt (Always on Top)">
            <Button icon={<ExportOutlined />} onClick={handleOpenPopout}>
              Cửa sổ nổi
            </Button>
          </Tooltip>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingNote(null);
              setEditorOpen(true);
            }}
          >
            Tạo ghi chú
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 20 }}>
        <QuickNoteEntry db={db} />
      </div>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Không tìm thấy ghi chú nào phù hợp"
          style={{ marginTop: 64 }}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {filteredNotes.map((note) => {
            const attCount = noteAttachmentMeta.counts.get(note.id) || 0;
            const entityLabel =
              note.entityType && note.entityId
                ? entityNames?.get(`${note.entityType}:${note.entityId}`) || `${note.entityType}`
                : null;

            return (
              <Card
                key={note.id}
                size="small"
                hoverable
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  borderTop: note.isPinned ? '3px solid #1677ff' : undefined,
                  background: note.isPinned ? '#fafcff' : '#fff',
                }}
                styles={{
                  body: {
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 16,
                  },
                }}
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
                {/* Header: Title / Tags / Actions */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {note.isPinned && (
                        <Tag color="blue" icon={<PushpinFilled style={{ fontSize: 10 }} />}>
                          Đã ghim
                        </Tag>
                      )}
                      {note.entityType && (
                        <Tag color="purple">
                          {note.entityType}: {entityLabel || note.entityId}
                        </Tag>
                      )}
                      {!note.entityType && <Tag>Độc lập</Tag>}
                      {attCount > 0 && (
                        <Tag icon={<PaperClipOutlined />}>
                          {attCount} ảnh
                        </Tag>
                      )}
                    </div>
                    <Typography.Title
                      level={5}
                      ellipsis={{ rows: 1 }}
                      style={{ marginTop: 6, marginBottom: 0 }}
                    >
                      {note.title || '(Không tiêu đề)'}
                    </Typography.Title>
                  </div>

                  <Space size={2}>
                    <Tooltip title={note.isPinned ? 'Bỏ ghim' : 'Ghim lên đầu'}>
                      <Button
                        type="text"
                        size="small"
                        icon={
                          note.isPinned ? (
                            <PushpinFilled style={{ color: '#1677ff' }} />
                          ) : (
                            <PushpinOutlined />
                          )
                        }
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

                {/* Markdown content preview */}
                <div
                  style={{
                    flex: 1,
                    maxHeight: 180,
                    overflowY: 'auto',
                    fontSize: 13,
                    lineHeight: '1.6',
                    color: '#434343',
                    marginBottom: 12,
                    whiteSpace: 'pre-wrap',
                  }}
                  dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(note.body) }}
                />

                {/* Footer metadata */}
                <div
                  style={{
                    paddingTop: 8,
                    borderTop: '1px solid #f0f0f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {new Date(note.updatedAt).toLocaleString('vi-VN')}
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
          db={db}
        />
      )}
    </div>
  );
};
