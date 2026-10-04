import React, { useState } from 'react';
import { Button, Dropdown, Input, Modal, Tag, Tooltip, Typography, type MenuProps } from 'antd';
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
} from '@ant-design/icons';
import type { Note } from '../../types/models';

const { Text } = Typography;

export type QuickFilterKey = 'inbox' | 'pinned' | 'all' | 'quick_notes' | 'trash';

export interface DocFolderTreeProps {
  notes: Note[];
  activeFilter: QuickFilterKey | string; // filter key or folderId
  onSelectFilter: (filterKeyOrFolderId: QuickFilterKey | string) => void;
  onCreateDoc: (targetFolderId?: string) => Promise<void> | void;
  onCreateFolder?: (folderName: string, parentId?: string) => Promise<void> | void;
  onRenameFolder?: (folderId: string, newName: string) => Promise<void> | void;
  onDeleteFolder?: (folder: Note) => Promise<void> | void;
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
  onDeleteFolder,
  activeTag,
  onSelectTag,
}) => {
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Rename folder modal state
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<{ id: string; name: string } | null>(null);
  const [renamedName, setRenamedName] = useState('');

  // 1. Separate deleted vs active notes
  const activeNotes = notes.filter((n) => !n.deletedAt);
  const trashNotes = notes.filter((n) => Boolean(n.deletedAt));

  // 2. Count for quick filters
  const inboxCount = activeNotes.filter((n) => !n.parentId && (n.type === 'document' || !n.type)).length;
  const pinnedCount = activeNotes.filter((n) => n.isPinned).length;
  const allDocsCount = activeNotes.filter((n) => n.type === 'document' || !n.type).length;
  const stickyNotesCount = activeNotes.filter((n) => n.type === 'quick_note').length;
  const trashCount = trashNotes.length;

  // 3. Extract all tags with counts
  const tagCounts = React.useMemo(() => {
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

  // 4. Folder structure: notes of type folder
  const folders = React.useMemo(() => {
    return activeNotes.filter((n) => n.type === 'folder');
  }, [activeNotes]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    if (onCreateFolder) {
      await onCreateFolder(newFolderName.trim());
    }
    setNewFolderName('');
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

  return (
    <div
      className="doc-folder-tree"
      style={{
        width: 230,
        minWidth: 230,
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
      <div style={{ display: 'flex', gap: 6 }}>
        <Button
          type="primary"
          style={{ flex: 1, backgroundColor: '#4f46e5' }}
          icon={<PlusOutlined />}
          onClick={() => {
            const targetFolder = typeof activeFilter === 'string' && !quickFilterItems.some((q) => q.key === activeFilter)
              ? activeFilter
              : undefined;
            onCreateDoc(targetFolder);
          }}
        >
          Tạo tài liệu
        </Button>
        <Tooltip title="Tạo thư mục mới">
          <Button
            icon={<FolderOutlined />}
            onClick={() => setNewFolderModalOpen(true)}
          />
        </Tooltip>
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
          <Tooltip title="Thêm thư mục mới">
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined style={{ fontSize: 11, color: '#8c8c8c' }} />}
              onClick={() => setNewFolderModalOpen(true)}
              style={{ width: 22, height: 22, padding: 0 }}
            />
          </Tooltip>
        </div>

        {folders.length === 0 ? (
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
              onClick={() => setNewFolderModalOpen(true)}
              style={{ fontSize: 11 }}
            >
              Tạo thư mục
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {folders.map((f) => {
              const isActive = activeFilter === f.id;
              const childDocCount = activeNotes.filter((n) => n.parentId === f.id && n.type !== 'folder').length;

              const folderMenu: MenuProps['items'] = [
                {
                  key: 'create_doc',
                  label: 'Tạo tài liệu trong thư mục',
                  icon: <FileAddOutlined />,
                  onClick: () => onCreateDoc(f.id),
                },
                {
                  key: 'rename',
                  label: 'Đổi tên thư mục',
                  icon: <EditOutlined />,
                  onClick: () => handleOpenRename(f),
                },
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
                        onClick: () => onDeleteFolder(f),
                      },
                    ]
                  : []),
              ];

              return (
                <div
                  key={f.id}
                  className="doc-folder-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onSelectFilter(f.id);
                    if (onSelectTag) onSelectTag(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectFilter(f.id);
                      if (onSelectTag) onSelectTag(null);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    backgroundColor: isActive ? '#fef3c7' : 'transparent',
                    color: isActive ? '#92400e' : '#262626',
                    fontWeight: isActive ? 600 : 400,
                    fontSize: 13,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Left: Folder Icon and Name */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <span style={{ fontSize: 15, flexShrink: 0 }}>
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
                      title={f.title || 'Thư mục không tên'}
                    >
                      {f.title || 'Thư mục không tên'}
                    </span>
                  </div>

                  {/* Right: Count and Actions */}
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
                    {/* Badge count */}
                    <span
                      style={{
                        fontSize: 11,
                        padding: '1px 6px',
                        borderRadius: 10,
                        backgroundColor: isActive ? '#fde68a' : '#f0f0f0',
                        color: isActive ? '#b45309' : '#8c8c8c',
                      }}
                    >
                      {childDocCount}
                    </span>

                    {/* Quick Add Doc to Folder */}
                    <Tooltip title="Thêm tài liệu vào thư mục này">
                      <Button
                        type="text"
                        size="small"
                        icon={<FileAddOutlined style={{ fontSize: 13, color: isActive ? '#b45309' : '#6b7280' }} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateDoc(f.id);
                        }}
                        style={{ width: 22, height: 22, padding: 0 }}
                      />
                    </Tooltip>

                    {/* Folder menu (rename/delete) */}
                    <Dropdown menu={{ items: folderMenu }} trigger={['click']} placement="bottomRight">
                      <Button
                        type="text"
                        size="small"
                        icon={<MoreOutlined style={{ fontSize: 13, color: isActive ? '#b45309' : '#6b7280' }} />}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: 22, height: 22, padding: 0 }}
                      />
                    </Dropdown>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tags Section */}
      {tagCounts.length > 0 && (
        <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px 6px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#8c8c8c' }}>
            <TagOutlined style={{ fontSize: 11 }} />
            <span>NHÃN (TAGS)</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 120, overflowY: 'auto', padding: '0 4px' }}>
            {tagCounts.map(([tag, count]) => {
              const isTagActive = activeTag === tag;
              return (
                <Tag
                  key={tag}
                  color={isTagActive ? 'purple' : 'default'}
                  style={{ cursor: 'pointer', margin: 0, fontSize: 11 }}
                  onClick={() => onSelectTag?.(isTagActive ? null : tag)}
                >
                  #{tag} ({count})
                </Tag>
              );
            })}
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      <Modal
        title="Tạo thư mục mới"
        open={newFolderModalOpen}
        onOk={handleCreateFolder}
        onCancel={() => {
          setNewFolderName('');
          setNewFolderModalOpen(false);
        }}
        okText="Tạo"
        cancelText="Hủy"
        okButtonProps={{ disabled: !newFolderName.trim() }}
      >
        <Input
          placeholder="Tên thư mục (ví dụ: Nghiệp vụ, Dự án, Cá nhân...)"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onPressEnter={handleCreateFolder}
          autoFocus
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
        okButtonProps={{ disabled: !renamedName.trim() }}
      >
        <Input
          placeholder="Tên thư mục mới"
          value={renamedName}
          onChange={(e) => setRenamedName(e.target.value)}
          onPressEnter={handleConfirmRename}
          autoFocus
        />
      </Modal>
    </div>
  );
};
