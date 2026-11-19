import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, List, Space, Tag, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { createDocumentSet } from '../db/repositories/documentSetRepo';
import { DocumentSetForm, type DocumentSetFormValue } from '../components/knowledge/DocumentSetForm';
import { useLayoutStore } from './store/layoutStore';
import { DocumentSetDetail } from './DocumentSetDetail';
import type { Note } from '../types/models';

const { Text } = Typography;

export interface DocSetLibraryProps {
  db?: TaskPlannerDatabase | undefined;
  selectedSetId?: unknown;
}

/** One tab for all document sets: left list, right detail. No browsing modal. */
export function DocSetLibrary({ db = defaultDb, selectedSetId }: DocSetLibraryProps) {
  const openTab = useLayoutStore((s) => s.openTab);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  const sets = useLiveQuery(async () => {
    const rows = await db.documentSets.toArray();
    return rows.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [db], []);
  const notes = useLiveQuery(async () => db.notes.toArray(), [db], []);

  const requestedId = typeof selectedSetId === 'string' ? selectedSetId : undefined;
  const [localSelectedId, setLocalSelectedId] = useState<string | undefined>(requestedId);
  const selectedId = requestedId ?? localSelectedId ?? sets[0]?.id;

  useEffect(() => {
    if (selectedId && selectedId !== requestedId) {
      openTab({
        id: 'doc_set_library',
        title: `Bộ tài liệu: ${sets.find((set) => set.id === selectedId)?.name ?? ''}`,
        viewType: 'doc_set_library',
        closable: true,
        params: { selectedSetId: selectedId },
      });
    }
  }, [openTab, requestedId, selectedId, sets]);

  const formNotes = useMemo(
    () => notes.filter((note) => note.type !== 'folder' && note.type !== 'diagram' && !note.deletedAt),
    [notes]
  );

  const filteredSets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sets;
    return sets.filter((set) => set.name.toLowerCase().includes(query));
  }, [search, sets]);

  const selectSet = (setId: string, name: string) => {
    setLocalSelectedId(setId);
    setCreating(false);
    openTab({
      id: 'doc_set_library',
      title: `Bộ tài liệu: ${name}`,
      viewType: 'doc_set_library',
      closable: true,
      params: { selectedSetId: setId },
    });
  };

  const handleCreate = async (value: DocumentSetFormValue) => {
    try {
      const created = await createDocumentSet(value, db);
      message.success('Đã tạo bộ tài liệu mới');
      setCreating(false);
      selectSet(created.id, created.name);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Không thể lưu bộ tài liệu');
    }
  };

  return (
    <div
      data-testid="doc-set-library"
      style={{ display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden' }}
    >
      <div
        data-testid="doc-set-library-list"
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: '1px solid var(--ant-color-border, #f0f0f0)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <Space direction="vertical" size="small" style={{ padding: 12 }}>
          <Button icon={<PlusOutlined />} onClick={() => setCreating(true)} block>
            Tạo bộ tài liệu
          </Button>
          <Input.Search
            placeholder="Tìm bộ tài liệu"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            allowClear
          />
        </Space>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <List
            size="small"
            dataSource={filteredSets}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có bộ tài liệu" /> }}
            renderItem={(set) => {
              const active = set.id === selectedId && !creating;
              return (
                <List.Item
                  key={set.id}
                  role="button"
                  aria-label={`Mở bộ tài liệu ${set.name}`}
                  onClick={() => selectSet(set.id, set.name)}
                  style={{
                    cursor: 'pointer',
                    padding: '8px 12px',
                    background: active ? 'var(--ant-color-primary-bg, #e6f4ff)' : undefined,
                  }}
                >
                  <List.Item.Meta
                    title={<Text strong={active}>{set.name}</Text>}
                    description={
                      <Space size={4} wrap>
                        <Tag>{set.documentIds.length} tài liệu</Tag>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {new Date(set.updatedAt).toLocaleDateString()}
                        </Text>
                      </Space>
                    }
                  />
                </List.Item>
              );
            }}
          />
        </div>
      </div>
      <div data-testid="doc-set-library-detail" style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', padding: 16 }}>
        {creating ? (
          <DocumentSetForm
            notes={formNotes as Note[]}
            availableSets={sets}
            onSave={(value) => void handleCreate(value)}
          />
        ) : selectedId ? (
          <DocumentSetDetail setId={selectedId} db={db} />
        ) : (
          <Empty description="Chọn một bộ tài liệu ở cột trái để xem chi tiết." />
        )}
      </div>
    </div>
  );
}
