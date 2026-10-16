import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button, Dropdown, Input, Modal, Tooltip, Typography, Empty, type MenuProps } from 'antd';
import {
  FolderOutlined,
  FolderFilled,
  FolderOpenFilled,
  PlusOutlined,
  InboxOutlined,
  PushpinOutlined,
  PushpinFilled,
  FileTextOutlined,
  FormOutlined,
  DeleteOutlined,
  TagOutlined,
  MoreOutlined,
  EditOutlined,
  FileAddOutlined,
  FolderAddOutlined,
  UploadOutlined,
  CaretRightOutlined,
  CaretDownOutlined,
  SearchOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { Note } from '../../types/models';
import type { DocumentPublishStatus } from '../../db/repositories/documentSetRepo';
import { DocPublishBadge } from '../knowledge/DocPublishBadge';
import { useDocWorkerSearch } from '../../hooks/useDocWorkerSearch';

const { Text } = Typography;

export type QuickFilterKey = 'inbox' | 'pinned' | 'all' | 'quick_notes' | 'trash';

export interface FolderTreeNode {
  id: string;
  folder: Note;
  title: string;
  parentId?: string | undefined;
  children: FolderTreeNode[];
  depth: number;
  directDocCount: number;
  totalDocCount: number;
}

export interface DocFolderTreeProps {
  /** Lightweight records used by tree rendering. Bodies may be empty. */
  notes: Note[];
  /** Full records are loaded only when searching, then sent to the worker. */
  loadSearchNotes?: (() => Promise<Note[]>) | undefined;
  selectedDocId?: string | null | undefined;
  activeFilter: QuickFilterKey | string; // filter key or folderId
  onSelectFilter: (filterKeyOrFolderId: QuickFilterKey | string) => void;
  onSelectDoc?: ((doc: Note) => void) | undefined;
  onCreateDoc: (targetFolderId?: string) => Promise<void> | void;
  onCreateFolder?: (folderName: string, parentId?: string) => Promise<void> | void;
  onRenameFolder?: (folderId: string, newName: string) => Promise<void> | void;
  onMoveFolder?: (folder: Note) => void;
  onDeleteFolder?: (folder: Note) => Promise<void> | void;
  onOpenZipImport?: () => void;
  activeTag?: string | null;
  onSelectTag?: (tag: string | null) => void;
  publishStatuses?: Readonly<Record<string, DocumentPublishStatus>> | undefined;
  onTogglePin?: ((doc: Note) => void) | undefined;
  onDeleteDoc?: ((doc: Note) => void) | undefined;
  onRestoreDoc?: ((doc: Note) => void) | undefined;
  onMoveDocToFolder?: ((doc: Note) => void) | undefined;
}

const PAGE_SIZE = 20;

export const DocFolderTree: React.FC<DocFolderTreeProps> = ({
  notes,
  loadSearchNotes,
  selectedDocId,
  activeFilter,
  onSelectFilter,
  onSelectDoc,
  onCreateDoc,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onOpenZipImport,
  activeTag,
  onSelectTag,
  publishStatuses,
  onTogglePin,
  onDeleteDoc,
  onRestoreDoc,
  onMoveDocToFolder,
}) => {
  // Search state with debounce
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchInput]);

  // New folder modal state
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [parentFolderForNew, setParentFolderForNew] = useState<Note | null>(null);

  // Rename folder modal state
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<{ id: string; name: string } | null>(null);
  const [renamedName, setRenamedName] = useState('');

  // Expand / collapse folder nodes in tree
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set<string>());

  // Pagination limit per folder: key is folder id, 'inbox', or filter key
  const [pageLimits, setPageLimits] = useState<Record<string, number>>({});

  // 1. Separate deleted vs active notes
  const activeNotes = useMemo(() => notes.filter((n) => !n.deletedAt), [notes]);
  const trashNotes = useMemo(() => notes.filter((n) => Boolean(n.deletedAt)), [notes]);

  // 2. Count for quick filters
  const inboxCount = activeNotes.filter((n) => !n.parentId && (n.type === 'document' || !n.type)).length;
  const pinnedCount = activeNotes.filter((n) => n.isPinned).length;
  const allDocsCount = activeNotes.filter((n) => n.type === 'document' || !n.type).length;
  const stickyNotesCount = activeNotes.filter((n) => n.type === 'quick_note').length;
  const trashCount = trashNotes.length;

  // Search corpus may contain Markdown bodies; result rendering resolves IDs against metadata-only notes.
  const { matchIds } = useDocWorkerSearch(notes, debouncedQuery, loadSearchNotes);

  const searchResults = useMemo(() => {
    if (!debouncedQuery || matchIds === null) return null;
    const metadataById = new Map(notes.map((note) => [note.id, note]));
    return matchIds.flatMap((id) => {
      const note = metadataById.get(id);
      return note && note.type !== 'folder' ? [note] : [];
    }).slice(0, 100);
  }, [notes, debouncedQuery, matchIds]);

  // 4. Extract all tags with counts
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const note of activeNotes) {
      if (note.tags) {
        for (const tag of note.tags) {
          map.set(tag, (map.get(tag) || 0) + 1);
        }
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [activeNotes]);

  // 5. Build recursive folder tree
  const folderTree = useMemo(() => {
    const folders = activeNotes.filter((n) => n.type === 'folder');
    const folderMap = new Map<string, FolderTreeNode>();

    for (const f of folders) {
      const directDocs = activeNotes.filter((n) => n.parentId === f.id && n.type !== 'folder');
      folderMap.set(f.id, {
        id: f.id,
        folder: f,
        title: f.title || 'Thư mục không tên',
        parentId: f.parentId,
        children: [],
        depth: 0,
        directDocCount: directDocs.length,
        totalDocCount: directDocs.length,
      });
    }

    const roots: FolderTreeNode[] = [];
    for (const node of folderMap.values()) {
      if (node.parentId && folderMap.has(node.parentId)) {
        folderMap.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // Sort alphabetically
    const sortNodes = (nodesList: FolderTreeNode[]) => {
      nodesList.sort((a, b) => a.title.localeCompare(b.title));
      for (const n of nodesList) {
        sortNodes(n.children);
      }
    };
    sortNodes(roots);

    // Compute depth and recursive doc count
    const computeMeta = (node: FolderTreeNode, depth: number): number => {
      node.depth = depth;
      let total = node.directDocCount;
      for (const child of node.children) {
        total += computeMeta(child, depth + 1);
      }
      node.totalDocCount = total;
      return total;
    };

    for (const r of roots) {
      computeMeta(r, 0);
    }

    return roots;
  }, [activeNotes]);

  // Auto-expand path to currently active folder or selected document's parent
  useEffect(() => {
    if (selectedDocId) {
      const doc = notes.find((n) => n.id === selectedDocId);
      if (doc && doc.parentId) {
        setExpandedFolderIds((prev) => {
          const next = new Set(prev);
          let curr: string | undefined = doc.parentId;
          while (curr) {
            next.add(curr);
            const parent = notes.find((n) => n.id === curr);
            curr = parent?.parentId;
          }
          return next;
        });
      }
    }
  }, [selectedDocId, notes]);

  const toggleFolderExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleOpenCreateRootFolder = () => {
    setParentFolderForNew(null);
    setNewFolderName('');
    setNewFolderModalOpen(true);
  };

  const handleOpenCreateSubfolder = (parentFolder: Note) => {
    setParentFolderForNew(parentFolder);
    setNewFolderName('');
    setNewFolderModalOpen(true);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    if (onCreateFolder) {
      await onCreateFolder(newFolderName.trim(), parentFolderForNew?.id);
      if (parentFolderForNew) {
        setExpandedFolderIds((prev) => new Set(prev).add(parentFolderForNew.id));
      }
    }
    setNewFolderName('');
    setParentFolderForNew(null);
    setNewFolderModalOpen(false);
  };

  const handleOpenRename = (f: Note) => {
    setRenamingFolder({ id: f.id, name: f.title || '' });
    setRenamedName(f.title || '');
    setRenameModalOpen(true);
  };

  const handleConfirmRename = async () => {
    if (!renamingFolder || !renamedName.trim()) return;
    if (onRenameFolder) {
      await onRenameFolder(renamingFolder.id, renamedName.trim());
    }
    setRenameModalOpen(false);
    setRenamingFolder(null);
    setRenamedName('');
  };

  const quickFilterItems: Array<{
    key: QuickFilterKey;
    label: string;
    icon: React.ReactNode;
    count: number;
    color?: string;
  }> = [
    { key: 'inbox', label: 'Inbox', icon: <InboxOutlined />, count: inboxCount },
    { key: 'pinned', label: 'Đã ghim', icon: <PushpinOutlined />, count: pinnedCount },
    { key: 'all', label: 'Tất cả tài liệu', icon: <FileTextOutlined />, count: allDocsCount },
    { key: 'quick_notes', label: 'Ghi chú nhanh', icon: <FormOutlined />, count: stickyNotesCount },
    { key: 'trash', label: 'Thùng rác', icon: <DeleteOutlined />, count: trashCount, color: '#ff4d4f' },
  ];

  // Helper to get paginated docs for a folder
  const getFolderDocs = (folderId: string) => {
    return activeNotes.filter((n) => n.parentId === folderId && n.type !== 'folder');
  };

  const loadMoreDocs = (scopeId: string) => {
    setPageLimits((prev) => ({
      ...prev,
      [scopeId]: (prev[scopeId] ?? PAGE_SIZE) + PAGE_SIZE,
    }));
  };

  const handleLoadMoreDocs = (scopeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    loadMoreDocs(scopeId);
  };

  const observeLoadMore = (scopeId: string) => (node: HTMLDivElement | null) => {
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        loadMoreDocs(scopeId);
        observer.disconnect();
      }
    }, { rootMargin: '80px' });
    observer.observe(node);
  };

  const rootDocs = useMemo(() => {
    const docs = activeNotes.filter((note) => note.type !== 'folder');
    if (activeTag) return docs.filter((note) => note.tags?.includes(activeTag));
    if (activeFilter === 'trash') return trashNotes.filter((note) => note.type !== 'folder');
    if (activeFilter === 'pinned') return docs.filter((note) => note.isPinned);
    if (activeFilter === 'quick_notes') return docs.filter((note) => note.type === 'quick_note');
    if (activeFilter === 'all') return docs;
    if (activeFilter === 'inbox') return docs.filter((note) => !note.parentId && note.type !== 'quick_note');
    return [];
  }, [activeNotes, trashNotes, activeFilter, activeTag]);

  const rootDocLimit = pageLimits[`root:${activeFilter}`] ?? PAGE_SIZE;
  const visibleRootDocs = rootDocs.slice(0, rootDocLimit);
  const hasMoreRootDocs = rootDocs.length > visibleRootDocs.length;

  // Render individual document item
  const renderDocItem = (doc: Note, depth: number = 0) => {
    const isSelected = selectedDocId === doc.id;
    const isQuickNote = doc.type === 'quick_note';

    const docMenu: MenuProps['items'] = [
      ...(onTogglePin
        ? [
            {
              key: 'pin',
              label: doc.isPinned ? 'Bỏ ghim' : 'Ghim lên đầu',
              icon: doc.isPinned ? <PushpinFilled style={{ color: '#d97706' }} /> : <PushpinOutlined />,
              onClick: () => onTogglePin(doc),
            },
          ]
        : []),
      ...(onMoveDocToFolder && !doc.deletedAt
        ? [
            {
              key: 'move',
              label: 'Chuyển thư mục',
              icon: <FolderOutlined />,
              onClick: () => onMoveDocToFolder(doc),
            },
          ]
        : []),
      ...(doc.deletedAt && onRestoreDoc
        ? [
            {
              key: 'restore',
              label: 'Khôi phục',
              icon: <UndoOutlined style={{ color: '#16a34a' }} />,
              onClick: () => onRestoreDoc(doc),
            },
          ]
        : []),
      ...(onDeleteDoc
        ? [
            {
              type: 'divider' as const,
            },
            {
              key: 'delete',
              label: doc.deletedAt ? 'Xóa vĩnh viễn' : 'Chuyển vào thùng rác',
              icon: <DeleteOutlined />,
              danger: true,
              onClick: () => onDeleteDoc(doc),
            },
          ]
        : []),
    ];

    return (
      <div
        key={doc.id}
        className="doc-tree-leaf-item"
        role="button"
        tabIndex={0}
        onClick={() => onSelectDoc?.(doc)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectDoc?.(doc);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px 4px 6px',
          paddingLeft: 12 + depth * 14,
          borderRadius: 6,
          cursor: 'pointer',
          backgroundColor: isSelected ? '#e0e7ff' : 'transparent',
          color: isSelected ? '#3730a3' : '#374151',
          fontWeight: isSelected ? 600 : 400,
          fontSize: 12.5,
          transition: 'all 0.12s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 13, flexShrink: 0, color: isQuickNote ? '#10b981' : '#6366f1' }}>
            {isQuickNote ? <FormOutlined /> : <FileTextOutlined />}
          </span>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: isSelected ? '#3730a3' : '#1f2937',
            }}
            title={doc.title || 'Tài liệu không tên'}
          >
            {doc.title || 'Tài liệu không tên'}
          </span>
          {doc.isPinned && (
            <PushpinFilled style={{ color: '#f59e0b', fontSize: 10, flexShrink: 0 }} />
          )}
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: 4 }}
          onClick={(e) => e.stopPropagation()}
        >
          {publishStatuses?.[doc.id] && (
            <DocPublishBadge status={publishStatuses[doc.id]} compact />
          )}
          {docMenu.length > 0 && (
            <Dropdown menu={{ items: docMenu }} trigger={['click']} placement="bottomRight">
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined style={{ fontSize: 11, color: '#9ca3af' }} />}
                style={{ width: 18, height: 18, padding: 0 }}
              />
            </Dropdown>
          )}
        </div>
      </div>
    );
  };

  // Recursive folder node renderer
  const renderFolderNode = (node: FolderTreeNode): React.ReactNode => {
    const isActive = activeFilter === node.id;
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedFolderIds.has(node.id);
    const directDocs = getFolderDocs(node.id);
    const hasContent = hasChildren || directDocs.length > 0;
    const currentLimit = pageLimits[node.id] ?? PAGE_SIZE;
    const visibleDocs = directDocs.slice(0, currentLimit);
    const hasMoreDocs = directDocs.length > visibleDocs.length;

    const folderMenu: MenuProps['items'] = [
      {
        key: 'create_doc',
        label: 'Tạo tài liệu trong thư mục',
        icon: <FileAddOutlined />,
        onClick: () => onCreateDoc(node.id),
      },
      {
        key: 'create_subfolder',
        label: 'Tạo thư mục con',
        icon: <FolderAddOutlined />,
        onClick: () => handleOpenCreateSubfolder(node.folder),
      },
      {
        key: 'rename',
        label: 'Đổi tên thư mục',
        icon: <EditOutlined />,
        onClick: () => handleOpenRename(node.folder),
      },
      ...(onMoveFolder
        ? [
            {
              key: 'move',
              label: 'Di chuyển thư mục',
              icon: <FolderOutlined />,
              onClick: () => onMoveFolder(node.folder),
            },
          ]
        : []),
      ...(onDeleteFolder
        ? [
            {
              type: 'divider' as const,
            },
            {
              key: 'delete',
              label: 'Xóa thư mục',
              icon: <DeleteOutlined />,
              danger: true,
              onClick: () => onDeleteFolder(node.folder),
            },
          ]
        : []),
    ];

    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          className="doc-folder-item"
          role="button"
          tabIndex={0}
          onClick={() => {
            // Expand/collapse on row click per specification; do NOT open editor
            setExpandedFolderIds((prev) => {
              const next = new Set(prev);
              if (next.has(node.id)) next.delete(node.id);
              else next.add(node.id);
              return next;
            });
            onSelectFilter(node.id);
            if (onSelectTag) onSelectTag(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpandedFolderIds((prev) => {
                const next = new Set(prev);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
              });
              onSelectFilter(node.id);
              if (onSelectTag) onSelectTag(null);
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 8px 5px 4px',
            paddingLeft: 4 + node.depth * 14,
            borderRadius: 6,
            cursor: 'pointer',
            backgroundColor: isActive ? '#fef3c7' : 'transparent',
            color: isActive ? '#92400e' : '#262626',
            fontWeight: isActive ? 600 : 400,
            fontSize: 13,
            transition: 'all 0.15s ease',
          }}
        >
          {/* Left: Caret + Folder Icon + Title */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              minWidth: 0,
              flex: 1,
            }}
          >
            {/* Expand / Collapse Caret */}
            {hasContent ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => toggleFolderExpand(node.id, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleFolderExpand(node.id, e as unknown as React.MouseEvent);
                  }
                }}
                style={{
                  width: 16,
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: '#9ca3af',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
              </span>
            ) : (
              <span style={{ width: 16, flexShrink: 0 }} />
            )}

            <span style={{ fontSize: 14, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              {isActive ? (
                <FolderOpenFilled style={{ color: '#d97706' }} />
              ) : (
                <FolderFilled style={{ color: '#f59e0b' }} />
              )}
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: isActive ? '#92400e' : '#1f2937',
              }}
              title={node.title}
            >
              {node.title}
            </span>
          </div>

          {/* Right: Badge and actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexShrink: 0,
              marginLeft: 4,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip
              title={
                hasChildren && node.totalDocCount !== node.directDocCount
                  ? `${node.directDocCount} tài liệu trực tiếp, tổng ${node.totalDocCount} gồm thư mục con`
                  : undefined
              }
            >
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 6px',
                  borderRadius: 10,
                  backgroundColor: isActive ? '#fde68a' : '#f0f0f0',
                  color: isActive ? '#b45309' : '#8c8c8c',
                }}
              >
                {node.directDocCount}
              </span>
            </Tooltip>

            {/* Quick Add Doc */}
            <Tooltip title="Thêm tài liệu vào thư mục này">
              <Button
                type="text"
                size="small"
                icon={<FileAddOutlined style={{ fontSize: 12, color: isActive ? '#b45309' : '#6b7280' }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateDoc(node.id);
                }}
                style={{ width: 20, height: 20, padding: 0 }}
              />
            </Tooltip>

            {/* Dropdown Menu */}
            <Dropdown menu={{ items: folderMenu }} trigger={['click']} placement="bottomRight">
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined style={{ fontSize: 12, color: isActive ? '#b45309' : '#8c8c8c' }} />}
                style={{ width: 20, height: 20, padding: 0 }}
              />
            </Dropdown>
          </div>
        </div>

        {/* Expanded Content: Subfolders and Child Documents */}
        {isExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* 1. Subfolders */}
            {node.children.map((child) => renderFolderNode(child))}

            {/* 2. Documents inside this folder */}
            {visibleDocs.map((doc) => renderDocItem(doc, node.depth + 1))}

            {hasMoreDocs && (
              <div ref={observeLoadMore(node.id)}>
                <Button
                  type="link"
                  size="small"
                  onClick={(e) => handleLoadMoreDocs(node.id, e)}
                  style={{
                    alignSelf: 'flex-start',
                    fontSize: 11,
                    padding: '2px 8px',
                    marginLeft: 16 + (node.depth + 1) * 14,
                    height: 24,
                  }}
                >
                  Xem thêm ({directDocs.length - visibleDocs.length} tài liệu)...
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="doc-folder-tree"
      style={{
        width: 320,
        minWidth: 280,
        maxWidth: 380,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 8px',
        backgroundColor: '#fafafa',
        borderRight: '1px solid #f0f0f0',
        overflowY: 'auto',
      }}
    >
      {/* 1. Search Bar */}
      <div>
        <Input
          placeholder="Tìm kiếm tài liệu (BM25)..."
          prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          allowClear
          size="middle"
          style={{ borderRadius: 6 }}
        />
      </div>

      {/* 2. Top CTA buttons */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Button
          type="primary"
          style={{
            flex: 1,
            minWidth: 0,
            padding: '4px 8px',
            backgroundColor: '#4f46e5',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          icon={<PlusOutlined />}
          onClick={() => {
            const targetFolder =
              typeof activeFilter === 'string' && !quickFilterItems.some((q) => q.key === activeFilter)
                ? activeFilter
                : undefined;
            onCreateDoc(targetFolder);
          }}
        >
          {activeFilter === 'quick_notes' ? 'Tạo ghi chú nhanh' : 'Tạo tài liệu'}
        </Button>
        <Tooltip title="Tạo thư mục mới ở cấp gốc">
          <Button
            style={{ flexShrink: 0 }}
            icon={<FolderAddOutlined />}
            onClick={handleOpenCreateRootFolder}
          />
        </Tooltip>
        {onOpenZipImport && (
          <Tooltip title="Nhập tài liệu từ file Zip">
            <Button
              style={{ flexShrink: 0 }}
              icon={<UploadOutlined />}
              onClick={onOpenZipImport}
            />
          </Tooltip>
        )}
      </div>

      {/* 3. When Searching: Render Search Result List */}
      {debouncedQuery ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, color: '#6b7280' }}>
            KẾT QUẢ TÌM KIẾM ({searchResults?.length || 0})
          </div>
          {searchResults && searchResults.length > 0 ? (
            searchResults.map((doc) => renderDocItem(doc, 0))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Không tìm thấy tài liệu phù hợp"
              style={{ marginTop: 24 }}
            />
          )}
        </div>
      ) : (
        /* 4. Normal Mode: Quick Filters, Hierarchical Folders with Child Documents, and Tags */
        <>
          {/* Quick Filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {quickFilterItems.map((item) => {
              const isActive = activeFilter === item.key;
              return (
                <div
                  key={item.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onSelectFilter(item.key);
                    if (onSelectTag) onSelectTag(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectFilter(item.key);
                      if (onSelectTag) onSelectTag(null);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    backgroundColor: isActive ? '#f0f2ff' : 'transparent',
                    color: isActive ? '#4f46e5' : item.color || '#262626',
                    fontWeight: isActive ? 600 : 400,
                    fontSize: 13,
                    transition: 'background 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14 }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '1px 6px',
                      borderRadius: 10,
                      backgroundColor: isActive ? '#e0e7ff' : '#f0f0f0',
                      color: isActive ? '#4f46e5' : '#8c8c8c',
                    }}
                  >
                    {item.count}
                  </span>
                </div>
              );
            })}
          </div>

          {visibleRootDocs.length > 0 && (
            <div aria-label="Tài liệu trong phạm vi hiện tại" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {visibleRootDocs.map((doc) => renderDocItem(doc))}
              {hasMoreRootDocs && (
                <div ref={observeLoadMore(`root:${activeFilter}`)}>
                  <Button type="link" size="small" onClick={(e) => handleLoadMoreDocs(`root:${activeFilter}`, e)}>
                    Xem thêm ({rootDocs.length - visibleRootDocs.length} tài liệu)...
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Folders Section */}
          <div style={{ marginTop: 4 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '2px 8px 6px 8px',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#8c8c8c' }}>
                THƯ MỤC
              </span>
              <Tooltip title="Thêm thư mục gốc">
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined style={{ fontSize: 11, color: '#8c8c8c' }} />}
                  onClick={handleOpenCreateRootFolder}
                  style={{ width: 22, height: 22, padding: 0 }}
                />
              </Tooltip>
            </div>

            {folderTree.length === 0 ? (
              <div
                style={{
                  padding: '10px 8px',
                  textAlign: 'center',
                  border: '1px dashed #e5e7eb',
                  borderRadius: 6,
                  margin: '2px 4px',
                }}
              >
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                  Chưa có thư mục
                </Text>
                <Button
                  size="small"
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={handleOpenCreateRootFolder}
                  style={{ fontSize: 11 }}
                >
                  Tạo thư mục
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {folderTree.map((rootNode) => renderFolderNode(rootNode))}
              </div>
            )}
          </div>

          {/* Tags Section */}
          {tagCounts.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  padding: '2px 8px 6px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: '#8c8c8c',
                }}
              >
                TAGS
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 4px' }}>
                {tagCounts.map(([tag, count]) => {
                  const isTagActive = activeTag === tag;
                  return (
                    <span
                      key={tag}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectTag?.(isTagActive ? null : tag)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectTag?.(isTagActive ? null : tag);
                        }
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        cursor: 'pointer',
                        backgroundColor: isTagActive ? '#4f46e5' : '#f0f0f0',
                        color: isTagActive ? '#ffffff' : '#4b5563',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <TagOutlined style={{ fontSize: 10 }} />
                      <span>{tag}</span>
                      <span
                        style={{
                          fontSize: 10,
                          opacity: 0.8,
                          backgroundColor: isTagActive ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                          borderRadius: 8,
                          padding: '0 4px',
                        }}
                      >
                        {count}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* New Folder Modal (supports Root and Subfolder) */}
      <Modal
        title={
          parentFolderForNew
            ? `Tạo thư mục con trong "${parentFolderForNew.title || 'Không tên'}"`
            : 'Tạo thư mục mới'
        }
        open={newFolderModalOpen}
        onOk={handleCreateFolder}
        onCancel={() => {
          setNewFolderModalOpen(false);
          setParentFolderForNew(null);
          setNewFolderName('');
        }}
        okText="Tạo thư mục"
        cancelText="Hủy"
        okButtonProps={{ disabled: !newFolderName.trim(), style: { backgroundColor: '#4f46e5' } }}
      >
        <Input
          placeholder="Nhập tên thư mục..."
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onPressEnter={handleCreateFolder}
          autoFocus
          style={{ marginTop: 12 }}
        />
      </Modal>

      {/* Rename Folder Modal */}
      <Modal
        title="Đổi tên thư mục"
        open={renameModalOpen}
        onOk={handleConfirmRename}
        onCancel={() => {
          setRenameModalOpen(false);
          setRenamingFolder(null);
          setRenamedName('');
        }}
        okText="Lưu"
        cancelText="Hủy"
        okButtonProps={{ disabled: !renamedName.trim(), style: { backgroundColor: '#4f46e5' } }}
      >
        <Input
          placeholder="Tên mới..."
          value={renamedName}
          onChange={(e) => setRenamedName(e.target.value)}
          onPressEnter={handleConfirmRename}
          autoFocus
          style={{ marginTop: 12 }}
        />
      </Modal>
    </div>
  );
};
