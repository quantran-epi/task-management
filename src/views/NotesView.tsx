import React, { useState, useMemo, useRef } from 'react';
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
  Segmented,
  Modal,
} from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PaperClipOutlined,
  ExportOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { Note, NoteEntityType } from '../types/models';
import {
  deleteNote,
  updateNote,
  createNote,
  softDeleteNote,
  permanentDeleteNote,
  restoreNote,
  batchCreateNotes,
} from '../db/repositories/noteRepo';
import { getBacklinksForDoc } from '../db/repositories/documentLinkRepo';
import { renderSafeMarkdown } from '../utils/markdown';
import { NoteEditor } from '../components/notes/NoteEditor';
import { NoteDetailModal } from '../components/notes/NoteDetailModal';
import { QuickNoteEntry } from '../components/notes/QuickNoteEntry';
import { PageHeader } from '../components/common/PageHeader';
import { openNotesPopout } from '../utils/notesPopout';

import { DocFolderTree, type QuickFilterKey } from '../components/notes/DocFolderTree';
import { DocListPane } from '../components/notes/DocListPane';
import { DocEditorPane } from '../components/notes/DocEditorPane';
import { ZipImportPreviewModal } from '../components/notes/ZipImportPreviewModal';

const { Text } = Typography;

export interface NotesViewProps {
  db?: TaskPlannerDatabase | undefined;
}

export type NotesLayoutMode = '3column' | 'grid';

const LAYOUT_PREF_KEY = 'planner:docs_layout_view';
const FOLDER_PREF_KEY = 'planner:docs_active_folder';

export const NotesView: React.FC<NotesViewProps> = ({ db = defaultDb }) => {
  // Layout mode: 3-column Docs app vs classic Grid View
  const [layoutMode, setLayoutMode] = useState<NotesLayoutMode>(() => {
    try {
      return (localStorage.getItem(LAYOUT_PREF_KEY) as NotesLayoutMode) || '3column';
    } catch {
      return '3column';
    }
  });

  const [activeFilter, setActiveFilter] = useState<QuickFilterKey | string>(() => {
    try {
      return localStorage.getItem(FOLDER_PREF_KEY) || 'inbox';
    } catch {
      return 'inbox';
    }
  });

  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Legacy grid view state
  const [searchText, setSearchText] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<'all' | 'standalone' | NoteEntityType>('all');
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(undefined);
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // Save preferences
  const handleLayoutModeChange = (mode: NotesLayoutMode) => {
    setLayoutMode(mode);
    try {
      localStorage.setItem(LAYOUT_PREF_KEY, mode);
    } catch {}
  };

  const handleFilterChange = (filter: QuickFilterKey | string) => {
    setActiveFilter(filter);
    try {
      localStorage.setItem(FOLDER_PREF_KEY, filter);
    } catch {}
  };

  // Fetch all notes from database
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

  // Fetch note attachments for search
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

  // Compute docs matching current navigation filter / tag in 3-column mode
  const filteredDocList = useMemo(() => {
    if (!allNotes) return [];

    return allNotes.filter((note) => {
      // 1. Tag filter if selected
      if (activeTag) {
        if (!note.tags?.includes(activeTag)) return false;
      }

      // 2. Navigation quick filters
      if (activeFilter === 'trash') {
        return Boolean(note.deletedAt);
      }

      // Remaining filters require not deleted
      if (note.deletedAt) return false;

      if (activeFilter === 'inbox') {
        return !note.parentId && (note.type === 'document' || !note.type);
      }
      if (activeFilter === 'pinned') {
        return Boolean(note.isPinned);
      }
      if (activeFilter === 'all') {
        return note.type === 'document' || !note.type;
      }
      if (activeFilter === 'quick_notes') {
        return note.type === 'quick_note';
      }

      // Specific folder ID
      return note.parentId === activeFilter;
    });
  }, [allNotes, activeFilter, activeTag]);

  // Selected document instance for editor pane
  const activeDocument = useMemo(() => {
    if (!allNotes) return null;
    if (selectedDocId) {
      const found = allNotes.find((n) => n.id === selectedDocId);
      if (found) return found;
    }
    // Default to first doc if available
    return filteredDocList[0] || null;
  }, [allNotes, selectedDocId, filteredDocList]);

  // Current selected folder note if viewing a specific folder
  const currentFolder = useMemo(() => {
    if (!allNotes || typeof activeFilter !== 'string') return null;
    return allNotes.find((n) => n.id === activeFilter && n.type === 'folder') || null;
  }, [allNotes, activeFilter]);

  // Create new document action (supports explicit target folder)
  const handleCreateDocument = async (targetFolderId?: string) => {
    const effectiveFolderId =
      targetFolderId ??
      (typeof activeFilter === 'string' && !['inbox', 'pinned', 'all', 'quick_notes', 'trash'].includes(activeFilter)
        ? activeFilter
        : undefined);

    try {
      const newDoc = await createNote(
        {
          title: 'Tài liệu mới',
          body: '# Tài liệu mới\n\nBắt đầu viết nội dung tại đây...',
          type: 'document',
          parentId: effectiveFolderId,
          tags: activeTag ? [activeTag] : [],
        },
        db
      );

      // If document was created in a folder, switch view to that folder so doc is immediately visible
      if (effectiveFolderId && activeFilter !== effectiveFolderId) {
        handleFilterChange(effectiveFolderId);
      }

      setSelectedDocId(newDoc.id);
      message.success('Đã tạo tài liệu mới');
    } catch {
      message.error('Không thể tạo tài liệu');
    }
  };

  // Create folder action (supports root & subfolder)
  const handleCreateFolder = async (name: string, parentId?: string): Promise<Note> => {
    try {
      const newFolder = await createNote(
        {
          title: name,
          body: '',
          type: 'folder',
          parentId: parentId || undefined,
        },
        db
      );
      handleFilterChange(newFolder.id);
      message.success(`Đã tạo thư mục "${name}"`);
      return newFolder;
    } catch (err) {
      message.error('Không thể tạo thư mục');
      throw err;
    }
  };

  // Rename folder action
  const handleRenameFolder = async (folderId: string, newName: string) => {
    try {
      await updateNote(folderId, { title: newName }, db);
      message.success(`Đã đổi tên thư mục thành "${newName}"`);
    } catch {
      message.error('Không thể đổi tên thư mục');
    }
  };

  // Delete folder action (reassigns child documents to Inbox and deletes folder and subfolders so work is never lost)
  const handleDeleteFolder = async (folder: Note) => {
    const getAllDescendantFolderIds = (parentId: string): string[] => {
      const children = (allNotes || []).filter(
        (n) => n.type === 'folder' && n.parentId === parentId && !n.deletedAt
      );
      return [parentId, ...children.flatMap((c) => getAllDescendantFolderIds(c.id))];
    };
    const folderIdsToDelete = getAllDescendantFolderIds(folder.id);
    const affectedDocs = (allNotes || []).filter(
      (n) => n.type !== 'folder' && folderIdsToDelete.includes(n.parentId || '') && !n.deletedAt
    );

    Modal.confirm({
      title: `Xóa thư mục "${folder.title || 'Không tên'}"?`,
      content:
        affectedDocs.length > 0
          ? `Thư mục (và các thư mục con) đang chứa ${affectedDocs.length} tài liệu. Các tài liệu này sẽ được chuyển về Inbox (không bị xóa).`
          : 'Bạn có chắc chắn muốn xóa thư mục này?',
      okText: 'Xóa thư mục',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          for (const child of affectedDocs) {
            await updateNote(child.id, { parentId: null }, db);
          }
          for (const fId of folderIdsToDelete) {
            await permanentDeleteNote(fId, db);
          }
          if (folderIdsToDelete.includes(typeof activeFilter === 'string' ? activeFilter : '')) {
            handleFilterChange('inbox');
          }
          message.success('Đã xóa thư mục');
        } catch {
          message.error('Không thể xóa thư mục');
        }
      },
    });
  };

  // Hierarchical folder options with indentation and breadcrumb path
  const hierarchicalFolderOptions = useMemo(() => {
    const folders = (allNotes || []).filter((n) => n.type === 'folder' && !n.deletedAt);
    const map = new Map<string, { note: Note; depth: number; path: string }>();
    const roots = folders.filter((f) => !f.parentId || !folders.some((p) => p.id === f.parentId));

    const traverse = (node: Note, depth: number, parentPath: string) => {
      const currentPath = parentPath ? `${parentPath} / ${node.title}` : node.title || 'Không tên';
      map.set(node.id, { note: node, depth, path: currentPath });
      const children = folders.filter((f) => f.parentId === node.id);
      children.forEach((c) => traverse(c, depth + 1, currentPath));
    };
    roots.forEach((r) => traverse(r, 0, ''));
    return Array.from(map.values());
  }, [allNotes]);

  // Folder breadcrumb path for currently viewed folder
  const folderPath = useMemo(() => {
    if (!currentFolder || !allNotes) return [];
    const path: Note[] = [currentFolder];
    let curr = currentFolder.parentId;
    while (curr) {
      const parent = allNotes.find((n) => n.id === curr && n.type === 'folder' && !n.deletedAt);
      if (parent) {
        path.unshift(parent);
        curr = parent.parentId;
      } else {
        break;
      }
    }
    return path;
  }, [currentFolder, allNotes]);

  // Move document to folder state & action
  const [movingDoc, setMovingDoc] = useState<Note | null>(null);
  const [targetFolderSelect, setTargetFolderSelect] = useState<string | null>(null);

  const handleOpenMoveDocModal = (doc: Note) => {
    setMovingDoc(doc);
    setTargetFolderSelect(doc.parentId || null);
  };

  const handleConfirmMoveDoc = async () => {
    if (!movingDoc) return;
    try {
      await updateNote(movingDoc.id, { parentId: targetFolderSelect }, db);
      message.success('Đã chuyển thư mục thành công');
      setMovingDoc(null);
    } catch {
      message.error('Không thể chuyển thư mục');
    }
  };

  // Move folder to another folder state & action (with cycle prevention)
  const [movingFolder, setMovingFolder] = useState<Note | null>(null);
  const [targetParentFolderSelect, setTargetParentFolderSelect] = useState<string | null>(null);

  const handleOpenMoveFolderModal = (folder: Note) => {
    setMovingFolder(folder);
    setTargetParentFolderSelect(folder.parentId || null);
  };

  // Prevent cycle: folder cannot be moved into itself or its descendants
  const invalidTargetFolderIds = useMemo(() => {
    if (!movingFolder || !allNotes) return new Set<string>();
    const invalid = new Set<string>([movingFolder.id]);
    const getDescendants = (parentId: string) => {
      const children = allNotes.filter(
        (n) => n.type === 'folder' && n.parentId === parentId && !n.deletedAt
      );
      for (const c of children) {
        invalid.add(c.id);
        getDescendants(c.id);
      }
    };
    getDescendants(movingFolder.id);
    return invalid;
  }, [movingFolder, allNotes]);

  const handleConfirmMoveFolder = async () => {
    if (!movingFolder) return;
    try {
      await updateNote(movingFolder.id, { parentId: targetParentFolderSelect }, db);
      message.success('Đã di chuyển thư mục thành công');
      setMovingFolder(null);
    } catch {
      message.error('Không thể di chuyển thư mục');
    }
  };

  // Zip Import state & triggers
  const [zipImportModalOpen, setZipImportModalOpen] = useState(false);
  const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
  const zipFileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenZipImport = () => {
    if (zipFileInputRef.current) {
      zipFileInputRef.current.value = '';
      zipFileInputRef.current.click();
    }
  };

  const handleZipFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedZipFile(file);
      setZipImportModalOpen(true);
    }
  };

  const handleBatchImportDocs = async (
    docsToImport: Array<{ title: string; body: string; parentId?: string | undefined }>,
    destinationFolderId?: string
  ) => {
    await batchCreateNotes(
      docsToImport.map((d) => ({
        title: d.title,
        body: d.body,
        type: 'document',
        ...(d.parentId ? { parentId: d.parentId } : {}),
      })),
      db
    );
    if (destinationFolderId) {
      handleFilterChange(destinationFolderId);
    }
  };

  // Available folders for move action
  const availableFolders = useMemo(() => {
    return (allNotes || []).filter((n) => n.type === 'folder' && !n.deletedAt);
  }, [allNotes]);

  // Update document action
  const handleUpdateDocument = async (id: string, updates: Partial<Note>) => {
    try {
      await updateNote(id, updates, db);
    } catch (err) {
      console.warn('Failed to update doc:', err);
    }
  };

  // Delete document action (soft delete vs permanent delete with backlinks warning)
  const handleDeleteDocument = async (note: Note) => {
    if (note.deletedAt) {
      // In trash: Check backlinks before permanent delete (D-17)
      try {
        const backlinks = await getBacklinksForDoc(note.id, db);
        const backlinkCount = backlinks.tasks.length + backlinks.projects.length + backlinks.referencingNotes.length;

        if (backlinkCount > 0) {
          Modal.confirm({
            title: 'Cảnh báo xóa vĩnh viễn',
            content: `Tài liệu "${note.title || 'Không tiêu đề'}" đang được ${backlinkCount} mục liên kết (Tasks/Projects). Vẫn tiếp tục xóa vĩnh viễn?`,
            okText: 'Xóa vĩnh viễn',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: async () => {
              await permanentDeleteNote(note.id, db);
              message.success('Đã xóa vĩnh viễn tài liệu');
              if (selectedDocId === note.id) setSelectedDocId(null);
            },
          });
          return;
        }

        await permanentDeleteNote(note.id, db);
        message.success('Đã xóa vĩnh viễn tài liệu');
        if (selectedDocId === note.id) setSelectedDocId(null);
      } catch {
        message.error('Không thể xóa vĩnh viễn');
      }
    } else {
      // Move to trash (soft delete)
      try {
        await softDeleteNote(note.id, db);
        message.success('Đã chuyển tài liệu vào thùng rác');
        if (selectedDocId === note.id) setSelectedDocId(null);
      } catch {
        message.error('Không thể chuyển vào thùng rác');
      }
    }
  };

  // Restore document action
  const handleRestoreDocument = async (note: Note) => {
    try {
      await restoreNote(note.id, db);
      message.success(`Đã khôi phục tài liệu "${note.title || 'Không tiêu đề'}"`);
    } catch {
      message.error('Không thể khôi phục tài liệu');
    }
  };

  // Filter notes for legacy grid view
  const filteredGridNotes = useMemo(() => {
    if (!allNotes) return [];

    const lowerSearch = searchText.trim().toLowerCase();

    return allNotes.filter((note) => {
      if (note.deletedAt) return false;

      // 1. Entity Filter
      if (entityFilter === 'standalone') {
        if (note.entityType) return false;
      } else if (entityFilter !== 'all') {
        if (note.entityType !== entityFilter) return false;
        if (selectedEntityId && note.entityId !== selectedEntityId) {
          return false;
        }
      } else if (selectedEntityId) {
        if (note.entityId !== selectedEntityId) {
          return false;
        }
      }

      // 2. Search Text
      if (!lowerSearch) return true;

      const titleMatch = note.title?.toLowerCase().includes(lowerSearch);
      const bodyMatch = note.body.toLowerCase().includes(lowerSearch);

      const attTexts = noteAttachmentMeta.searchTexts.get(note.id) || [];
      const attachmentMatch = attTexts.some((t) => t.includes(lowerSearch));

      const parentName = note.entityType && note.entityId
        ? entityNames?.get(`${note.entityType}:${note.entityId}`)
        : undefined;
      const parentMatch = parentName ? parentName.toLowerCase().includes(lowerSearch) : false;

      return Boolean(titleMatch || bodyMatch || attachmentMatch || parentMatch);
    });
  }, [allNotes, searchText, entityFilter, selectedEntityId, noteAttachmentMeta, entityNames]);

  const handleOpenPopout = () => {
    openNotesPopout().catch((err) => {
      console.warn('Failed to open notes popout:', err);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 84px)', overflow: 'hidden' }}>
      {/* 1. Header with Mode Toggle */}
      <PageHeader
        title="Ghi chú & Tài liệu"
        subtitle="Hệ thống quản lý tri thức, tài liệu Markdown và ghi chú nhanh cá nhân"
        extra={
          <Space>
            <Segmented
              value={layoutMode}
              onChange={(val) => handleLayoutModeChange(val as NotesLayoutMode)}
              options={[
                { value: '3column', icon: <UnorderedListOutlined />, label: 'Docs (3 Cột)' },
                { value: 'grid', icon: <AppstoreOutlined />, label: 'Ghi chú nhanh (Grid)' },
              ]}
            />
            <Tooltip title="Mở danh sách ghi chú trong cửa sổ nổi riêng biệt (Always on Top)">
              <Button icon={<ExportOutlined />} onClick={handleOpenPopout}>
                Cửa sổ nổi
              </Button>
            </Tooltip>
            {layoutMode === 'grid' && (
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
            )}
          </Space>
        }
      />

      {/* 2. Main View Mode */}
      {layoutMode === '3column' ? (
        <div
          className="docs-3column-layout"
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            overflow: 'hidden',
            backgroundColor: '#ffffff',
          }}
        >
          {/* Column 1: Folder Tree (~240px) */}
          <DocFolderTree
            notes={allNotes || []}
            activeFilter={activeFilter}
            onSelectFilter={handleFilterChange}
            onCreateDoc={handleCreateDocument}
            onCreateFolder={async (name, parentId) => {
              await handleCreateFolder(name, parentId);
            }}
            onRenameFolder={handleRenameFolder}
            onMoveFolder={handleOpenMoveFolderModal}
            onDeleteFolder={handleDeleteFolder}
            onOpenZipImport={handleOpenZipImport}
            activeTag={activeTag}
            onSelectTag={setActiveTag}
          />

          {/* Column 2: Document List (~300px) */}
          <DocListPane
            notes={filteredDocList}
            selectedDocId={activeDocument?.id ?? null}
            onSelectDoc={(doc) => setSelectedDocId(doc.id)}
            onTogglePin={(doc) => handleUpdateDocument(doc.id, { isPinned: !doc.isPinned })}
            onMoveToFolder={handleOpenMoveDocModal}
            onDeleteDoc={handleDeleteDocument}
            onRestoreDoc={handleRestoreDocument}
            currentFolder={currentFolder}
            folderPath={folderPath}
            onNavigateFolder={(id) => handleFilterChange(id)}
            onCreateDoc={() => handleCreateDocument(currentFolder?.id)}
          />

          {/* Column 3: Editor / Reader Split Pane */}
          <DocEditorPane
            doc={activeDocument}
            onUpdateDoc={handleUpdateDocument}
            onDeleteDoc={handleDeleteDocument}
            onRestoreDoc={handleRestoreDocument}
            onSelectDoc={(id) => setSelectedDocId(id)}
            db={db}
          />
        </div>
      ) : (
        /* Legacy Grid View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', padding: '4px 0' }}>
          {/* Filter Controls */}
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
              onChange={(val) => {
                setEntityFilter(val);
                setSelectedEntityId(undefined);
              }}
              style={{ width: 180 }}
              options={[
                { label: 'Tất cả ghi chú', value: 'all' },
                { label: 'Ghi chú độc lập', value: 'standalone' },
                { label: 'Gắn với Tác vụ', value: 'task' },
                { label: 'Gắn với Dự án', value: 'project' },
                { label: 'Gắn với Cột mốc', value: 'milestone' },
              ]}
            />
          </div>

          <QuickNoteEntry db={db} />

          {/* Grid Cards */}
          {filteredGridNotes.length === 0 ? (
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
              {filteredGridNotes.map((note) => {
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
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedNote(note)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {note.isPinned && <Tag color="blue">Đã ghim</Tag>}
                          {note.entityType && <Tag color="purple">{note.entityType}: {entityLabel || note.entityId}</Tag>}
                          {!note.entityType && <Tag>Độc lập</Tag>}
                          {attCount > 0 && <Tag icon={<PaperClipOutlined />}>{attCount} ảnh</Tag>}
                        </div>
                        <Typography.Title level={5} style={{ marginTop: 6, marginBottom: 0 }}>
                          {note.title || '(Không tiêu đề)'}
                        </Typography.Title>
                      </div>

                      <Space size={2}>
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingNote(note);
                            setEditorOpen(true);
                          }}
                        />
                        <Popconfirm
                          title="Xóa ghi chú này?"
                          onConfirm={() => deleteNote(note.id, db)}
                          okText="Xóa"
                          cancelText="Hủy"
                        >
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Popconfirm>
                      </Space>
                    </div>

                    <div
                      style={{ maxHeight: 180, overflowY: 'auto', fontSize: 13, lineHeight: '1.6', color: '#434343' }}
                      dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(note.body) }}
                    />
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Note Detail Modal */}
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

      {/* Note Editor Modal */}
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

      {/* Move Document to Folder Modal */}
      <Modal
        title={`Chuyển "${movingDoc?.title || 'Tài liệu'}" sang thư mục`}
        open={Boolean(movingDoc)}
        onOk={handleConfirmMoveDoc}
        onCancel={() => setMovingDoc(null)}
        okText="Chuyển"
        cancelText="Hủy"
      >
        <div style={{ padding: '8px 0' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Chọn thư mục đích:
          </Text>
          <Select
            style={{ width: '100%' }}
            value={targetFolderSelect ?? ''}
            onChange={(val) => setTargetFolderSelect(val || null)}
            options={[
              { value: '', label: '📥 Inbox (Không nằm trong thư mục nào)' },
              ...hierarchicalFolderOptions.map(({ note, depth, path }) => ({
                value: note.id,
                label: `${'— '.repeat(depth)}📁 ${path}`,
              })),
            ]}
          />
        </div>
      </Modal>

      {/* Move Folder to Another Folder Modal (Cycle Prevention) */}
      <Modal
        title={`Di chuyển thư mục "${movingFolder?.title || 'Không tên'}"`}
        open={Boolean(movingFolder)}
        onOk={handleConfirmMoveFolder}
        onCancel={() => setMovingFolder(null)}
        okText="Di chuyển"
        cancelText="Hủy"
      >
        <div style={{ padding: '8px 0' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Chọn thư mục cha mới:
          </Text>
          <Select
            style={{ width: '100%' }}
            value={targetParentFolderSelect ?? ''}
            onChange={(val) => setTargetParentFolderSelect(val || null)}
            options={[
              { value: '', label: '📁 Thư mục gốc (Root)' },
              ...hierarchicalFolderOptions
                .filter(({ note }) => !invalidTargetFolderIds.has(note.id))
                .map(({ note, depth, path }) => ({
                  value: note.id,
                  label: `${'— '.repeat(depth)}📁 ${path}`,
                })),
            ]}
          />
        </div>
      </Modal>

      {/* Hidden file input for zip upload */}
      <input
        type="file"
        ref={zipFileInputRef}
        accept=".zip"
        style={{ display: 'none' }}
        onChange={handleZipFileSelected}
      />

      {/* Zip Import Preview Modal */}
      <ZipImportPreviewModal
        open={zipImportModalOpen}
        onClose={() => {
          setZipImportModalOpen(false);
          setSelectedZipFile(null);
        }}
        zipFile={selectedZipFile}
        folders={availableFolders}
        currentFolderId={typeof activeFilter === 'string' && availableFolders.some((f) => f.id === activeFilter) ? activeFilter : null}
        onImportDocs={handleBatchImportDocs}
        onCreateFolder={handleCreateFolder}
      />
    </div>
  );
};
