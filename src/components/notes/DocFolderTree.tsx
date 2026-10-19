import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button, Dropdown, Input, Modal, Segmented, Tooltip, Typography, Empty, type MenuProps } from 'antd';
import {
  FolderOutlined,
  FolderFilled,
  FolderOpenFilled,
  PlusOutlined,
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
  CheckSquareOutlined,
  ProjectOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import type { Note } from '../../types/models';
import type { DocumentPublishStatus } from '../../db/repositories/documentSetRepo';
import { DocPublishBadge } from '../knowledge/DocPublishBadge';
import { useDocWorkerSearch } from '../../hooks/useDocWorkerSearch';

const { Text } = Typography;

export type QuickFilterKey = 'pinned' | 'quick_notes' | 'trash';

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
  activeFilter: string; // folderId or 'pinned' | 'quick_notes' | 'trash' | 'root'
  onSelectFilter: (filterKeyOrFolderId: string) => void;
  onSelectDoc?: ((doc: Note) => void) | undefined;
  onCreateDoc: (targetFolderId?: string) => Promise<void> | void;
  onCreateFolder?: (folderName: string, parentId?: string) => Promise<void> | void;
  onRenameFolder?: (folderId: string, newName: string) => Promise<void> | void;
  onMoveFolder?: (folder: Note) => void;
  onDeleteFolder?: (folder: Note) => Promise<void> | void;
  onDeleteFolderRecursive?: (folder: Note) => Promise<void> | void;
  onEmptyTrash?: () => Promise<void> | void;
  onClearSpecialFolder?: (specialKey: 'root_docs' | 'quick_notes', title: string) => Promise<void> | void;
  onUnpinAll?: () => Promise<void> | void;
  onOpenZipImport?: () => void;
  onDownloadFolder?: ((folder: Note) => Promise<void> | void) | undefined;
  activeTag?: string | null;
  onSelectTag?: (tag: string | null) => void;
  publishStatuses?: Readonly<Record<string, DocumentPublishStatus>> | undefined;
  onTogglePin?: ((doc: Note) => void) | undefined;
  onDeleteDoc?: ((doc: Note) => void) | undefined;
  onRestoreDoc?: ((doc: Note) => void) | undefined;
  onMoveDocToFolder?: ((doc: Note) => void) | undefined;
  /** Custom panel width when resizable */
  width?: number | undefined;
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
  onDeleteFolderRecursive,
  onEmptyTrash,
  onClearSpecialFolder,
  onUnpinAll,
  onOpenZipImport,
  onDownloadFolder,
  activeTag,
  onSelectTag,
  publishStatuses,
  onTogglePin,
  onDeleteDoc,
  onRestoreDoc,
  onMoveDocToFolder,
  width,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'all' | 'folder'>('all');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Modal states
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [parentFolderForNew, setParentFolderForNew] = useState<Note | null>(null);

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<{ id: string; name: string } | null>(null);
  const [renamedName, setRenamedName] = useState('');

  // Expanded folders in tree
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set<string>());
  const [pageLimits, setPageLimits] = useState<Record<string, number>>({});

  // Active vs deleted notes
  const activeNotes = useMemo(() => notes.filter((n) => !n.deletedAt), [notes]);
  const trashNotes = useMemo(() => notes.filter((n) => Boolean(n.deletedAt)), [notes]);

  // Counts for special folders
  const pinnedDocs = useMemo(() => activeNotes.filter((n) => n.isPinned && n.type !== 'folder'), [activeNotes]);
  const quickNotes = useMemo(() => activeNotes.filter((n) => n.type === 'quick_note'), [activeNotes]);
  const rootDirectDocs = useMemo(() => activeNotes.filter((n) => !n.parentId && n.type === 'document'), [activeNotes]);
  const deletedDocs = useMemo(() => trashNotes.filter((n) => n.type !== 'folder'), [trashNotes]);

  // Active folder / scope info
  const activeScopeInfo = useMemo(() => {
    if (activeFilter === 'pinned') {
      return { type: 'special' as const, name: 'Đã ghim', descendantFolderIds: null };
    }
    if (activeFilter === 'quick_notes') {
      return { type: 'special' as const, name: 'Ghi chú nhanh', descendantFolderIds: null };
    }
    if (activeFilter === 'root_docs') {
      return { type: 'special' as const, name: 'Tài liệu chung', descendantFolderIds: null };
    }
    if (activeFilter === 'trash') {
      return { type: 'special' as const, name: 'Thùng rác', descendantFolderIds: null };
    }

    const folder = notes.find((n) => n.id === activeFilter && n.type === 'folder' && !n.deletedAt);
    if (!folder) {
      return { type: 'none' as const, name: 'Chưa chọn thư mục', descendantFolderIds: null };
    }

    const descendantIds = new Set<string>([folder.id]);
    const addDescendants = (parentId: string) => {
      const children = notes.filter((n) => n.type === 'folder' && n.parentId === parentId && !n.deletedAt);
      for (const child of children) {
        descendantIds.add(child.id);
        addDescendants(child.id);
      }
    };
    addDescendants(folder.id);

    return {
      type: 'folder' as const,
      name: folder.title || 'Thư mục không tên',
      descendantFolderIds: descendantIds,
    };
  }, [activeFilter, notes]);

  // Search
  const { matchIds } = useDocWorkerSearch(notes, debouncedQuery, loadSearchNotes);
  const searchResults = useMemo(() => {
    if (!debouncedQuery || matchIds === null) return null;
    const metadataById = new Map(notes.map((note) => [note.id, note]));
    const matchedDocs = matchIds.flatMap((id) => {
      const note = metadataById.get(id);
      return note && note.type !== 'folder' ? [note] : [];
    });

    if (searchScope === 'all') {
      return matchedDocs.slice(0, 100);
    }

    // Scoped to active folder or active special category
    const filtered = matchedDocs.filter((doc) => {
      if (activeScopeInfo.type === 'folder' && activeScopeInfo.descendantFolderIds) {
        return !doc.deletedAt && Boolean(doc.parentId && activeScopeInfo.descendantFolderIds.has(doc.parentId));
      }
      if (activeFilter === 'root_docs') {
        return !doc.parentId && doc.type === 'document' && !doc.deletedAt;
      }
      if (activeFilter === 'quick_notes') {
        return doc.type === 'quick_note' && !doc.deletedAt;
      }
      if (activeFilter === 'pinned') {
        return Boolean(doc.isPinned) && doc.type !== 'folder' && !doc.deletedAt;
      }
      if (activeFilter === 'trash') {
        return Boolean(doc.deletedAt) && doc.type !== 'folder';
      }
      return false;
    });

    return filtered.slice(0, 100);
  }, [notes, debouncedQuery, matchIds, searchScope, activeScopeInfo, activeFilter]);

  // Tags
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

  // User Folder Tree
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

  // Auto-expand path to selected document
  useEffect(() => {
    if (selectedDocId) {
      const doc = notes.find((n) => n.id === selectedDocId);
      if (doc) {
        if (doc.isPinned) {
          setExpandedFolderIds((prev) => new Set(prev).add('pinned'));
        }
        if (doc.type === 'quick_note') {
          setExpandedFolderIds((prev) => new Set(prev).add('quick_notes'));
        }
        if (doc.deletedAt) {
          setExpandedFolderIds((prev) => new Set(prev).add('trash'));
        }
        if (!doc.parentId && doc.type === 'document') {
          setExpandedFolderIds((prev) => new Set(prev).add('root_docs'));
        }
        if (doc.parentId) {
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
    }
  }, [selectedDocId, notes]);

  const toggleFolderExpand = (folderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
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

  const getFolderDocs = (folderId: string) => {
    let docs = activeNotes.filter((n) => n.parentId === folderId && n.type !== 'folder');
    if (activeTag) docs = docs.filter((n) => n.tags?.includes(activeTag));
    return docs;
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
              icon: <UndoOutlined />,
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
              label: doc.deletedAt ? 'Xóa vĩnh viễn' : 'Xóa tài liệu',
              icon: <DeleteOutlined />,
              danger: true,
              onClick: () => onDeleteDoc(doc),
            },
          ]
        : []),
    ];

    return (
      <Dropdown menu={{ items: docMenu }} trigger={['contextMenu']}>
        <div
          key={doc.id}
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
            paddingLeft: depth === 0 ? 8 : 34 + (depth - 1) * 16,
            borderRadius: 4,
            cursor: 'pointer',
            backgroundColor: isSelected ? '#e0e7ff' : 'transparent',
            color: isSelected ? '#3730a3' : '#374151',
            fontWeight: isSelected ? 600 : 400,
            fontSize: 12.5,
            transition: 'all 0.15s ease',
            margin: '1px 0',
          }}
          className="doc-tree-item"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 13, flexShrink: 0, color: isSelected ? '#4f46e5' : '#6b7280' }}>
              {isQuickNote ? <FormOutlined /> : <FileTextOutlined />}
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textDecoration: doc.deletedAt ? 'line-through' : 'none',
                opacity: doc.deletedAt ? 0.6 : 1,
              }}
              title={doc.title || (isQuickNote ? 'Ghi chú nhanh' : 'Không tiêu đề')}
            >
              {doc.title || (isQuickNote ? 'Ghi chú nhanh' : 'Không tiêu đề')}
            </span>
            {doc.isPinned && !isQuickNote && (
              <PushpinFilled style={{ fontSize: 10, color: '#f59e0b', flexShrink: 0 }} />
            )}
            {doc.entityType === 'task' && (
              <Tooltip title="Thuộc về một tác vụ">
                <CheckSquareOutlined style={{ fontSize: 11, color: '#1677ff', flexShrink: 0 }} />
              </Tooltip>
            )}
            {doc.entityType === 'project' && (
              <Tooltip title="Thuộc về một dự án">
                <ProjectOutlined style={{ fontSize: 11, color: '#722ed1', flexShrink: 0 }} />
              </Tooltip>
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
      </Dropdown>
    );
  };

  // Render a special folder (Pinned, Quick notes, Trash, Root docs)
  const renderSpecialFolder = (
    id: string,
    title: string,
    icon: React.ReactNode,
    docs: Note[],
    color: string = '#4f46e5',
    extraAction?: React.ReactNode
  ) => {
    const isExpanded = expandedFolderIds.has(id);
    const isActive = activeFilter === id;
    const currentLimit = pageLimits[id] ?? PAGE_SIZE;
    const filteredDocs = activeTag ? docs.filter((d) => d.tags?.includes(activeTag)) : docs;
    const visibleDocs = filteredDocs.slice(0, currentLimit);
    const hasMore = filteredDocs.length > visibleDocs.length;
    const count = docs.length;

    const specialMenu: MenuProps['items'] = [
      ...(id === 'quick_notes'
        ? [
            {
              key: 'create_quick_note',
              label: 'Tạo ghi chú nhanh',
              icon: <PlusOutlined />,
              onClick: () => {
                onSelectFilter('quick_notes');
                onCreateDoc();
              },
            },
          ]
        : []),
      ...(id === 'root_docs'
        ? [
            {
              key: 'create_root_doc',
              label: 'Tạo tài liệu mới',
              icon: <PlusOutlined />,
              onClick: () => {
                onCreateDoc(undefined);
              },
            },
          ]
        : []),
      ...(id === 'pinned' && onUnpinAll && docs.length > 0
        ? [
            {
              key: 'unpin_all',
              label: 'Bỏ ghim tất cả tài liệu',
              icon: <PushpinOutlined />,
              onClick: () => onUnpinAll(),
            },
          ]
        : []),
      ...(id === 'trash' && onEmptyTrash && docs.length > 0
        ? [
            {
              key: 'empty_trash',
              label: 'Dọn sạch thùng rác (Xóa vĩnh viễn)',
              icon: <DeleteOutlined />,
              danger: true,
              onClick: () => onEmptyTrash(),
            },
          ]
        : []),
      ...((id === 'root_docs' || id === 'quick_notes') && onClearSpecialFolder && docs.length > 0
        ? [
            {
              type: 'divider' as const,
            },
            {
              key: 'clear_special',
              label: id === 'root_docs' ? 'Xóa toàn bộ tài liệu chưa phân loại' : 'Xóa toàn bộ ghi chú nhanh',
              icon: <DeleteOutlined />,
              danger: true,
              onClick: () => onClearSpecialFolder(id, title),
            },
          ]
        : []),
    ];

    const folderContent = (
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          toggleFolderExpand(id);
          onSelectFilter(id);
          if (onSelectTag) onSelectTag(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleFolderExpand(id);
            onSelectFilter(id);
            if (onSelectTag) onSelectTag(null);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 8px 5px 4px',
          borderRadius: 6,
          cursor: 'pointer',
          backgroundColor: isActive ? '#f0f2ff' : 'transparent',
          color: isActive ? '#4f46e5' : '#262626',
          fontWeight: isActive ? 600 : 400,
          fontSize: 13,
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => toggleFolderExpand(id, e)}
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
            {count > 0 ? (isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />) : <span style={{ width: 10 }} />}
          </span>
          <span style={{ fontSize: 14, flexShrink: 0, color, display: 'flex', alignItems: 'center' }}>
            {icon}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 4 }} onClick={(e) => e.stopPropagation()}>
          <span
            style={{
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 10,
              backgroundColor: isActive ? '#e0e7ff' : '#f0f0f0',
              color: isActive ? '#4f46e5' : '#8c8c8c',
            }}
          >
            {count}
          </span>
          {extraAction}
          {specialMenu.length > 0 && (
            <Dropdown menu={{ items: specialMenu }} trigger={['click']} placement="bottomRight">
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

    return (
      <div key={id} style={{ display: 'flex', flexDirection: 'column' }}>
        {specialMenu.length > 0 ? (
          <Dropdown menu={{ items: specialMenu }} trigger={['contextMenu']}>
            {folderContent}
          </Dropdown>
        ) : (
          folderContent
        )}

        {isExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {visibleDocs.length === 0 ? (
              <div style={{ padding: '4px 8px 4px 34px', fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                Trống
              </div>
            ) : (
              visibleDocs.map((doc) => renderDocItem(doc, 1))
            )}
            {hasMore && (
              <Button
                type="link"
                size="small"
                onClick={(e) => handleLoadMoreDocs(id, e)}
                style={{
                  alignSelf: 'flex-start',
                  fontSize: 11,
                  padding: '2px 8px',
                  marginLeft: 34,
                  height: 24,
                }}
              >
                Xem thêm ({filteredDocs.length - visibleDocs.length} tài liệu)...
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  // Recursive regular folder node renderer
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
      ...(onDownloadFolder
        ? [
            {
              key: 'download_folder',
              label: 'Tải thư mục (ZIP)',
              icon: <DownloadOutlined />,
              onClick: () => onDownloadFolder(node.folder),
            },
          ]
        : []),
      ...(onDeleteFolder || onDeleteFolderRecursive
        ? [
            {
              type: 'divider' as const,
            },
          ]
        : []),
      ...(onDeleteFolder
        ? [
            {
              key: 'delete',
              label: 'Xóa thư mục (giữ lại file)',
              icon: <DeleteOutlined />,
              onClick: () => onDeleteFolder(node.folder),
            },
          ]
        : []),
      ...(onDeleteFolderRecursive
        ? [
            {
              key: 'delete_recursive',
              label: 'Xóa toàn bộ thư mục & file (Recursive)',
              icon: <DeleteOutlined />,
              danger: true,
              onClick: () => onDeleteFolderRecursive(node.folder),
            },
          ]
        : []),
    ];

    const nodeContent = (
      <div
        className="doc-folder-item"
        role="button"
        tabIndex={0}
        onClick={() => {
          toggleFolderExpand(node.id);
          onSelectFilter(node.id);
          if (onSelectTag) onSelectTag(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleFolderExpand(node.id);
            onSelectFilter(node.id);
            if (onSelectTag) onSelectTag(null);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 8px 5px 4px',
          paddingLeft: 4 + node.depth * 16,
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
          {hasContent ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => toggleFolderExpand(node.id, e)}
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
    );

    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: 'column' }}>
        <Dropdown menu={{ items: folderMenu }} trigger={['contextMenu']}>
          {nodeContent}
        </Dropdown>

        {/* Expanded Content: Subfolders and Child Documents */}
        {isExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {node.children.map((child) => renderFolderNode(child))}
            {visibleDocs.map((doc) => renderDocItem(doc, node.depth + 1))}
            {hasMoreDocs && (
              <Button
                type="link"
                size="small"
                onClick={(e) => handleLoadMoreDocs(node.id, e)}
                style={{
                  alignSelf: 'flex-start',
                  fontSize: 11,
                  padding: '2px 8px',
                  marginLeft: 34 + node.depth * 16,
                  height: 24,
                }}
              >
                Xem thêm ({directDocs.length - visibleDocs.length} tài liệu)...
              </Button>
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
        width: width ?? 320,
        minWidth: width !== undefined ? width : 280,
        maxWidth: width !== undefined ? width : 380,
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
      {/* 1. Search Bar & Scope Toggle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Input
          placeholder="Tìm kiếm tài liệu (BM25)..."
          prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          allowClear
          size="middle"
          style={{ borderRadius: 6 }}
        />
        <Segmented<'all' | 'folder'>
          size="small"
          block
          value={searchScope}
          onChange={(val) => setSearchScope(val)}
          options={[
            { label: 'Tất cả', value: 'all' },
            {
              label: (
                <Tooltip title={activeScopeInfo.name} placement="bottom">
                  <span
                    style={{
                      display: 'inline-block',
                      maxWidth: 130,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      verticalAlign: 'bottom',
                    }}
                  >
                    Thư mục hiện tại
                  </span>
                </Tooltip>
              ),
              value: 'folder',
            },
          ]}
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
              typeof activeFilter === 'string' &&
              !['pinned', 'quick_notes', 'trash', 'root_docs'].includes(activeFilter)
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
            {searchScope === 'folder' && (
              <span style={{ fontWeight: 400, color: '#4f46e5', marginLeft: 4 }}>
                • {activeScopeInfo.name}
              </span>
            )}
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
        /* 4. Normal Mode: Unified Tree with Special Folders + User Folders + Root Documents */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {/* Top Special System Folders */}
          {renderSpecialFolder('pinned', 'Đã ghim', <PushpinFilled style={{ color: '#f59e0b' }} />, pinnedDocs, '#f59e0b')}
          {renderSpecialFolder(
            'quick_notes',
            'Ghi chú nhanh',
            <FormOutlined style={{ color: '#059669' }} />,
            quickNotes,
            '#059669',
            <Tooltip title="Tạo ghi chú nhanh mới">
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined style={{ fontSize: 11, color: '#059669' }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectFilter('quick_notes');
                  onCreateDoc();
                }}
                style={{ width: 18, height: 18, padding: 0 }}
              />
            </Tooltip>
          )}

          {/* Root-level documents (without folder) */}
          {rootDirectDocs.length > 0 &&
            renderSpecialFolder(
              'root_docs',
              'Tài liệu chung (Chưa phân loại)',
              <FileTextOutlined style={{ color: '#6366f1' }} />,
              rootDirectDocs,
              '#6366f1',
              <Tooltip title="Tạo tài liệu mới ở cấp gốc">
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined style={{ fontSize: 11, color: '#6366f1' }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateDoc(undefined);
                  }}
                  style={{ width: 18, height: 18, padding: 0 }}
                />
              </Tooltip>
            )}

          {/* Trash Special Folder on Top */}
          {renderSpecialFolder('trash', 'Thùng rác', <DeleteOutlined style={{ color: '#ef4444' }} />, deletedDocs, '#ef4444')}

          {/* User Folders Header */}
          <div style={{ marginTop: 8, marginBottom: 2 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px',
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
                  style={{ width: 20, height: 20, padding: 0 }}
                />
              </Tooltip>
            </div>

            {folderTree.length === 0 ? (
              <div
                style={{
                  padding: '8px',
                  textAlign: 'center',
                  border: '1px dashed #e5e7eb',
                  borderRadius: 6,
                  margin: '2px 4px',
                }}
              >
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
        </div>
      )}

      {/* Modal: New Folder */}
      <Modal
        title={parentFolderForNew ? `Tạo thư mục con trong "${parentFolderForNew.title}"` : 'Tạo thư mục mới'}
        open={newFolderModalOpen}
        onOk={handleCreateFolder}
        onCancel={() => {
          setNewFolderModalOpen(false);
          setNewFolderName('');
          setParentFolderForNew(null);
        }}
        okText="Tạo thư mục"
        cancelText="Hủy"
        okButtonProps={{ disabled: !newFolderName.trim() }}
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

      {/* Modal: Rename Folder */}
      <Modal
        title="Đổi tên thư mục"
        open={renameModalOpen}
        onOk={handleConfirmRename}
        onCancel={() => {
          setRenameModalOpen(false);
          setRenamingFolder(null);
          setRenamedName('');
        }}
        okText="Lưu tên mới"
        cancelText="Hủy"
        okButtonProps={{ disabled: !renamedName.trim() }}
      >
        <Input
          placeholder="Nhập tên mới cho thư mục..."
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
