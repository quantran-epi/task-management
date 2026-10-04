import React, { useEffect, useState } from 'react';
import { Drawer, Button, Typography, Space, Tag, Empty, Divider, Spin } from 'antd';
import {
  FileTextOutlined,
  ExportOutlined,
  LinkOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Note, Task, Project } from '../../types/models';
import { renderSafeMarkdown } from '../../utils/markdown';
import { getBacklinksForDoc, type BacklinksResult } from '../../db/repositories/documentLinkRepo';

const { Title, Text } = Typography;

export interface QuickPreviewDrawerProps {
  open: boolean;
  docId: string | null;
  onClose: () => void;
  onNavigateToDocs?: ((docId: string) => void) | undefined;
  db?: TaskPlannerDatabase;
}

/**
 * Slide-out document preview reader preserving ongoing task or chat context (D-07, D-13).
 * Renders on the right edge (`width: 480px`, `zIndex: 1100`).
 */
export const QuickPreviewDrawer: React.FC<QuickPreviewDrawerProps> = ({
  open,
  docId,
  onClose,
  onNavigateToDocs,
  db = defaultDb,
}) => {
  const [doc, setDoc] = useState<Note | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [backlinks, setBacklinks] = useState<BacklinksResult>({
    tasks: [],
    projects: [],
    referencingNotes: [],
  });

  useEffect(() => {
    let active = true;
    if (!open || !docId) {
      setDoc(null);
      setBacklinks({ tasks: [], projects: [], referencingNotes: [] });
      return () => {
        active = false;
      };
    }

    setLoading(true);
    void Promise.all([
      db.notes.get(docId),
      getBacklinksForDoc(docId, db),
    ])
      .then(([noteData, backlinksData]) => {
        if (!active) return;
        setDoc(noteData || null);
        setBacklinks(backlinksData);
      })
      .catch((err) => {
        console.error('[QuickPreviewDrawer] Failed to load document:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [db, docId, open]);

  const handleOpenInDocs = () => {
    if (!docId) return;
    if (onNavigateToDocs) {
      onNavigateToDocs(docId);
    } else {
      window.location.hash = `#/notes?doc=${encodeURIComponent(docId)}`;
    }
  };

  const hasBacklinks =
    backlinks.tasks.length > 0 ||
    backlinks.projects.length > 0 ||
    backlinks.referencingNotes.length > 0;

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <FileTextOutlined style={{ color: '#1677ff', flexShrink: 0 }} />
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 260,
            }}
          >
            {doc?.title || 'Xem nhanh tài liệu'}
          </span>
        </div>
      }
      placement="right"
      width={480}
      open={open}
      onClose={onClose}
      zIndex={1100}
      extra={
        <Space size="small">
          <Button
            type="primary"
            size="small"
            icon={<ExportOutlined />}
            onClick={handleOpenInDocs}
            disabled={!doc}
          >
            Mở trong Docs
          </Button>
        </Space>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <Spin tip="Đang tải tài liệu..." />
        </div>
      ) : !doc ? (
        <Empty description="Không tìm thấy tài liệu hoặc đã bị xóa" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Header metadata */}
          <div>
            <Title level={4} style={{ marginTop: 0, marginBottom: 8 }}>
              {doc.title || 'Untitled Document'}
            </Title>
            <Space orientation="horizontal" size={[4, 6]} wrap>
              {doc.tags?.map((tag) => (
                <Tag key={tag} color="blue">
                  {tag}
                </Tag>
              ))}
              {doc.updatedAt && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Cập nhật: {new Date(doc.updatedAt).toLocaleDateString()}
                </Text>
              )}
            </Space>
          </div>

          <Divider style={{ margin: '8px 0' }} />

          {/* Rendered markdown body */}
          <div
            className="chat-markdown-body quick-preview-markdown"
            dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(doc.body || '') }}
          />

          {/* Backlinks Section */}
          {hasBacklinks && (
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 10,
                  fontWeight: 600,
                  fontSize: 13,
                  color: '#595959',
                }}
              >
                <LinkOutlined />
                <span>Liên kết đến tài liệu này ({backlinks.tasks.length + backlinks.projects.length + backlinks.referencingNotes.length})</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {backlinks.tasks.map((task: Task) => (
                  <div
                    key={`task-backlink-${task.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      padding: '4px 8px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: 4,
                    }}
                  >
                    <CheckSquareOutlined style={{ color: '#1677ff' }} />
                    <span style={{ fontWeight: 500 }}>{task.name}</span>
                    {task.jiraKey && (
                      <Tag color="blue" style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
                        {task.jiraKey}
                      </Tag>
                    )}
                  </div>
                ))}

                {backlinks.projects.map((proj: Project) => (
                  <div
                    key={`proj-backlink-${proj.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      padding: '4px 8px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: 4,
                    }}
                  >
                    <ProjectOutlined style={{ color: '#722ed1' }} />
                    <span style={{ fontWeight: 500 }}>{proj.name}</span>
                  </div>
                ))}

                {backlinks.referencingNotes.map((refDoc: Note) => (
                  <div
                    key={`doc-backlink-${refDoc.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      padding: '4px 8px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: 4,
                    }}
                  >
                    <FileTextOutlined style={{ color: '#52c41a' }} />
                    <span style={{ fontWeight: 500 }}>{refDoc.title || 'Untitled Note'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
};
