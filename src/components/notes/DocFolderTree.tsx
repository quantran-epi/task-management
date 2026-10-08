import React, { useState, useMemo } from 'react';
import { Button, Dropdown, Input, Modal, Tooltip, Typography, type MenuProps } from 'antd';
import {
  FolderOutlined,
  FolderFilled,
  FolderOpenFilled,
  PlusOutlined,
  InboxOutlined,
  PushpinOutlined,
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
} from '@ant-design/icons';
import type { Note } from '../../types/models';

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
  notes: Note[];
  activeFilter: QuickFilterKey | string; // filter key or folderId
  onSelectFilter: (filterKeyOrFolderId: QuickFilterKey | string) => void;
  onCreateDoc: (targetFolderId?: string) => Promise<void> | void;
  onCreateFolder?: (folderName: string, parentId?: string) => Promise<void> | void;
  onRenameFolder?: (folderId: string, newName: string) => Promise<void> | void;
  onMoveFolder?: (folder: Note) => void;
  onDeleteFolder?: (folder: Note) => Promise<void> | void;
  onOpenZipImport?: () => void;
  activeTag?: string | null;
  onSelectTag?: (tag: string | null) => void;
}

export const DocFolderTree: React.FC<DocFolderTreeProps> = ({
  notes,
  activeFilter,
  onSelectFilter,
  onCreateDoc,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onOpenZipImport,
  activeTag,
  onSelectTag,
}) => {
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

  // 1. Separate deleted vs active notes
  const activeNotes = useMemo(() => notes.filter((n) => !n.deletedAt), [notes]);
  const trashNotes = useMemo(() => notes.filter((n) => Boolean(n.deletedAt)), [notes]);

  // 2. Count for quick filters
  const inboxCount = activeNotes.filter((n) => !n.parentId && (n.type === 'document' || !n.type)).length;
  const pinnedCount = activeNotes.filter((n) => n.isPinned).length;
  const allDocsCount = activeNotes.filter((n) => n.type === 'document' || !n.type).length;
  const stickyNotesCount = activeNotes.filter((n) => n.type === 'quick_note').length;
  const trashCount = trashNotes.length;

  // 3. Extract all tags with counts
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

  // 4. Build recursive folder tree
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

  // Auto-expand path to currently active folder
  React.useEffect(() => {
    if (typeof activeFilter === 'string') {
      const activeFolder = activeNotes.find((n) => n.id === activeFilter && n.type === 'folder');
      if (activeFolder && activeFolder.parentId) {
        setExpandedFolderIds((prev) => {
          const next = new Set(prev);
          let curr = activeFolder.parentId;
          while (curr) {
            next.add(curr);
            const parent = activeNotes.find((n) => n.id === curr);
            curr = parent?.parentId;
          }
          return next;
        });
      }
    }
  }, [activeFilter, activeNotes]);

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

  // Recursive folder node renderer
  const renderFolderNode = (node: FolderTreeNode): React.ReactNode => {
    const isActive = activeFilter === node.id;
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedFolderIds.has(node.id);

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
            onSelectFilter(node.id);
            if (onSelectTag) onSelectTag(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
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
            {hasChildren ? (
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
            {/* Badge count: shows direct count, tooltip shows total if has children */}
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

        {/* Recursive Children */}
        {hasChildren && isExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {node.children.map((child) => renderFolderNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="doc-folder-tree"
      style={{
        width: 260,
        minWidth: 260,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '12px 8px',
        backgroundColor: '#fafafa',
        borderRight: '1px solid #f0f0f0',
        overflowY: 'auto',
      }}
    >
      {/* Top CTA buttons */}
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
