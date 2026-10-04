import React from 'react';
import { Breadcrumb, Button, Card, Col, Empty, Row, Space, Tag, Typography } from 'antd';
import {
  FolderFilled,
  FolderOpenFilled,
  PlusOutlined,
  UploadOutlined,
  FileTextOutlined,
  FormOutlined,
  FolderAddOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import type { Note } from '../../types/models';
import type { QuickFilterKey } from './DocFolderTree';

const { Title, Text, Paragraph } = Typography;

export interface DocFolderContentsViewProps {
  currentFolder: Note | null;
  folderPath: Note[];
  subfolders: Array<{ folder: Note; docCount: number }>;
  documents: Note[];
  activeFilter: QuickFilterKey | string;
  onNavigateFolder: (folderId: string | QuickFilterKey) => void;
  onSelectDoc: (doc: Note) => void;
  onCreateDoc: () => void;
  onCreateSubfolder?: () => void;
  onOpenZipImport?: () => void;
}

export const DocFolderContentsView: React.FC<DocFolderContentsViewProps> = ({
  currentFolder,
  folderPath,
  subfolders,
  documents,
  activeFilter,
  onNavigateFolder,
  onSelectDoc,
  onCreateDoc,
  onCreateSubfolder,
  onOpenZipImport,
}) => {
  const getFilterTitle = (): string => {
    if (currentFolder) return currentFolder.title || 'Thư mục không tên';
    switch (activeFilter) {
      case 'inbox':
        return 'Hộp thư đến (Inbox)';
      case 'pinned':
        return 'Tài liệu đã ghim';
      case 'all':
        return 'Tất cả tài liệu';
      case 'quick_notes':
        return 'Ghi chú nhanh';
      case 'trash':
        return 'Thùng rác';
      default:
        return 'Tài liệu';
    }
  };

  const getCleanSnippet = (body: string): string => {
    if (!body) return 'Chưa có nội dung';
    const clean = body
      .replace(/^#{1,6}\s+.+$/gm, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[\[.*?\]\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return clean || 'Chưa có nội dung xem trước';
  };

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        height: '100%',
        overflowY: 'auto',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          padding: '20px 24px 16px 24px',
          borderBottom: '1px solid #f0f0f0',
          backgroundColor: '#fafafa',
        }}
      >
        {/* Breadcrumbs */}
        <Breadcrumb
          style={{ marginBottom: 8, fontSize: 12 }}
          items={[
            {
              title: (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => onNavigateFolder('inbox')}
                  style={{ cursor: 'pointer', color: '#6366f1' }}
                >
                  Tài liệu
                </span>
              ),
            },
            ...folderPath.map((item, idx) => {
              const isLast = idx === folderPath.length - 1;
              return {
                title: isLast ? (
                  <span style={{ fontWeight: 600 }}>{item.title}</span>
                ) : (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => onNavigateFolder(item.id)}
                    style={{ cursor: 'pointer', color: '#6366f1' }}
                  >
                    {item.title}
                  </span>
                ),
              };
            }),
          ]}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {currentFolder ? (
              <FolderOpenFilled style={{ fontSize: 28, color: '#d97706' }} />
            ) : (
              <FolderFilled style={{ fontSize: 28, color: '#4f46e5' }} />
            )}
            <div>
              <Title level={4} style={{ margin: 0, color: '#1f2937' }}>
                {getFilterTitle()}
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {subfolders.length} thư mục con · {documents.length} tài liệu
              </Text>
            </div>
          </div>

          <Space size={8}>
            {onCreateSubfolder && (
              <Button size="middle" icon={<FolderAddOutlined />} onClick={onCreateSubfolder}>
                Thư mục con
              </Button>
            )}
            {onOpenZipImport && (
              <Button size="middle" icon={<UploadOutlined />} onClick={onOpenZipImport}>
                Nhập Zip
              </Button>
            )}
            <Button
              type="primary"
              size="middle"
              icon={<PlusOutlined />}
              onClick={onCreateDoc}
              style={{ backgroundColor: '#4f46e5' }}
            >
              Tạo tài liệu mới
            </Button>
          </Space>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Section 1: Subfolders */}
        {subfolders.length > 0 && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ fontSize: 14, color: '#374151' }}>
                Thư mục ({subfolders.length})
              </Text>
            </div>
            <Row gutter={[12, 12]}>
              {subfolders.map(({ folder, docCount }) => (
                <Col xs={24} sm={12} md={8} lg={6} key={folder.id}>
                  <Card
                    hoverable
                    size="small"
                    onClick={() => onNavigateFolder(folder.id)}
                    style={{
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      backgroundColor: '#fefce8',
                    }}
                    bodyStyle={{ padding: '12px 14px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FolderFilled style={{ fontSize: 22, color: '#d97706', flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <Text strong style={{ fontSize: 13, color: '#1f2937', display: 'block' }} ellipsis={{ tooltip: folder.title }}>
                          {folder.title || 'Thư mục không tên'}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {docCount} tài liệu
                        </Text>
                      </div>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        )}

        {/* Section 2: Documents */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 14, color: '#374151' }}>
              Tài liệu ({documents.length})
            </Text>
          </div>

          {documents.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  subfolders.length > 0
                    ? 'Chưa có tài liệu trực tiếp trong thư mục này. Bạn có thể mở các thư mục con phía trên hoặc tạo tài liệu mới.'
                    : 'Thư mục này đang trống'
                }
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={onCreateDoc} style={{ backgroundColor: '#4f46e5' }}>
                  Tạo tài liệu đầu tiên
                </Button>
              </Empty>
            </div>
          ) : (
            <Row gutter={[12, 12]}>
              {documents.map((doc) => {
                const isQuick = doc.type === 'quick_note';
                const snippet = getCleanSnippet(doc.body);
                const updatedTime = new Date(doc.updatedAt).toLocaleDateString('vi-VN', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                });

                return (
                  <Col xs={24} sm={12} md={12} lg={8} key={doc.id}>
                    <Card
                      hoverable
                      size="small"
                      onClick={() => onSelectDoc(doc)}
                      style={{
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                      bodyStyle={{
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        {isQuick ? (
                          <FormOutlined style={{ color: '#faad14', fontSize: 15 }} />
                        ) : (
                          <FileTextOutlined style={{ color: '#4f46e5', fontSize: 15 }} />
                        )}
                        <Text strong style={{ fontSize: 14, color: '#111827', flex: 1 }} ellipsis={{ tooltip: doc.title }}>
                          {doc.title || 'Không có tiêu đề'}
                        </Text>
                        {doc.isPinned && <Tag color="blue">Ghim</Tag>}
                      </div>

                      <Paragraph
                        type="secondary"
                        ellipsis={{ rows: 2 }}
                        style={{ fontSize: 12, marginBottom: 8, flex: 1, color: '#6b7280' }}
                      >
                        {snippet}
                      </Paragraph>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {doc.tags?.slice(0, 2).map((t) => (
                            <Tag key={t} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '18px' }}>
                              #{t}
                            </Tag>
                          ))}
                        </div>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          <CalendarOutlined style={{ marginRight: 4 }} />
                          {updatedTime}
                        </Text>
                      </div>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          )}
        </div>
      </div>
    </div>
  );
};
