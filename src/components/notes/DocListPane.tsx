import React, { useState, useMemo } from 'react';
import { Input, Select, Typography, Empty, Tag, Dropdown, Button, Tooltip, type MenuProps } from 'antd';
import { useDocWorkerSearch } from '../../hooks/useDocWorkerSearch';
import {
  SearchOutlined,
  PushpinFilled,
  PushpinOutlined,
  FolderOutlined,
  FolderFilled,
  PlusOutlined,
  DeleteOutlined,
  MoreOutlined,
  FileTextOutlined,
  FormOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { Note } from '../../types/models';
import type { DocumentPublishStatus } from '../../db/repositories/documentSetRepo';
import { matchesDocSearch } from '../../utils/docSearch';
import { DocPublishBadge } from '../knowledge/DocPublishBadge';

const { Text } = Typography;

export type DocSortOption = 'updatedAt' | 'title' | 'createdAt';

export interface DocListPaneProps {
  notes: Note[];
  selectedDocId?: string | null | undefined;
  activeFilter?: string | undefined;
  onSelectDoc: (doc: Note) => void;
  onTogglePin?: ((doc: Note) => void) | undefined;
  onMoveToFolder?: ((doc: Note) => void) | undefined;
  onDeleteDoc?: ((doc: Note) => void) | undefined;
  onRestoreDoc?: ((doc: Note) => void) | undefined;
  currentFolder?: Note | null | undefined;
  folderPath?: Note[] | undefined;
  onNavigateFolder?: ((folderId: string) => void) | undefined;
  onCreateDoc?: (() => void) | undefined;
  publishStatuses?: Readonly<Record<string, DocumentPublishStatus>> | undefined;
  compactPublishBadges?: boolean | undefined;
}

export const DocListPane: React.FC<DocListPaneProps> = ({
  notes,
  selectedDocId,
  activeFilter,
  onSelectDoc,
  onTogglePin,
  onMoveToFolder,
  onDeleteDoc,
  onRestoreDoc,
  currentFolder,
  folderPath,
  onNavigateFolder,
  onCreateDoc,
  publishStatuses,
  compactPublishBadges,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<DocSortOption>('updatedAt');

  const { matchIds } = useDocWorkerSearch(notes, searchTerm);

  // Filter and sort documents
  const filteredAndSortedDocs = useMemo(() => {
    let result = [...notes];

    // Filter by search term
    if (searchTerm.trim()) {
      if (matchIds !== null) {
        const idSet = new Set(matchIds);
        result = result.filter((n) => idSet.has(n.id));
      } else {
        result = result.filter((n) => matchesDocSearch(searchTerm, n));
      }
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
  }, [notes, searchTerm, sortBy, matchIds]);

  const getItemMenuItems = (doc: Note): MenuProps['items'] => {
    if (doc.deletedAt) {
      return [
        ...(onRestoreDoc
          ? [
              {
                key: 'restore',
                label: 'Khôi phục tài liệu',
                icon: <UndoOutlined style={{ color: '#16a34a' }} />,
                onClick: () => onRestoreDoc(doc),
              },
            ]
          : []),
        {
          key: 'delete',
          label: 'Xóa vĩnh viễn',
          danger: true,
          icon: <DeleteOutlined />,
          onClick: () => onDeleteDoc?.(doc),
        },
      ];
    }

    return [
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
        label: 'Chuyển vào thùng rác',
        danger: true,
        icon: <DeleteOutlined />,
        onClick: () => onDeleteDoc?.(doc),
      },
    ];
  };

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
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#fafafa',
        borderRight: '1px solid #f0f0f0',
      }}
    >
      {/* Header with Search and Sort */}
      <div style={{ padding: '12px 12px 8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Optional Current Folder Scope Indicator with Breadcrumbs */}
        {currentFolder && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              backgroundColor: '#fef3c7',
              borderRadius: 6,
              border: '1px solid #fde68a',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
              <FolderFilled style={{ color: '#d97706', fontSize: 15, flexShrink: 0 }} />
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 12,
                  color: '#92400e',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {folderPath && folderPath.length > 1 ? (
                  folderPath.map((item, idx) => {
                    const isLast = idx === folderPath.length - 1;
                    return (
                      <React.Fragment key={item.id}>
                        {idx > 0 && <span style={{ color: '#d97706', opacity: 0.6 }}>/</span>}
                        {isLast ? (
                          <span style={{ fontWeight: 700 }} title={item.title}>
                            {item.title}
                          </span>
                        ) : (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => onNavigateFolder?.(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') onNavigateFolder?.(item.id);
                            }}
                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                            title={`Đi tới thư mục ${item.title}`}
                          >
                            {item.title}
                          </span>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <span title={currentFolder.title || 'Thư mục'}>{currentFolder.title || 'Thư mục'}</span>
                )}
              </div>
            </div>
            {onCreateDoc && (
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={onCreateDoc}
                style={{
                  fontSize: 11,
                  height: 24,
                  padding: '0 8px',
                  backgroundColor: '#d97706',
                  borderColor: '#d97706',
                  flexShrink: 0,
                  marginLeft: 6,
                }}
              >
                Tạo
              </Button>
            )}
          </div>
        )}

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
          <div style={{ marginTop: 48, textAlign: 'center', padding: '0 16px' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                currentFolder
                  ? `Thư mục "${currentFolder.title}" chưa có tài liệu`
                  : activeFilter === 'quick_notes'
                    ? 'Chưa có ghi chú nhanh nào'
                    : 'Chưa có tài liệu nào'
              }
            />
            {onCreateDoc && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={onCreateDoc}
                style={{ marginTop: 12, backgroundColor: '#4f46e5' }}
              >
                {currentFolder
                  ? `Tạo tài liệu trong "${currentFolder.title}"`
                  : activeFilter === 'quick_notes'
                    ? 'Tạo ghi chú nhanh mới'
                    : 'Tạo tài liệu mới'}
              </Button>
            )}
          </div>
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
                  borderLeft: isSelected ? '3px solid #4f46e5' : '3px solid transparent',
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
                    {doc.deletedAt && onRestoreDoc && (
                      <Tooltip title="Khôi phục tài liệu">
                        <Button
                          type="text"
                          size="small"
                          icon={<UndoOutlined style={{ color: '#16a34a', fontSize: 12 }} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRestoreDoc(doc);
                          }}
                          style={{ width: 22, height: 22, padding: 0 }}
                        />
                      </Tooltip>
                    )}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <DocPublishBadge status={publishStatuses?.[doc.id]} compact={compactPublishBadges} />
                    <span>{new Date(doc.updatedAt).toLocaleDateString('vi-VN')}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
