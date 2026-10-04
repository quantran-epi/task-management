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
  type SelectProps,
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
import { PageHeader } from '../components/common/PageHeader';
import { openNotesPopout } from '../utils/notesPopout';

export interface NotesViewProps {
  db?: TaskPlannerDatabase | undefined;
}

export const NotesView: React.FC<NotesViewProps> = ({ db = defaultDb }) => {
  const [searchText, setSearchText] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<'all' | 'standalone' | NoteEntityType>('all');
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(undefined);
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

  // Entities list for item-level selection filter
  const entityItems = useLiveQuery(
    async () => {
      const [tasks, projects, milestones] = await Promise.all([
        db.tasks.toArray(),
        db.projects.toArray(),
        db.milestones.toArray(),
      ]);

      return {
        task: tasks
          .map((t) => ({ value: t.id, label: t.name }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        project: projects
          .map((p) => ({ value: p.id, label: p.name }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        milestone: milestones
          .map((m) => ({ value: m.id, label: m.name }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      };
    },
    [db]
  );

  const itemOptions: SelectProps['options'] = useMemo(() => {
    if (!entityItems) return [];
    if (entityFilter === 'task') return entityItems.task;
    if (entityFilter === 'project') return entityItems.project;
    if (entityFilter === 'milestone') return entityItems.milestone;
    return [
      { label: 'Tác vụ', options: entityItems.task },
      { label: 'Dự án', options: entityItems.project },
      { label: 'Cột mốc', options: entityItems.milestone },
    ];
  }, [entityItems, entityFilter]);

  const itemPlaceholder = useMemo(() => {
    if (entityFilter === 'task') return 'Lọc theo tác vụ cụ thể (Tất cả)';
    if (entityFilter === 'project') return 'Lọc theo dự án cụ thể (Tất cả)';
    if (entityFilter === 'milestone') return 'Lọc theo cột mốc cụ thể (Tất cả)';
    return 'Lọc theo mục cụ thể (Tất cả)';
  }, [entityFilter]);

  const handleEntityFilterChange = (val: 'all' | 'standalone' | NoteEntityType) => {
    setEntityFilter(val);
    setSelectedEntityId(undefined);
  };

  // Filter notes by search text, entity category, and specific item
  const filteredNotes = useMemo(() => {
    if (!allNotes) return [];

    const lowerSearch = searchText.trim().toLowerCase();

    return allNotes.filter((note) => {
      // 1. Entity Filter
      if (entityFilter === 'standalone') {
        if (note.entityType) return false;
      } else if (entityFilter !== 'all') {
        if (note.entityType !== entityFilter) return false;
        // Item-level filter
        if (selectedEntityId && note.entityId !== selectedEntityId) {
          return false;
        }
      } else if (selectedEntityId) {
        // When category is 'all' but specific item is selected
        if (note.entityId !== selectedEntityId) {
          return false;
        }
      }

      // 2. Search Text
      if (!lowerSearch) return true;

      const titleMatch = note.title?.toLowerCase().includes(lowerSearch);
      const bodyMatch = note.body.toLowerCase().includes(lowerSearch);

      // Search in attachment filename and caption (D-17)
      const attTexts = noteAttachmentMeta.searchTexts.get(note.id) || [];
      const attachmentMatch = attTexts.some((t) => t.includes(lowerSearch));

      // Search in parent entity name
      const parentName = note.entityType && note.entityId
        ? entityNames?.get(`${note.entityType}:${note.entityId}`)
        : undefined;
      const parentMatch = parentName ? parentName.toLowerCase().includes(lowerSearch) : false;

      return Boolean(titleMatch || bodyMatch || attachmentMatch || parentMatch);
    });
  }, [allNotes, searchText, entityFilter, selectedEntityId, noteAttachmentMeta, entityNames]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Standard Page Header */}
      <PageHeader
        title="Ghi chú & Tài liệu"
        subtitle="Ghi chép nhanh, đính kèm hình ảnh và liên kết với tác vụ, dự án"
        extra={
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
        }
      />

      {/* 2. Filter Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <Input
          placeholder="Tìm theo nội dung, tiêu đề, mục cha, ảnh..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          style={{ width: 280 }}
        />

        <Select
          value={entityFilter}
          onChange={handleEntityFilterChange}
          style={{ width: 180 }}
          options={[
            { label: 'Tất cả ghi chú', value: 'all' },
            { label: 'Ghi chú độc lập', value: 'standalone' },
            { label: 'Gắn với Tác vụ', value: 'task' },
            { label: 'Gắn với Dự án', value: 'project' },
            { label: 'Gắn với Cột mốc', value: 'milestone' },
          ]}
        />

        {entityFilter !== 'standalone' && (
          <Select
            allowClear
            showSearch
            placeholder={itemPlaceholder}
            value={selectedEntityId}
            onChange={(val) => setSelectedEntityId(val)}
            style={{ minWidth: 260, flex: 1, maxWidth: 400 }}
            options={itemOptions}
            filterOption={(input, option) =>
              ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        )}
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
                      style={{
                        marginTop: 6,
                        marginBottom: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
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
