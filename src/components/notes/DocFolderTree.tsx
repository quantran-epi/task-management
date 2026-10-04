import React, { useState } from 'react';
import { Button, Input, Modal, Tag, Tooltip, Tree, Typography } from 'antd';
import type { TreeDataNode } from 'antd';
import {
  FolderOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  InboxOutlined,
  PushpinOutlined,
  FileTextOutlined,
  FormOutlined,
  DeleteOutlined,
  TagOutlined,
} from '@ant-design/icons';
import type { Note } from '../../types/models';

const { Text } = Typography;

export type QuickFilterKey = 'inbox' | 'pinned' | 'all' | 'quick_notes' | 'trash';

export interface DocFolderTreeProps {
  notes: Note[];
  activeFilter: QuickFilterKey | string; // filter key or folderId
  onSelectFilter: (filterKeyOrFolderId: QuickFilterKey | string) => void;
  onCreateDoc: () => void;
  onCreateFolder?: (folderName: string, parentId?: string) => Promise<void> | void;
  activeTag?: string | null;
  onSelectTag?: (tag: string | null) => void;
}

export const DocFolderTree: React.FC<DocFolderTreeProps> = ({
  notes,
  activeFilter,
  onSelectFilter,
  onCreateDoc,
  onCreateFolder,
  activeTag,
  onSelectTag,
}) => {
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

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

  // 4. Folder structure: notes of type folder (or parentId groups)
  const folders = React.useMemo(() => {
    return activeNotes.filter((n) => n.type === 'folder');
  }, [activeNotes]);

  const treeData: TreeDataNode[] = React.useMemo(() => {
    return folders.map((f) => {
      const childDocCount = activeNotes.filter((n) => n.parentId === f.id && n.type !== 'folder').length;
      return {
        key: f.id,
        title: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.title || 'Thư mục không tên'}
            </span>
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
              {childDocCount}
            </Text>
          </div>
        ),
        icon: ({ expanded }: { expanded?: boolean }) =>
          expanded ? <FolderOpenOutlined style={{ color: '#faad14' }} /> : <FolderOutlined style={{ color: '#faad14' }} />,
      };
    });
  }, [folders, activeNotes]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    if (onCreateFolder) {
      await onCreateFolder(newFolderName.trim());
    }
    setNewFolderName('');
    setNewFolderModalOpen(false);
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
        width: 220,
        minWidth: 220,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '12px 8px',
        backgroundColor: '#fafafa',
        borderRight: '1px solid #f0f0f0',
      }}
    >
      {/* Top CTA buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <Button
          type="primary"
          style={{ flex: 1, backgroundColor: '#4f46e5' }}
          icon={<PlusOutlined />}
          onClick={onCreateDoc}
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
                transition: 'background 0.2s',
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
      {treeData.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ padding: '0 8px 4px 8px', fontSize: 11, fontWeight: 600, color: '#8c8c8c' }}>
            THƯ MỤC
          </div>
          <Tree
            showIcon
            blockNode
            selectedKeys={typeof activeFilter === 'string' && !quickFilterItems.some((q) => q.key === activeFilter) ? [activeFilter] : []}
            onSelect={(keys) => {
              if (keys.length > 0 && keys[0]) {
                onSelectFilter(keys[0] as string);
                if (onSelectTag) onSelectTag(null);
              }
            }}
            treeData={treeData}
            style={{ backgroundColor: 'transparent' }}
          />
        </div>
      )}

      {/* Tags Section */}
      {tagCounts.length > 0 && (
        <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px 6px 8px', fontSize: 11, fontWeight: 600, color: '#8c8c8c' }}>
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
    </div>
  );
};
