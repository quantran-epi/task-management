import React, { useState, useMemo } from 'react';
import { Input, Select, Typography, Empty, Tag, Dropdown, type MenuProps } from 'antd';
import {
  SearchOutlined,
  PushpinFilled,
  PushpinOutlined,
  FolderOutlined,
  DeleteOutlined,
  MoreOutlined,
  FileTextOutlined,
  FormOutlined,
} from '@ant-design/icons';
import type { Note } from '../../types/models';

const { Text } = Typography;

export type DocSortOption = 'updatedAt' | 'title' | 'createdAt';

export interface DocListPaneProps {
  notes: Note[];
  selectedDocId?: string | null | undefined;
  onSelectDoc: (doc: Note) => void;
  onTogglePin?: ((doc: Note) => void) | undefined;
  onMoveToFolder?: ((doc: Note) => void) | undefined;
  onDeleteDoc?: ((doc: Note) => void) | undefined;
}

export const DocListPane: React.FC<DocListPaneProps> = ({
  notes,
  selectedDocId,
  onSelectDoc,
  onTogglePin,
  onMoveToFolder,
  onDeleteDoc,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<DocSortOption>('updatedAt');

  // Filter and sort documents
  const filteredAndSortedDocs = useMemo(() => {
    let result = [...notes];

    // Filter by search term
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter((n) => {
        const titleMatch = (n.title || '').toLowerCase().includes(q);
        const bodyMatch = (n.body || '').toLowerCase().includes(q);
        const tagMatch = n.tags?.some((t) => t.toLowerCase().includes(q));
        return Boolean(titleMatch || bodyMatch || tagMatch);
      });
    }

    // Sort
    result.sort((a, b) => {
      // Pinned notes always on top
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortBy === 'createdAt') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      // default: updatedAt descending
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return result;
  }, [notes, searchTerm, sortBy]);

  const getItemMenuItems = (doc: Note): MenuProps['items'] => [
    {
      key: 'pin',
      label: doc.isPinned ? 'Bỏ ghim' : 'Ghim lên đầu',
      icon: doc.isPinned ? <PushpinOutlined /> : <PushpinFilled />,
      onClick: () => onTogglePin?.(doc),
    },
    ...(onMoveToFolder
      ? [
          {
            key: 'move',
            label: 'Chuyển thư mục',
            icon: <FolderOutlined />,
            onClick: () => onMoveToFolder(doc),
          },
        ]
      : []),
    {
      type: 'divider',
    },
    {
      key: 'delete',
      label: doc.deletedAt ? 'Xóa vĩnh viễn' : 'Chuyển vào thùng rác',
      danger: true,
      icon: <DeleteOutlined />,
      onClick: () => onDeleteDoc?.(doc),
    },
  ];

  const getCleanSnippet = (body: string): string => {
    if (!body) return 'Không có nội dung';
    // Strip markdown headings, tags, image syntax for snippet preview
    const clean = body
      .replace(/^#{1,6}\s+.+$/gm, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[\[.*?\]\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return clean || 'Không có nội dung xem trước';
  };

  return (
    <div
      className="doc-list-pane"
      style={{
        width: 300,
        minWidth: 260,
        maxWidth: 380,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#fafafa',
        borderRight: '1px solid #f0f0f0',
      }}
    >
      {/* Header with Search and Sort */}
      <div style={{ padding: '12px 12px 8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Input
          placeholder="Tìm trong danh sách..."
          prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          allowClear
          size="middle"
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {filteredAndSortedDocs.length} tài liệu
          </Text>
          <Select
            size="small"
            value={sortBy}
            onChange={(val) => setSortBy(val)}
            style={{ width: 140 }}
            options={[
              { value: 'updatedAt', label: 'Thời gian cập nhật' },
              { value: 'title', label: 'Tiêu đề' },
              { value: 'createdAt', label: 'Ngày tạo' },
            ]}
          />
        </div>
      </div>

      {/* Document List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 8px 12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {filteredAndSortedDocs.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có tài liệu nào"
            style={{ marginTop: 48 }}
          />
        ) : (
          filteredAndSortedDocs.map((doc) => {
            const isSelected = selectedDocId === doc.id;
            const snippet = getCleanSnippet(doc.body);
            const isQuickNote = doc.type === 'quick_note';

            return (
              <div
                key={doc.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectDoc(doc)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectDoc(doc);
                  }
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  backgroundColor: isSelected ? '#f0f2ff' : '#ffffff',
                  border: isSelected ? '1px solid #c7d2fe' : '1px solid #f0f0f0',
                  borderLeft: isSelected ? '3px solid #4f46e5' : '1px solid #f0f0f0',
                  boxShadow: isSelected ? '0 1px 3px rgba(79, 70, 229, 0.1)' : 'none',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                    {isQuickNote ? (
                      <FormOutlined style={{ fontSize: 13, color: '#faad14' }} />
                    ) : (
                      <FileTextOutlined style={{ fontSize: 13, color: '#4f46e5' }} />
                    )}
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: isSelected ? '#4f46e5' : '#262626',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {doc.title || 'Không tiêu đề'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {doc.isPinned && <PushpinFilled style={{ color: '#4f46e5', fontSize: 11 }} />}
                    <Dropdown menu={{ items: getItemMenuItems(doc) ?? [] }} trigger={['click']}>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        style={{
                          cursor: 'pointer',
                          padding: '0 4px',
                          color: '#8c8c8c',
                          fontSize: 12,
                        }}
                      >
                        <MoreOutlined />
                      </span>
                    </Dropdown>
                  </div>
                </div>

                {/* Snippet (2 lines max) */}
                <div
                  style={{
                    fontSize: 12,
                    color: '#8c8c8c',
                    marginTop: 4,
                    lineHeight: '1.4',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {snippet}
                </div>

                {/* Footer metadata: Tags & Date */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 8,
                    fontSize: 11,
                    color: '#bfbfbf',
                  }}
                >
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: '70%' }}>
                    {doc.tags?.slice(0, 2).map((t) => (
                      <Tag key={t} style={{ margin: 0, fontSize: 10, padding: '0 4px', borderRadius: 4 }}>
                        #{t}
                      </Tag>
                    ))}
                    {(doc.tags?.length || 0) > 2 && (
                      <span style={{ fontSize: 10 }}>+{(doc.tags?.length || 0) - 2}</span>
                    )}
                  </div>
                  <span>{new Date(doc.updatedAt).toLocaleDateString('vi-VN')}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
