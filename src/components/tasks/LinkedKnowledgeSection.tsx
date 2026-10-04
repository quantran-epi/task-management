import React, { useMemo } from 'react';
import { Tag, Typography, Button, Tooltip, Empty } from 'antd';
import { FileTextOutlined, LinkOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Note } from '../../types/models';

const { Text } = Typography;

export interface LinkedKnowledgeSectionProps {
  taskId: string;
  notes?: string | undefined;
  documentLinks?: string[] | undefined;
  onOpenDocPreview: (docId: string) => void;
  db?: TaskPlannerDatabase;
}

export const LinkedKnowledgeSection: React.FC<LinkedKnowledgeSectionProps> = ({
  taskId,
  notes,
  documentLinks = [],
  onOpenDocPreview,
  db = defaultDb,
}) => {
  // 1. Extract linked document UUIDs from wiki-links [[doc:uuid|...]] and documentLinks
  const docIds = useMemo(() => {
    const ids = new Set<string>();

    // From documentLinks array (could contain doc IDs or URLs)
    documentLinks.forEach((link) => {
      // UUID pattern check
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(link)) {
        ids.add(link);
      }
    });

    // From notes text wiki-links [[doc:id|...]]
    if (notes) {
      const matches = notes.matchAll(/\[\[doc:([0-9a-f-]{36})(?:\|[^\]]+)?\]\]/gi);
      for (const m of matches) {
        if (m[1]) ids.add(m[1]);
      }
    }

    return Array.from(ids);
  }, [notes, documentLinks]);

  // Query notes from DB
  const linkedDocs = useLiveQuery(
    async () => {
      if (docIds.length === 0) return [];
      const records = await db.notes.bulkGet(docIds);
      return records.filter((r): r is Note => Boolean(r && !r.deletedAt));
    },
    [docIds, db]
  );

  if (docIds.length === 0 && (!linkedDocs || linkedDocs.length === 0)) {
    return null;
  }

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
        <FileTextOutlined style={{ color: '#4f46e5' }} />
        <Text strong style={{ fontSize: 13 }}>
          Tài liệu & Tri thức liên kết ({linkedDocs?.length || 0})
        </Text>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {linkedDocs && linkedDocs.length > 0 ? (
          linkedDocs.map((doc) => (
            <Tooltip key={doc.id} title="Xem nhanh tài liệu này">
              <Tag
                color="purple"
                icon={<FileTextOutlined />}
                style={{
                  cursor: 'pointer',
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                onClick={() => onOpenDocPreview(doc.id)}
              >
                <span>{doc.title || 'Không tiêu đề'}</span>
              </Tag>
            </Tooltip>
          ))
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Đang tải tài liệu...
          </Text>
        )}
      </div>
    </div>
  );
};
