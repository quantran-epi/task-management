import React, { useState, useEffect, useMemo } from 'react';
import {
  Input,
  Button,
  Space,
  Tag,
  Typography,
  Empty,
  Popconfirm,
  Tooltip,
  message,
  Card,
  theme,
} from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  PushpinFilled,
  PushpinOutlined,
  EditOutlined,
  DeleteOutlined,
  PaperClipOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { Note, NoteEntityType } from '../types/models';
import { deleteNote, updateNote } from '../db/repositories/noteRepo';
import { renderSafeMarkdown } from '../utils/markdown';
import { NoteEditor } from '../components/notes/NoteEditor';
import { NoteDetailModal } from '../components/notes/NoteDetailModal';
import { QuickNoteEntry } from '../components/notes/QuickNoteEntry';
import {
  isTauriApp,
  isNotesWindowAlwaysOnTop,
  setNotesWindowAlwaysOnTop,
  NOTES_FILTER_EVENT,
  type NotesFilterParams,
} from '../utils/notesPopout';

const GEOMETRY_STORAGE_KEY = 'planner:notes_popout_geometry';

export interface NotesPopoutViewProps {
  db?: TaskPlannerDatabase | undefined;
}

export const NotesPopoutView: React.FC<NotesPopoutViewProps> = ({ db = defaultDb }) => {
  const { token } = theme.useToken();
  const [searchText, setSearchText] = useState<string>('');
  const [pinned, setPinned] = useState<boolean>(true);
  const [isTauri] = useState<boolean>(() => isTauriApp());
  const [activeFilter, setActiveFilter] = useState<NotesFilterParams | null>(null);
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // 1. Parse initial query parameters from window.location.hash
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const match = window.location.hash.match(/[?&]entityType=([^&]+)&entityId=([^&]+)/);
      if (match && match[1] && match[2]) {
        setActiveFilter({
          entityType: decodeURIComponent(match[1]),
          entityId: decodeURIComponent(match[2]),
        });
      }
    }
  }, []);

  // 2. Tauri event listener for filter changes and geometry clamping/persistence
  useEffect(() => {
    let unlistenFilter: (() => void) | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;

    if (isTauri) {
      isNotesWindowAlwaysOnTop().then((state) => setPinned(state));

      // Import Tauri APIs
      Promise.all([
        import('@tauri-apps/api/event'),
        import('@tauri-apps/api/webviewWindow'),
        import('@tauri-apps/api/window'),
      ]).then(([{ listen }, { getCurrentWebviewWindow }, { PhysicalPosition, PhysicalSize, currentMonitor }]) => {
        const win = getCurrentWebviewWindow();

        // Listen for filter updates emitted by main window
        listen<NotesFilterParams>(NOTES_FILTER_EVENT, (event) => {
          setActiveFilter(event.payload);
        }).then((unsub) => {
          unlistenFilter = unsub;
        });

        // Restore clamped geometry from localStorage (D-23)
        try {
          const raw = localStorage.getItem(GEOMETRY_STORAGE_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved.width && saved.height) {
              win.setSize(new PhysicalSize(saved.width, saved.height)).catch(() => {});
            }
            if (typeof saved.x === 'number' && typeof saved.y === 'number') {
              // Clamp position to monitor bounds
              currentMonitor().then((monitor) => {
                if (monitor) {
                  const monX = monitor.position.x;
                  const monY = monitor.position.y;
                  const monW = monitor.size.width;
                  const monH = monitor.size.height;
                  const clampedX = Math.max(monX, Math.min(saved.x, monX + monW - 100));
                  const clampedY = Math.max(monY, Math.min(saved.y, monY + monH - 100));
                  win.setPosition(new PhysicalPosition(clampedX, clampedY)).catch(() => {});
                }
              }).catch(() => {});
            }
            if (typeof saved.alwaysOnTop === 'boolean') {
              win.setAlwaysOnTop(saved.alwaysOnTop).catch(() => {});
              setPinned(saved.alwaysOnTop);
            }
          }
        } catch {
          // Ignore parse errors
        }

        // Save geometry on move and resize
        const saveGeometry = async () => {
          try {
            const pos = await win.outerPosition();
            const size = await win.outerSize();
            const aot = await win.isAlwaysOnTop();
            localStorage.setItem(
              GEOMETRY_STORAGE_KEY,
              JSON.stringify({
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                alwaysOnTop: aot,
              })
            );
          } catch {
            // Ignore
          }
        };

        win.onMoved(() => {
          void saveGeometry();
        }).then((u) => {
          unlistenMoved = u;
        });

        win.onResized(() => {
          void saveGeometry();
        }).then((u) => {
          unlistenResized = u;
        });
      });
    }

    return () => {
      unlistenFilter?.();
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, [isTauri]);

  const handleTogglePin = async () => {
    const next = !pinned;
    setPinned(next);
    if (isTauri) {
      await setNotesWindowAlwaysOnTop(next);
      try {
        const raw = localStorage.getItem(GEOMETRY_STORAGE_KEY);
        const existing = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          GEOMETRY_STORAGE_KEY,
          JSON.stringify({ ...existing, alwaysOnTop: next })
        );
      } catch {
        // Ignore
      }
    }
  };

  // 3. Live query for notes
  const allNotes = useLiveQuery(
    async () => {
      const records = await db.notes.toArray();
      return records.sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    },
    [db]
  );

  // 4. Live query for attachments
  const allAttachments = useLiveQuery(
    async () => {
      return await db.noteAttachments.toArray();
    },
    [db]
  );

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

  // Entity label map
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

  // Filtered notes
  const filteredNotes = useMemo(() => {
    if (!allNotes) return [];

    const lowerSearch = searchText.trim().toLowerCase();

    return allNotes.filter((note) => {
      // Entity filter
      if (activeFilter?.entityType && activeFilter?.entityId) {
        if (
          note.entityType?.toLowerCase() !== activeFilter.entityType.toLowerCase() ||
          note.entityId !== activeFilter.entityId
        ) {
          return false;
        }
      }

      // Search text
      if (!lowerSearch) return true;

      const titleMatch = note.title?.toLowerCase().includes(lowerSearch);
      const bodyMatch = note.body.toLowerCase().includes(lowerSearch);
      const attTexts = noteAttachmentMeta.searchTexts.get(note.id) || [];
      const attachmentMatch = attTexts.some((t) => t.includes(lowerSearch));

      return Boolean(titleMatch || bodyMatch || attachmentMatch);
    });
  }, [allNotes, searchText, activeFilter, noteAttachmentMeta]);

  const handleDelete = async (id: string) => {
    try {
      await deleteNote(id, db);
      message.success('Đã xóa ghi chú');
    } catch {
      message.error('Không thể xóa ghi chú');
    }
  };

  const handleToggleNotePin = async (note: Note) => {
    try {
      await updateNote(note.id, { isPinned: !note.isPinned }, db);
    } catch {
      message.error('Không thể thay đổi ghim');
    }
  };

  const currentEntityLabel = activeFilter
    ? entityNames?.get(`${activeFilter.entityType?.toLowerCase()}:${activeFilter.entityId}`) ||
      activeFilter.entityType
    : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: token.colorBgContainer,
        overflow: 'hidden',
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: token.colorBgElevated,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Text strong style={{ fontSize: 14 }}>
            Ghi chú nhanh ({filteredNotes.length})
          </Typography.Text>
          <Space size={4}>
            {isTauri && (
              <Tooltip title={pinned ? 'Bỏ ghim cửa sổ trên cùng' : 'Ghim cửa sổ luôn trên cùng'}>
                <Button
                  size="small"
                  type={pinned ? 'primary' : 'text'}
                  icon={pinned ? <PushpinFilled /> : <PushpinOutlined />}
                  onClick={() => void handleTogglePin()}
                />
              </Tooltip>
            )}
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingNote(null);
                setEditorOpen(true);
              }}
            >
              Thêm
            </Button>
          </Space>
        </div>

        <Input
          size="small"
          placeholder="Tìm nội dung, ảnh, ghi chú..."
          prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
        />

        {activeFilter && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Tag color="purple" style={{ margin: 0, maxWidth: 280 }} closable={false}>
              Đang lọc: {currentEntityLabel}
            </Tag>
            <Button
              type="link"
              size="small"
              icon={<CloseCircleOutlined />}
              onClick={() => setActiveFilter(null)}
              style={{ padding: 0, height: 'auto', fontSize: 12 }}
            >
              Xem tất cả
            </Button>
          </div>
        )}
      </div>

      <div style={{ padding: '10px 12px 0' }}>
        <QuickNoteEntry
          defaultEntityType={activeFilter?.entityType as NoteEntityType | undefined}
          defaultEntityId={activeFilter?.entityId}
          db={db}
        />
      </div>

      {/* Scrollable Notes List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {filteredNotes.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Không có ghi chú nào"
            style={{ marginTop: 40 }}
          />
        ) : (
          filteredNotes.map((note) => {
            const attCount = noteAttachmentMeta.counts.get(note.id) || 0;
            const entityLabel =
              note.entityType && note.entityId
                ? entityNames?.get(`${note.entityType.toLowerCase()}:${note.entityId}`) || note.entityType
                : null;

            return (
              <Card
                key={note.id}
                size="small"
                style={{
                  borderLeft: note.isPinned ? '3px solid #1677ff' : undefined,
                  background: note.isPinned ? '#fafcff' : '#fff',
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <Space size={4} wrap>
                    {note.isPinned && (
                      <Tag color="blue" icon={<PushpinFilled style={{ fontSize: 10 }} />}>
                        Ghim
                      </Tag>
                    )}
                    {note.title ? (
                      <Typography.Text strong style={{ fontSize: 13 }}>
                        {note.title}
                      </Typography.Text>
                    ) : (
                      <Typography.Text type="secondary" italic style={{ fontSize: 12 }}>
                        (Không tiêu đề)
                      </Typography.Text>
                    )}
                    {entityLabel && (
                      <Tag color="purple" style={{ fontSize: 10 }}>
                        {entityLabel}
                      </Tag>
                    )}
                    {attCount > 0 && (
                      <Tag icon={<PaperClipOutlined />} style={{ fontSize: 10 }}>
                        {attCount}
                      </Tag>
                    )}
                  </Space>

                  <Space size={2}>
                    <Tooltip title={note.isPinned ? 'Bỏ ghim' : 'Ghim'}>
                      <Button
                        type="text"
                        size="small"
                        icon={
                          note.isPinned ? (
                            <PushpinFilled style={{ color: '#1677ff', fontSize: 12 }} />
                          ) : (
                            <PushpinOutlined style={{ fontSize: 12 }} />
                          )
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleToggleNotePin(note);
                        }}
                      />
                    </Tooltip>
                    <Tooltip title="Chỉnh sửa">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined style={{ fontSize: 12 }} />}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingNote(note);
                          setEditorOpen(true);
                        }}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="Xóa ghi chú này?"
                      onConfirm={() => void handleDelete(note.id)}
                      okText="Xóa"
                      cancelText="Hủy"
                    >
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </Popconfirm>
                  </Space>
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: '#434343',
                    maxHeight: 140,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.5',
                  }}
                  dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(note.body) }}
                />
              </Card>
            );
          })
        )}
      </div>

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
          defaultEntityType={activeFilter?.entityType as NoteEntityType | undefined}
          defaultEntityId={activeFilter?.entityId}
          db={db}
        />
      )}
    </div>
  );
};
