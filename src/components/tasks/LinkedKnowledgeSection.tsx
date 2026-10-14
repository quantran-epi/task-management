import React, { useMemo } from 'react';
import { Tag, Typography, Tooltip, Spin, Popconfirm } from 'antd';
import {
  FileTextOutlined,
  DeploymentUnitOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Note, KnowledgeLink, TaskMateEntityType } from '../../types/models';
import { deleteKnowledgeLink } from '../../db/repositories/knowledgeLinkRepo';

const { Text } = Typography;

export interface LinkedKnowledgeSectionProps {
  taskId?: string | undefined;
  entityType?: TaskMateEntityType | undefined;
  entityId?: string | undefined;
  notes?: string | undefined;
  documentLinks?: string[] | undefined;
  onOpenDocPreview: (docId: string) => void;
  db?: TaskPlannerDatabase | undefined;
}

export const LinkedKnowledgeSection: React.FC<LinkedKnowledgeSectionProps> = ({
  taskId,
  entityType = 'task',
  entityId,
  notes,
  documentLinks = [],
  onOpenDocPreview,
  db = defaultDb,
}) => {
  const resolvedEntityId = entityId || taskId;

  // 1. Extract linked document UUIDs from wiki-links [[doc:uuid|...]] and documentLinks
  const docIds = useMemo(() => {
    const ids = new Set<string>();

    documentLinks.forEach((link) => {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(link)) {
        ids.add(link);
      }
    });

    if (notes) {
      const matches = notes.matchAll(/\[\[doc:([0-9a-f-]{36})(?:\|[^\]]+)?\]\]/gi);
      for (const m of matches) {
        if (m[1]) ids.add(m[1]);
      }
    }

    return Array.from(ids);
  }, [notes, documentLinks]);

  // Query legacy wiki-linked notes from DB
  const legacyDocs = useLiveQuery(
    async () => {
      if (docIds.length === 0) return [];
      const records = await db.notes.bulkGet(docIds);
      return records.filter((r): r is Note => Boolean(r && !r.deletedAt));
    },
    [docIds, db]
  );

  // Query first-class KnowledgeLink records
  const firstClassLinks = useLiveQuery(
    async () => {
      if (!resolvedEntityId) return [];
      return db.knowledgeLinks
        .where('taskMateEntityId')
        .equals(resolvedEntityId)
        .filter((l) => l.taskMateEntityType === entityType)
        .toArray();
    },
    [resolvedEntityId, entityType, db]
  );

  const handleDeleteLink = async (linkId: string) => {
    await deleteKnowledgeLink(linkId, db);
  };

  const hasLegacyDocs = (legacyDocs?.length ?? 0) > 0;
  const hasFirstClassLinks = (firstClassLinks?.length ?? 0) > 0;

  if (!hasLegacyDocs && !hasFirstClassLinks) {
    if (docIds.length > 0 && legacyDocs === undefined) {
      return (
        <div style={{ padding: '8px 12px' }}>
          <Spin size="small" />
        </div>
      );
    }
    return null;
  }

  const totalCount = (legacyDocs?.length || 0) + (firstClassLinks?.length || 0);

  return (
    <div
      className="linked-knowledge-section"
      style={{
        padding: '12px 14px',
        backgroundColor: '#fafafa',
        borderRadius: 8,
        border: '1px solid #f0f0f0',
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <DeploymentUnitOutlined style={{ color: '#4f46e5' }} />
        <Text strong style={{ fontSize: 13 }}>
          Tài liệu & Tri thức liên kết ({totalCount})
        </Text>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {/* Render legacy wiki-linked documents */}
        {legacyDocs?.map((doc) => (
          <Tooltip key={`legacy-${doc.id}`} title="Xem nhanh tài liệu này">
            <Tag
              color="purple"
              icon={<FileTextOutlined />}
              style={{
                cursor: 'pointer',
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
              onClick={() => onOpenDocPreview(doc.id)}
            >
              <span>{doc.title || 'Không tiêu đề'}</span>
            </Tag>
          </Tooltip>
        ))}

        {/* Render first-class KnowledgeLinks */}
        {firstClassLinks?.map((link: KnowledgeLink) => {
          const isGraphUrn = Boolean(link.urn);

          return (
            <Tag
              key={`link-${link.id}`}
              color={isGraphUrn ? 'geekblue' : 'purple'}
              icon={isGraphUrn ? <DeploymentUnitOutlined /> : <FileTextOutlined />}
              style={{
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                cursor: link.docId ? 'pointer' : 'default',
              }}
              onClick={() => {
                if (link.docId) onOpenDocPreview(link.docId);
              }}
            >
              <Tooltip
                title={
                  <div>
                    <div><strong>{link.displayLabel}</strong></div>
                    {link.urn && (
                      <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {link.urn}
                      </div>
                    )}
                    {link.docId && <div>Doc ID: {link.docId}</div>}
                  </div>
                }
              >
                <span>{link.displayLabel}</span>
              </Tooltip>

              <Popconfirm
                title="Gỡ liên kết tri thức này?"
                onConfirm={(e) => {
                  e?.stopPropagation();
                  handleDeleteLink(link.id);
                }}
                onCancel={(e) => e?.stopPropagation()}
                okText="Gỡ"
                cancelText="Hủy"
              >
                <CloseOutlined
                  style={{ fontSize: 10, marginLeft: 4, cursor: 'pointer' }}
                  onClick={(e) => e.stopPropagation()}
                />
              </Popconfirm>
            </Tag>
          );
        })}
      </div>
    </div>
  );
};
