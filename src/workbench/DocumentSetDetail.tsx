import { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Empty, Table, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TaskPlannerDatabase } from '../db';
import { useOptionalKnowledgeConfig } from '../services/knowledge/knowledgeConfig';
import { createKnowledgeClient } from '../services/knowledge/knowledgeClient';
import { DocumentSetDeleteDialog } from '../components/knowledge/DocumentSetDeleteDialog';
import type { DocumentSet, Note } from '../types/models';

const { Paragraph, Text, Title } = Typography;

/** Fixed page size for the bounded document list in a doc_set tab (D-08 / T-45-04). */
export const DOC_SET_PAGE_SIZE = 10;

export interface DocumentSetDetailProps {
  setId: string;
  db?: TaskPlannerDatabase | undefined;
}

interface DocumentRow {
  key: string;
  id: string;
  title: string;
  updatedAt: string;
}

/**
 * Bounded document-set detail mounted by the `doc_set` editor tab.
 * All reads are local (IndexedDB); the optional knowledge client is used only by the
 * shared delete dialog, never to browse or render documents.
 */
export function DocumentSetDetail({ setId, db }: DocumentSetDetailProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const knowledgeConfig = useOptionalKnowledgeConfig();
  const client = useMemo(() => {
    if (!db || !knowledgeConfig.enabled || !knowledgeConfig.baseUrl) return undefined;
    return createKnowledgeClient({
      baseUrl: knowledgeConfig.baseUrl,
      token: knowledgeConfig.token,
      db,
    });
  }, [db, knowledgeConfig.enabled, knowledgeConfig.baseUrl, knowledgeConfig.token]);

  const set = useLiveQuery(async () => {
    if (!db) return null;
    const record = await db.documentSets.get(setId);
    return record ?? null;
  }, [db, setId], null);

  const documentIdsKey = set?.documentIds.join(',') ?? '';
  const documents = useLiveQuery(async () => {
    if (!db || !set) return [] as Note[];
    const found = await db.notes.bulkGet(set.documentIds);
    return found.filter((note): note is Note => Boolean(note) && note?.type !== 'folder');
  }, [db, set?.id, documentIdsKey], [] as Note[]);

  const published = useLiveQuery(async () => {
    if (!db || !set) return false;
    return (await db.publishedDocuments.where('setId').equals(set.id).count()) > 0;
  }, [db, set?.id], false);

  const handleCloseDelete = useCallback(() => setDeleteOpen(false), []);

  if (!set) {
    return (
      <div style={{ padding: 24 }}>
        <Empty
          description="Không tìm thấy bộ tài liệu. Bộ tài liệu có thể đã bị xóa hoặc chưa được đồng bộ cục bộ."
        />
      </div>
    );
  }

  const rows: DocumentRow[] = documents.map((note) => ({
    key: note.id,
    id: note.id,
    title: note.title || 'Không tiêu đề',
    updatedAt: note.updatedAt,
  }));

  return (
    <div
      data-testid="doc-set-detail"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 12 }}
    >
      <div style={{ flexShrink: 0 }}>
        <Title level={4} style={{ margin: 0, fontSize: 20 }}>
          {set.name}
        </Title>
        {set.description ? (
          <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            {set.description}
          </Paragraph>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {rows.length} tài liệu trong bộ tài liệu này
          </Text>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Xóa bộ tài liệu ${set.name}`}
            onClick={() => setDeleteOpen(true)}
          >
            Xóa bộ tài liệu
          </Button>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        message="Dữ liệu bộ tài liệu được đọc từ máy local (IndexedDB). Việc xóa bộ tài liệu có thể yêu cầu Knowledge Server nếu set đã được xuất bản."
        style={{ flexShrink: 0 }}
      />

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Table<DocumentRow>
          rowKey="key"
          size="small"
          dataSource={rows}
          pagination={{ pageSize: DOC_SET_PAGE_SIZE, showSizeChanger: false }}
          locale={{ emptyText: 'Bộ tài liệu này chưa có tài liệu nào.' }}
          columns={[
            {
              title: 'Tài liệu',
              dataIndex: 'title',
              key: 'title',
              ellipsis: true,
            },
            {
              title: 'Cập nhật',
              dataIndex: 'updatedAt',
              key: 'updatedAt',
              width: 180,
              ellipsis: true,
              render: (value: string) => <Text style={{ fontSize: 12 }}>{value}</Text>,
            },
          ]}
        />
      </div>

      <DocumentSetDeleteDialog
        open={deleteOpen}
        set={set as DocumentSet}
        database={db as TaskPlannerDatabase}
        {...(client ? { client } : {})}
        published={published}
        onClose={handleCloseDelete}
      />
    </div>
  );
}

export default DocumentSetDetail;
