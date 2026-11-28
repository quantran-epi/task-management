import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, List, Space, Tag, Typography, useMessage, SearchInput, EmptyImageSimple, ListItem, ListItemMeta } from '../components/ui';
import { PlusOutlined } from '../components/ui/icon';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { createDocumentSet } from '../db/repositories/documentSetRepo';
import { DocumentSetForm, type DocumentSetFormValue } from '../components/knowledge/DocumentSetForm';
import { useLayoutStore } from './store/layoutStore';
import { DocumentSetDetail } from './DocumentSetDetail';
import type { Note } from '../types/models';
import { foldForSearch, searchIncludes } from '../utils/searchText';

const { Text } = Typography;

export interface DocSetLibraryProps {
  db?: TaskPlannerDatabase | undefined;
  selectedSetId?: unknown;
  /** Rendered outside the tab host (e.g. a modal in the classic shell) — never touch layout tabs. */
  embedded?: boolean | undefined;
}

/** One tab for all document sets: left list, right detail. No browsing modal. */
export function DocSetLibrary({ db = defaultDb, selectedSetId, embedded = false }: DocSetLibraryProps) {
  const message = useMessage();
  const openTab = useLayoutStore((s) => s.openTab);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Center island có thể hẹp khi Docs Explorer + Tool Explorer mở: rail co theo container.
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry?.contentRect.width ?? root.clientWidth));
    observer.observe(root);
    setContainerWidth(root.clientWidth);
    return () => observer.disconnect();
  }, []);
  const narrow = containerWidth > 0 && containerWidth < 640;

  const sets = useLiveQuery(async () => {
    const rows = await db.documentSets.toArray();
    return rows.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [db], []);
  const notes = useLiveQuery(async () => db.notes.toArray(), [db], []);

  const requestedId = typeof selectedSetId === 'string' ? selectedSetId : undefined;
  const [localSelectedId, setLocalSelectedId] = useState<string | undefined>(requestedId);
  const selectedId = requestedId ?? localSelectedId ?? sets[0]?.id;

  useEffect(() => {
    if (embedded) return;
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
    const query = foldForSearch(search);
    if (!query) return sets;
    return sets.filter((set) => searchIncludes(set.name, query));
  }, [search, sets]);

  const selectSet = (setId: string, name: string) => {
    setLocalSelectedId(setId);
    setCreating(false);
    if (embedded) return;
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
      ref={rootRef}
      data-testid="doc-set-library"
      style={{ display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden' }}
    >
      <div
        data-testid="doc-set-library-list"
        style={{
          width: narrow ? 160 : 248,
          flexShrink: 0,
          borderRight: '1px solid var(--border, var(--ant-color-border))',
          background: 'var(--bg-elev)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <Space className="doc-set-library-head" direction="vertical" size="small" style={{ padding: 12 }}>
          <Button icon={<PlusOutlined />} onClick={() => setCreating(true)} block>
            Tạo bộ tài liệu
          </Button>
          <SearchInput
            placeholder="Tìm bộ tài liệu"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Space>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <List
            size="small"
            dataSource={filteredSets}
            locale={{
              emptyText: (
                <Empty
                  image={EmptyImageSimple}
                  description={search.trim() ? 'Không tìm thấy bộ tài liệu phù hợp' : 'Chưa có bộ tài liệu'}
                />
              ),
            }}
            renderItem={(set) => {
              const active = set.id === selectedId && !creating;
              return (
                <ListItem
                  key={set.id}
                  role="button"
                  aria-label={`Mở bộ tài liệu ${set.name}`}
                  className="doc-set-library-item"
                  onClick={() => selectSet(set.id, set.name)}
                  style={{
                    cursor: 'pointer',
                    padding: '8px 12px',
                    background: active ? 'var(--ant-color-primary-bg, #e6f4ff)' : undefined,
                  }}
                >
                  <ListItemMeta
                    title={<Text strong={active} ellipsis style={{ minWidth: 0 }}>{set.name}</Text>}
                    description={
                      <Space size={4} wrap>
                        <Tag>{set.documentIds.length} tài liệu</Tag>
                        <Text type="secondary" style={{ fontSize: 'var(--font-size-xs)' }}>
                          {new Date(set.updatedAt).toLocaleDateString()}
                        </Text>
                      </Space>
                    }
                  />
                </ListItem>
              );
            }}
          />
        </div>
      </div>
      <div data-testid="doc-set-library-detail" style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', padding: narrow ? 8 : 16, display: 'flex', flexDirection: 'column' }}>
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
