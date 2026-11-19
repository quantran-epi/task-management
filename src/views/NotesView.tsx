import React, { useState, useMemo, useEffect } from 'react';
import {
  Button,
  Space,
  Typography,
  Empty,
  Tooltip,
  message,
  Modal,
  Select,
} from 'antd';
import {
  PlusOutlined,
  ExportOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { Note } from '../types/models';
import {
  updateNote,
  createNote,
  softDeleteNote,
  permanentDeleteNote,
  restoreNote,
  bulkPermanentDeleteNotes,
} from '../db/repositories/noteRepo';
import { getBacklinksForDoc } from '../db/repositories/documentLinkRepo';
import { PageHeader } from '../components/common/PageHeader';
import { openNotesPopout } from '../utils/notesPopout';
import { getDocumentPublishStatuses, type DocumentPublishStatus } from '../db/repositories/documentSetRepo';
import { DocsLibraryActions } from '../components/notes/DocsLibraryActions';
export { AI_KNOWLEDGE_DOC_PROMPT } from '../components/notes/DocsLibraryActions';

import { DocFolderTree } from '../components/notes/DocFolderTree';
import { DocEditorPane } from '../components/notes/DocEditorPane';
import { MermaidAssistantView } from './MermaidAssistantView';
import { downloadFolderAsZip } from '../utils/exportFolderZip';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { useLayoutStore } from '../workbench/store/layoutStore';
import { DocSetLibrary } from '../workbench/DocSetLibrary';
import { ResizeSplitter } from '../components/common/ResizeSplitter';

const { Text } = Typography;

export const RECOMMENDED_DOC_TEMPLATE = `# Tiêu đề nghiệp vụ hoặc thành phần

#domain-tag #system-tag

## Tóm tắt
Mô tả ngắn gọn mục đích và câu hỏi nghiệp vụ mà tài liệu này giải quyết.

## Phạm vi
Phạm vi áp dụng của quy tắc hoặc thành phần này.

## Thuật ngữ
- **Thuật ngữ A**: Định nghĩa ngắn gọn, chính xác.
- **Thuật ngữ B**: Định nghĩa ngắn gọn, chính xác.

## Quy tắc
1. Quy tắc thứ nhất (ghi rõ điều kiện và kết quả).
2. Quy tắc thứ hai.

## Luồng xử lý
1. Bước 1: Hành động cụ thể.
2. Bước 2: Hành động tiếp theo.

## Các bước thực thi & Quan hệ thành phần
| THU_TU | TEN_BUOC | TARGET | WRITES | GHI_CHU |
|---|---|---|---|---|
| 1 | Khởi tạo quy trình | \`MAIN1.PKG_EXAMPLE.INIT\` | \`MAIN1.TBL_STAGING\` | Nạp dữ liệu vào bảng tạm |
| 2 | Xử lý nghiệp vụ chính | \`MAIN1.PKG_EXAMPLE.PROCESS\` | \`MAIN1.TBL_CORE_DATA\` | Cập nhật bảng nghiệp vụ chính |

## Trạng thái và mã lỗi
| Mã | Ý nghĩa | Hành động xử lý |
|---|---|---|
| 00 | Thành công | Tiếp tục quy trình |
| 05 | Từ chối | Kiểm tra điều kiện |

## Ví dụ
Mô tả ví dụ đầu vào cụ thể và kết quả mong đợi.

## Ngoại lệ
Các trường hợp đặc biệt không áp dụng luồng tiêu chuẩn.

## Nguồn
- Tài liệu/Ticket tham chiếu: SD-XXXXX / PROC_NAME
- Ngày xác minh: YYYY-MM-DD`;

export interface NotesViewProps {
  db?: TaskPlannerDatabase | undefined;
  initialDocId?: string | undefined;
  hideFolderTree?: boolean | undefined;
}

const FOLDER_PREF_KEY = 'planner:docs_active_folder';
const TREE_WIDTH_PREF_KEY = 'planner:docs_tree_width';
const DEFAULT_TREE_WIDTH = 320;
const MIN_TREE_WIDTH = 220;
const MAX_TREE_WIDTH = 600;

export const NotesView: React.FC<NotesViewProps> = ({
  db = defaultDb,
  initialDocId,
  hideFolderTree = false,
}) => {
  const [treeWidth, setTreeWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(TREE_WIDTH_PREF_KEY);
      if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val >= MIN_TREE_WIDTH && val <= MAX_TREE_WIDTH) {
          return val;
        }
      }
    } catch {}
    return DEFAULT_TREE_WIDTH;
  });

  const handleTreeResize = (newWidth: number) => {
    setTreeWidth(newWidth);
    try {
      localStorage.setItem(TREE_WIDTH_PREF_KEY, String(newWidth));
    } catch {}
  };

  const handleTreeReset = () => {
    setTreeWidth(DEFAULT_TREE_WIDTH);
    try {
      localStorage.setItem(TREE_WIDTH_PREF_KEY, String(DEFAULT_TREE_WIDTH));
    } catch {}
  };

  const [activeFilter, setActiveFilter] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(FOLDER_PREF_KEY);
      return stored && stored !== 'inbox' && stored !== 'all' ? stored : 'root_docs';
    } catch {
      return 'root_docs';
    }
  });

  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(initialDocId ?? null);
  const [activeDrawerTaskId, setActiveDrawerTaskId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const openTab = useLayoutStore((s) => s.openTab);

  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    setSelectedDocId(null);
    try {
      localStorage.setItem(FOLDER_PREF_KEY, filter);
    } catch {}
  };

  // Sync selectedDocId when initialDocId prop changes
  useEffect(() => {
    if (initialDocId) {
      setSelectedDocId(initialDocId);
    }
  }, [initialDocId]);

  // Sync selectedDocId from hash change (e.g. #/notes?doc=...)
  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash;
      const match = hash.match(/[?&]doc=([^&]+)/);
      if (match && match[1]) {
        try {
          const docId = decodeURIComponent(match[1]);
          if (docId) {
            setSelectedDocId(docId);
          }
        } catch {
          // ignore uri decode error
        }
      }
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, []);

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

  // Auto-switch activeFilter to document's parent folder or special folder when selectedDocId is set
  useEffect(() => {
    if (!selectedDocId || !allNotes) return;
    const doc = allNotes.find((n) => n.id === selectedDocId);
    if (doc) {
      const targetFilter = doc.deletedAt
        ? 'trash'
        : doc.type === 'quick_note'
          ? 'quick_notes'
          : doc.parentId || 'root_docs';
      setActiveFilter(targetFilter);
    }
  }, [selectedDocId, allNotes]);

  // Tree renders metadata-only records. Full Markdown remains available for editor/admin flows.
  // ponytail: split full-note hydration into dedicated repository queries when non-tree flows stop needing allNotes.
  const treeNotes = useMemo(
    () => (allNotes ?? []).map((note) => ({ ...note, body: '' })),
    [allNotes]
  );
  const loadSearchNotes = React.useCallback(async () => db.notes.toArray(), [db]);

  // Selected document instance for editor pane
  const activeDocument = useMemo(() => {
    if (!allNotes || !selectedDocId) return null;
    const found = allNotes.find((n) => n.id === selectedDocId && n.type !== 'folder');
    return found || null;
  }, [allNotes, selectedDocId]);

  const publishStatuses = useLiveQuery(async () => {
    const documentIds = (allNotes ?? [])
      .filter((note) => note.type !== 'folder' && note.type !== 'diagram' && !note.deletedAt)
      .map((note) => note.id);
    return getDocumentPublishStatuses(documentIds, db);
  }, [db, allNotes]) as Record<string, DocumentPublishStatus> | undefined;

  // Current selected folder note if viewing a specific folder
  const currentFolder = useMemo(() => {
    if (!allNotes || typeof activeFilter !== 'string') return null;
    return allNotes.find((n) => n.id === activeFilter && n.type === 'folder') || null;
  }, [allNotes, activeFilter]);

  // Create new document action (supports explicit target folder)
  const handleCreateDocument = async (targetFolderId?: string) => {
    const isQuickNoteMode = activeFilter === 'quick_notes' && !targetFolderId;
    const effectiveFolderId =
      targetFolderId ??
      (typeof activeFilter === 'string' && !['root_docs', 'pinned', 'quick_notes', 'trash'].includes(activeFilter)
        ? activeFilter
        : undefined);

    try {
      const newDoc = await createNote(
        isQuickNoteMode
          ? {
              title: 'Ghi chú nhanh mới',
              body: '',
              type: 'quick_note',
              parentId: undefined,
              tags: activeTag ? [activeTag] : [],
            }
          : {
              title: 'Tài liệu mới',
              body: RECOMMENDED_DOC_TEMPLATE,
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
      message.success(isQuickNoteMode ? 'Đã tạo ghi chú nhanh mới' : 'Đã tạo tài liệu mới');
    } catch {
      message.error(isQuickNoteMode ? 'Không thể tạo ghi chú nhanh' : 'Không thể tạo tài liệu');
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

  // Delete folder action (reassigns child documents to Inbox and deletes folder and subfolders)
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

  // Recursive delete folder action: permanently deletes folder, all subfolders and all contained documents
  const handleDeleteFolderRecursive = async (folder: Note) => {
    const getAllDescendantFolderIds = (parentId: string): string[] => {
      const children = (allNotes || []).filter(
        (n) => n.type === 'folder' && n.parentId === parentId && !n.deletedAt
      );
      return [parentId, ...children.flatMap((c) => getAllDescendantFolderIds(c.id))];
    };
    const folderIdsToDelete = getAllDescendantFolderIds(folder.id);
    const affectedDocs = (allNotes || []).filter(
      (n) => n.type !== 'folder' && folderIdsToDelete.includes(n.parentId || '')
    );
    const totalItems = folderIdsToDelete.length + affectedDocs.length;
    const subfolderCount = folderIdsToDelete.length - 1;

    Modal.confirm({
      title: `Xóa vĩnh viễn toàn bộ thư mục "${folder.title || 'Không tên'}"?`,
      content: (
        <div>
          <p style={{ color: '#dc2626', fontWeight: 600, marginBottom: 8 }}>
            Hành động này KHÔNG THỂ hoàn tác!
          </p>
          <p style={{ margin: 0 }}>
            Sẽ xóa vĩnh viễn thư mục này
            {subfolderCount > 0 ? `, ${subfolderCount} thư mục con` : ''} và{' '}
            <strong>{affectedDocs.length} tài liệu/file</strong> bên trong.
          </p>
        </div>
      ),
      okText: `Xóa vĩnh viễn (${totalItems} mục)`,
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          const docIdsToDelete = affectedDocs.map((d) => d.id);
          const allIdsToDelete = [...folderIdsToDelete, ...docIdsToDelete];

          await bulkPermanentDeleteNotes(allIdsToDelete, db);

          if (selectedDocId && docIdsToDelete.includes(selectedDocId)) {
            setSelectedDocId(null);
          }

          if (folderIdsToDelete.includes(typeof activeFilter === 'string' ? activeFilter : '')) {
            handleFilterChange('root_docs');
          }
          message.success(`Đã xóa vĩnh viễn thư mục và ${affectedDocs.length} tài liệu`);
        } catch {
          message.error('Không thể xóa thư mục');
        }
      },
    });
  };

  // Special folder clear/empty handlers
  const handleEmptyTrash = async () => {
    const trashItems = (allNotes || []).filter((n) => Boolean(n.deletedAt));
    if (trashItems.length === 0) return;

    Modal.confirm({
      title: 'Dọn sạch thùng rác?',
      content: `Sẽ xóa vĩnh viễn ${trashItems.length} mục trong thùng rác. Hành động này không thể hoàn tác!`,
      okText: `Xóa vĩnh viễn (${trashItems.length})`,
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          const ids = trashItems.map((n) => n.id);
          await bulkPermanentDeleteNotes(ids, db);
          if (selectedDocId && ids.includes(selectedDocId)) {
            setSelectedDocId(null);
          }
          message.success('Đã dọn sạch thùng rác');
        } catch {
          message.error('Không thể dọn sạch thùng rác');
        }
      },
    });
  };

  const handleClearSpecialFolder = async (
    specialKey: 'root_docs' | 'quick_notes',
    title: string
  ) => {
    const targetNotes = (allNotes || []).filter((n) => {
      if (n.deletedAt) return false;
      if (specialKey === 'root_docs') {
        return !n.parentId && n.type !== 'folder' && n.type !== 'quick_note';
      }
      if (specialKey === 'quick_notes') {
        return n.type === 'quick_note';
      }
      return false;
    });

    if (targetNotes.length === 0) return;

    Modal.confirm({
      title: `Xóa tất cả trong "${title}"?`,
      content: `Chuyển toàn bộ ${targetNotes.length} tài liệu vào thùng rác?`,
      okText: 'Chuyển vào thùng rác',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          for (const doc of targetNotes) {
            await softDeleteNote(doc.id, db);
          }
          if (selectedDocId && targetNotes.some((d) => d.id === selectedDocId)) {
            setSelectedDocId(null);
          }
          message.success(`Đã chuyển ${targetNotes.length} tài liệu vào thùng rác`);
        } catch {
          message.error('Không thể xóa tài liệu');
        }
      },
    });
  };

  const handleUnpinAll = async () => {
    const pinned = (allNotes || []).filter((n) => n.isPinned && !n.deletedAt);
    if (pinned.length === 0) return;

    try {
      for (const doc of pinned) {
        await updateNote(doc.id, { isPinned: false }, db);
      }
      message.success(`Đã bỏ ghim ${pinned.length} tài liệu`);
    } catch {
      message.error('Không thể bỏ ghim tài liệu');
    }
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
      try {
        const backlinks = await getBacklinksForDoc(note.id, db);
        const backlinkCount = backlinks.tasks.length + backlinks.changeRequests.length + backlinks.referencingNotes.length;

        if (backlinkCount > 0) {
          Modal.confirm({
            title: 'Cảnh báo xóa vĩnh viễn',
            content: `Tài liệu "${note.title || 'Không tiêu đề'}" đang được ${backlinkCount} mục liên kết (Tasks/CRs). Vẫn tiếp tục xóa vĩnh viễn?`,
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

  const handleDownloadFolder = async (folder: Note) => {
    await downloadFolderAsZip(folder, allNotes || (await db.notes.toArray()));
  };

  const handleOpenPopout = () => {
    openNotesPopout().catch((err) => {
      console.warn('Failed to open notes popout:', err);
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: hideFolderTree ? '100%' : 'calc(100vh - 84px)',
        overflow: 'hidden',
      }}
    >
      {/* 1. Page Header (Hidden when embedded in workbench editor where tree is moved to left explorer) */}
      {!hideFolderTree && (
        <PageHeader
          title="Ghi chú & Tài liệu"
          subtitle="Hệ thống quản lý tri thức, tài liệu Markdown và ghi chú nhanh cá nhân"
          extra={
            <Space>
              <DocsLibraryActions
                db={db}
                notes={allNotes ?? []}
                currentFolderId={currentFolder?.id}
                onSelectFolder={handleFilterChange}
                onOpenLibrary={() => setLibraryOpen(true)}
              />
              <Tooltip title="Mở danh sách ghi chú trong cửa sổ nổi riêng biệt (Always on Top)">
                <Button icon={<ExportOutlined />} onClick={handleOpenPopout}>
                  Cửa sổ nổi
                </Button>
              </Tooltip>
            </Space>
          }
        />
      )}

      {/* 2. Main Workspace */}
      <div
        className="docs-2column-layout"
        style={{
          flex: 1,
          minHeight: 0,
          height: hideFolderTree ? '100%' : undefined,
          display: 'flex',
          border: hideFolderTree ? 'none' : '1px solid #f0f0f0',
          borderRadius: hideFolderTree ? 0 : 8,
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          width: '100%',
        }}
      >
        {/* Column 1: Searchable Tree Panel (resizable, hidden when docked in workbench) */}
        {!hideFolderTree && (
          <>
            <DocFolderTree
              notes={treeNotes}
              loadSearchNotes={loadSearchNotes}
              selectedDocId={activeDocument?.id ?? null}
              activeFilter={activeFilter}
              onSelectFilter={handleFilterChange}
              onSelectDoc={(doc) => setSelectedDocId(doc.id)}
              onCreateDoc={handleCreateDocument}
              onCreateFolder={async (name, parentId) => {
                await handleCreateFolder(name, parentId);
              }}
              onRenameFolder={handleRenameFolder}
              onMoveFolder={handleOpenMoveFolderModal}
              onDeleteFolder={handleDeleteFolder}
              onDeleteFolderRecursive={handleDeleteFolderRecursive}
              onEmptyTrash={handleEmptyTrash}
              onClearSpecialFolder={handleClearSpecialFolder}
              onUnpinAll={handleUnpinAll}
              onDownloadFolder={handleDownloadFolder}
              activeTag={activeTag}
              onSelectTag={setActiveTag}
              publishStatuses={publishStatuses}
              onTogglePin={(doc) => handleUpdateDocument(doc.id, { isPinned: !doc.isPinned })}
              onDeleteDoc={handleDeleteDocument}
              onRestoreDoc={handleRestoreDocument}
              onMoveDocToFolder={handleOpenMoveDocModal}
              width={treeWidth}
            />

            {/* Resizable Divider between Tree and Editor Pane */}
            <ResizeSplitter
              side="left"
              currentWidth={treeWidth}
              minWidth={MIN_TREE_WIDTH}
              maxWidth={MAX_TREE_WIDTH}
              defaultWidth={DEFAULT_TREE_WIDTH}
              onResize={handleTreeResize}
              onReset={handleTreeReset}
            />
          </>
        )}

        {/* Column 2: Document Editor Pane or Empty State */}
        <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {activeDocument ? (
            activeDocument.type === 'diagram' ? (
              <MermaidAssistantView key={activeDocument.id} noteId={activeDocument.id} db={db} />
            ) : (
            <DocEditorPane
              key={activeDocument.id}
              doc={activeDocument}
              onUpdateDoc={handleUpdateDocument}
              onDeleteDoc={handleDeleteDocument}
              onRestoreDoc={handleRestoreDocument}
              onSelectDoc={(id) => setSelectedDocId(id)}
              onOpenTask={(taskId) => setActiveDrawerTaskId(taskId)}
              onOpenCr={(crId) => {
                openTab({
                  id: `cr-${crId}`,
                  title: 'Change Request',
                  viewType: 'cr_detail',
                  closable: true,
                  params: { changeRequestId: crId },
                });
              }}
              db={db}
              publishStatus={publishStatuses?.[activeDocument.id]}
            />
            )
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 32,
                backgroundColor: '#ffffff',
              }}
            >
              <Empty
                image={<FileTextOutlined style={{ fontSize: 48, color: '#d1d5db' }} />}
                description={
                  <div style={{ marginTop: 8 }}>
                    <Text strong style={{ fontSize: 16, color: '#374151', display: 'block' }}>
                      Chưa chọn tài liệu
                    </Text>
                    <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
                      Chọn một tài liệu từ cây thư mục bên trái để xem và chỉnh sửa, hoặc tạo tài liệu mới.
                    </Text>
                  </div>
                }
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => handleCreateDocument()}
                  style={{ backgroundColor: '#4f46e5', marginTop: 12 }}
                >
                  Tạo tài liệu mới
                </Button>
              </Empty>
            </div>
          )}
        </div>
      </div>

      {/* Document-set library (classic shell has no tab host, so the same UI opens here) */}
      <Modal
        title="Bộ tài liệu"
        open={libraryOpen}
        onCancel={() => setLibraryOpen(false)}
        footer={null}
        width={1100}
        destroyOnHidden
        styles={{ body: { height: '70vh', padding: 0 } }}
      >
        <DocSetLibrary db={db} embedded />
      </Modal>

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

      {/* Move Folder to Folder Modal */}
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

      {/* Task Drawer when clicking linked task from editor */}
      <TaskDrawer
        open={Boolean(activeDrawerTaskId)}
        taskId={activeDrawerTaskId}
        onClose={() => setActiveDrawerTaskId(null)}
        db={db}
      />
    </div>
  );
};
