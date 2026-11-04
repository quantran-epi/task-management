import { useState, useCallback, useMemo, useEffect } from 'react';
import { Modal, message } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Note } from '../../types/models';
import {
  createNote,
  updateNote,
  softDeleteNote,
  permanentDeleteNote,
  restoreNote,
  bulkPermanentDeleteNotes,
} from '../../db/repositories/noteRepo';
import {
  getDocumentPublishStatuses,
  type DocumentPublishStatus,
} from '../../db/repositories/documentSetRepo';
import { RECOMMENDED_DOC_TEMPLATE } from '../../views/NotesView';
import { DocFolderTree } from '../../components/notes/DocFolderTree';
import { useLayoutStore } from '../store/layoutStore';

export interface DocsExplorerProps {
  db?: TaskPlannerDatabase | undefined;
}

export function DocsExplorer({ db = defaultDb }: DocsExplorerProps) {
  const openTab = useLayoutStore((s) => s.openTab);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const openTabs = useLayoutStore((s) => s.openTabs);
  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const [activeFilter, setActiveFilter] = useState<string>('root_docs');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [publishStatuses, setPublishStatuses] = useState<Record<string, DocumentPublishStatus>>({});

  const allNotes = useLiveQuery(
    async () => {
      const records = await db.notes.toArray();
      return records;
    },
    [db],
    []
  );

  const selectedDocId = useMemo(() => {
    if (activeTab?.viewType === 'notes' && activeTab.params?.doc) {
      return activeTab.params.doc;
    }
    return null;
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    const docIds = (allNotes || []).map((n) => n.id);
    if (docIds.length === 0) {
      setPublishStatuses({});
      return;
    }
    getDocumentPublishStatuses(docIds, db)
      .then((statuses) => {
        if (!cancelled) setPublishStatuses(statuses);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, allNotes]);

  const loadSearchNotes = useCallback(async () => {
    return await db.notes.toArray();
  }, [db]);

  const handleSelectDoc = useCallback(
    (doc: Note) => {
      openTab({
        id: `doc-${doc.id}`,
        title: doc.title || 'Untitled Note',
        viewType: 'notes',
        closable: true,
        params: { doc: doc.id },
      });
    },
    [openTab]
  );

  const handleCreateDoc = useCallback(
    async (targetFolderId?: string) => {
      try {
        const isQuickNote = activeFilter === 'quick_notes';
        const effectiveFolder =
          targetFolderId ||
          (activeFilter && !['pinned', 'quick_notes', 'trash', 'root_docs'].includes(activeFilter)
            ? activeFilter
            : undefined);

        const newDoc = await createNote(
          isQuickNote
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
                parentId: effectiveFolder,
                tags: activeTag ? [activeTag] : [],
              },
          db
        );

        if (effectiveFolder && activeFilter !== effectiveFolder) {
          setActiveFilter(effectiveFolder);
        }

        openTab({
          id: `doc-${newDoc.id}`,
          title: newDoc.title || 'Untitled Note',
          viewType: 'notes',
          closable: true,
          params: { doc: newDoc.id },
        });

        message.success(isQuickNote ? 'Đã tạo ghi chú nhanh mới' : 'Đã tạo tài liệu mới');
      } catch {
        message.error('Không thể tạo tài liệu');
      }
    },
    [activeFilter, activeTag, db, openTab]
  );

  const handleCreateFolder = useCallback(
    async (folderName: string, parentId?: string) => {
      try {
        const newFolder = await createNote(
          {
            title: folderName,
            body: '',
            type: 'folder',
            parentId: parentId || undefined,
          },
          db
        );
        setActiveFilter(newFolder.id);
        message.success(`Đã tạo thư mục "${folderName}"`);
      } catch {
        message.error('Không thể tạo thư mục');
      }
    },
    [db]
  );

  const handleRenameFolder = useCallback(
    async (folderId: string, newName: string) => {
      try {
        await updateNote(folderId, { title: newName }, db);
        message.success(`Đã đổi tên thư mục thành "${newName}"`);
      } catch {
        message.error('Không thể đổi tên thư mục');
      }
    },
    [db]
  );

  const handleDeleteFolder = useCallback(
    async (folder: Note) => {
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
            ? `Thư mục đang chứa ${affectedDocs.length} tài liệu. Các tài liệu này sẽ được chuyển về Thư mục gốc.`
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
            if (folderIdsToDelete.includes(activeFilter)) {
              setActiveFilter('root_docs');
            }
            message.success('Đã xóa thư mục');
          } catch {
            message.error('Không thể xóa thư mục');
          }
        },
      });
    },
    [allNotes, activeFilter, db]
  );

  const handleDeleteFolderRecursive = useCallback(
    async (folder: Note) => {
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

      Modal.confirm({
        title: `Xóa vĩnh viễn toàn bộ thư mục "${folder.title || 'Không tên'}"?`,
        content: `Hành động này sẽ xóa vĩnh viễn thư mục và ${affectedDocs.length} tài liệu bên trong.`,
        okText: `Xóa vĩnh viễn (${totalItems} mục)`,
        okType: 'danger',
        cancelText: 'Hủy',
        onOk: async () => {
          try {
            const allIds = [...folderIdsToDelete, ...affectedDocs.map((d) => d.id)];
            await bulkPermanentDeleteNotes(allIds, db);
            if (folderIdsToDelete.includes(activeFilter)) {
              setActiveFilter('root_docs');
            }
            message.success(`Đã xóa vĩnh viễn thư mục và ${affectedDocs.length} tài liệu`);
          } catch {
            message.error('Không thể xóa thư mục');
          }
        },
      });
    },
    [allNotes, activeFilter, db]
  );

  const handleEmptyTrash = useCallback(async () => {
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
          message.success(`Đã dọn sạch ${ids.length} mục trong thùng rác`);
        } catch {
          message.error('Không thể dọn thùng rác');
        }
      },
    });
  }, [allNotes, db]);

  const handleClearSpecialFolder = useCallback(
    async (specialKey: 'root_docs' | 'quick_notes', title: string) => {
      const targetNotes = (allNotes || []).filter((n) => {
        if (n.deletedAt) return false;
        if (specialKey === 'root_docs') {
          return !n.parentId && n.type === 'document';
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
            message.success(`Đã chuyển ${targetNotes.length} tài liệu vào thùng rác`);
          } catch {
            message.error('Không thể xóa tài liệu');
          }
        },
      });
    },
    [allNotes, db]
  );

  const handleUnpinAll = useCallback(async () => {
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
  }, [allNotes, db]);

  const handleTogglePin = useCallback(
    async (doc: Note) => {
      try {
        await updateNote(doc.id, { isPinned: !doc.isPinned }, db);
      } catch {
        message.error('Không thể ghim/bỏ ghim tài liệu');
      }
    },
    [db]
  );

  const handleDeleteDoc = useCallback(
    async (doc: Note) => {
      try {
        if (doc.deletedAt) {
          await permanentDeleteNote(doc.id, db);
          message.success('Đã xóa vĩnh viễn tài liệu');
        } else {
          await softDeleteNote(doc.id, db);
          message.success('Đã chuyển tài liệu vào thùng rác');
        }
      } catch {
        message.error('Không thể xóa tài liệu');
      }
    },
    [db]
  );

  const handleRestoreDoc = useCallback(
    async (doc: Note) => {
      try {
        await restoreNote(doc.id, db);
        message.success(`Đã khôi phục tài liệu "${doc.title || 'Không tiêu đề'}"`);
      } catch {
        message.error('Không thể khôi phục tài liệu');
      }
    },
    [db]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <DocFolderTree
        notes={allNotes ?? []}
        loadSearchNotes={loadSearchNotes}
        selectedDocId={selectedDocId}
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
        onSelectDoc={handleSelectDoc}
        onCreateDoc={handleCreateDoc}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onDeleteFolderRecursive={handleDeleteFolderRecursive}
        onEmptyTrash={handleEmptyTrash}
        onClearSpecialFolder={handleClearSpecialFolder}
        onUnpinAll={handleUnpinAll}
        activeTag={activeTag}
        onSelectTag={setActiveTag}
        publishStatuses={publishStatuses}
        onTogglePin={handleTogglePin}
        onDeleteDoc={handleDeleteDoc}
        onRestoreDoc={handleRestoreDoc}
        width="100%"
      />
    </div>
  );
}

export default DocsExplorer;
