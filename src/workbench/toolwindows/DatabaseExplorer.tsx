import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Empty, InputSearch, Spin, Tree, Typography } from '../../components/ui';
import type { TreeDataNode } from '../../components/ui';
import { CodeOutlined, DatabaseOutlined } from '../../components/ui/icon';
import type { TaskPlannerDatabase } from '../../db';
import {
  getOracleConnectionProfiles,
  listOracleConnectionSummaries,
  executeOracleDescribe,
  redactOracleText,
  ORACLE_OBJECT_TYPES,
  DEFAULT_ORACLE_CONFIG,
} from '../../services/ai/oracleSqlclService';
import { extractGridRows, isOracleSourceObjectType, assertOracleObjectType } from '../../services/ai/oracleSqlclService';
import { useLayoutStore } from '../store/layoutStore';

const PAGE_SIZE = 200;
const TYPE_GROUPS = Object.keys(ORACLE_OBJECT_TYPES);

type LoadedNode = TreeDataNode & { key: string; children?: TreeDataNode[] };

interface DatabaseExplorerProps {
  db?: TaskPlannerDatabase | undefined;
}

function nodeKey(parts: string[]): string {
  return parts.join('|');
}

/** Left-docked lazy tree: connection -> schema -> object type group -> object. */
export function DatabaseExplorer({ db }: DatabaseExplorerProps) {
  const openTab = useLayoutStore((s) => s.openTab);
  const [profiles, setProfiles] = useState<ReturnType<typeof listOracleConnectionSummaries>>([]);
  const [schemaFilter, setSchemaFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [objectFilter, setObjectFilter] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Single cache: refilling a branch after collapse/expand never re-issues the same query.
  const cache = useRef(new Map<string, LoadedNode[]>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getOracleConnectionProfiles(db).then((all) => {
      if (cancelled || !mounted.current) return;
      setProfiles(listOracleConnectionSummaries(all));
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilter(schemaFilter.trim().slice(0, 100)), 300);
    return () => clearTimeout(timer);
  }, [schemaFilter]);

  // An invalidated connection/filter changes every descendant key, so stale cached nodes
  // can never render under a different connection.
  useEffect(() => {
    cache.current.clear();
    setExpandedKeys([]);
    setSelectedKeys([]);
  }, [debouncedFilter]);

  const query = useCallback(
    async (actionArgs: Parameters<typeof executeOracleDescribe>[0]) => {
      const payload = JSON.parse(await executeOracleDescribe(actionArgs, db)) as {
        success: boolean;
        error?: string;
        data?: unknown[];
        hasMore?: boolean;
      };
      if (!payload.success) {
        // The service redacts; redact again at the UI boundary in case of a stale payload.
        throw new Error(redactOracleText(payload.error || 'Lỗi truy vấn metadata Oracle.', DEFAULT_ORACLE_CONFIG));
      }
      return payload;
    },
    [db]
  );

  const loadChildren = useCallback(
    async (key: string, connectionId: string): Promise<LoadedNode[]> => {
      const cached = cache.current.get(key);
      if (cached) return cached;
      const parts = key.split('|');
      let nodes: LoadedNode[] = [];
      if (parts[0] === 'schema') {
        const result = await query({
          action: 'list_schemas',
          connectionId,
          ...(debouncedFilter ? { search: debouncedFilter } : {}),
          pageSize: PAGE_SIZE,
        });
        nodes = extractGridRows(result.data).slice(0, PAGE_SIZE).map((row) => {
          const name = String(row.USERNAME ?? '');
          return {
            key: nodeKey(['schema', connectionId, name]),
            title: name,
            isLeaf: false,
          };
        });
      } else if (parts[0] === 'types') {
        const schema = parts[2] ?? '';
        // One ALL_OBJECTS query returns every type group on this schema; partition locally.
        const result = await query({
          action: 'list_objects',
          connectionId,
          schema,
          pageSize: PAGE_SIZE,
          ...(objectFilter.trim() ? { search: objectFilter.trim().slice(0, 100) } : {}),
        });
        const rows = extractGridRows(result.data);
        const allowedTypes = new Set<string>();
        for (const row of rows) {
          const type = String(row.OBJECT_TYPE ?? '');
          // Remote data is untrusted: only whitelisted types become clickable tree nodes.
          if (TYPE_GROUPS.includes(type)) {
            try {
              allowedTypes.add(assertOracleObjectType(type));
            } catch {
              // Ignore an unexpected type rather than embedding it in a later SQL script.
            }
          }
        }
        nodes = TYPE_GROUPS.filter((type) => allowedTypes.has(type))
          .map((type) => ({
            key: nodeKey(['objects', connectionId, schema, type]),
            title: type,
            isLeaf: false,
          }));
      } else if (parts[0] === 'objects') {
        const schema = parts[2] ?? '';
        const objectType = parts[3] ?? '';
        const result = await query({
          action: 'list_objects',
          connectionId,
          schema,
          objectType,
          ...(objectFilter.trim() ? { search: objectFilter.trim().slice(0, 100) } : {}),
          pageSize: PAGE_SIZE,
        });
        nodes = extractGridRows(result.data)
          .slice(0, PAGE_SIZE)
          .filter((row) => String(row.OBJECT_TYPE ?? '') === assertOracleObjectType(objectType))
          .map((row) => ({
            key: nodeKey(['object', connectionId, schema, objectType, String(row.OBJECT_NAME ?? '')]),
            title: String(row.OBJECT_NAME ?? ''),
            isLeaf: true,
          }));
      }
      cache.current.set(key, nodes);
      return nodes;
    },
    [debouncedFilter, objectFilter, query]
  );

  const onLoadData = useCallback(
    async (node: TreeDataNode) => {
      const key = String(node.key);
      if (cache.current.has(key)) return;
      const parts = key.split('|');
      // Tree keys: root|c, schema|c|s, types|c|s, objects|c|s|type.
      const isRoot = parts[0] === 'root';
      const fetchKey = isRoot
        ? nodeKey(['schema', parts[1] ?? ''])
        : parts[0] === 'schema'
          ? nodeKey(['types', parts[1] ?? '', parts[2] ?? ''])
          : key;
      const connectionId = parts[1] ?? '';
      if (!['root', 'schema', 'types', 'objects'].includes(parts[0] ?? '')) return;
      try {
        setLoading(true);
        const children = await loadChildren(fetchKey, connectionId);
        if (!mounted.current) return;
        setTree((prev) => patchChildren(prev, key, children));
      } catch (err: any) {
        if (!mounted.current) return;
        setError(redactOracleText(err?.message || 'Không tải được cây schema.', DEFAULT_ORACLE_CONFIG));
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [loadChildren]
  );

  const rootNodes = useMemo<LoadedNode[]>(
    () =>
      profiles.map((profile) => ({
        key: nodeKey(['root', profile.id]),
        title: `${profile.name} (${profile.environment})`,
        isLeaf: false,
      })),
    [profiles]
  );

  const [tree, setTree] = useState<LoadedNode[]>([]);
  useEffect(() => {
    setTree(rootNodes);
    setExpandedKeys([]);
    setSelectedKeys([]);
    cache.current.clear();
  }, [rootNodes]);

  const openObject = useCallback(
    (objectNodeKey: string) => {
      const [, connectionId, schema, objectType, objectName] = objectNodeKey.split('|');
      if (!objectName || !objectType) return;
      const mode = isOracleSourceObjectType(objectType)
        ? 'source'
        : ['TABLE', 'VIEW', 'MATERIALIZED VIEW', 'INDEX', 'SEQUENCE', 'SYNONYM', 'TYPE'].includes(objectType)
          ? 'ddl'
          : 'columns';
      setSelectedKeys([objectNodeKey]);
      openTab({
        id: nodeKey(['oracle', connectionId ?? '', schema ?? '', objectType, objectName, mode]),
        title: `${schema ?? ''}.${objectName} (${objectType})`,
        viewType: 'oracle_object_view',
        closable: true,
        params: { connectionId, schema, objectType, objectName, mode },
      });
    },
    [openTab]
  );

  return (
    <div data-testid="database-explorer" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--gap-8)', padding: 'var(--gap-8)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 'var(--gap-6)', alignItems: 'center' }}>
        <Button
          size="small"
          icon={<CodeOutlined />}
          onClick={() =>
            openTab({
              id: 'composer:active',
              title: 'SQL Composer',
              viewType: 'oracle_sql_composer',
              closable: true,
              params: { composerId: 'composer:active' },
            })
          }
        >
          SQL Composer
        </Button>
        {loading ? <Spin size="small" /> : null}
      </div>

      <InputSearch
        allowClear
        size="small"
        placeholder="Tìm schema..."
        value={schemaFilter}
        onChange={(e) => setSchemaFilter(e.target.value)}
        aria-label="Tìm schema Oracle"
      />
      <InputSearch
        allowClear
        size="small"
        placeholder="Tìm object..."
        value={objectFilter}
        onChange={(e) => {
          setObjectFilter(e.target.value);
          cache.current.clear();
        }}
        aria-label="Tìm object Oracle"
      />

      {error ? (
        <Alert
          type="error"
          showIcon
          closable
          message={error}
          onClose={() => setError('')}
        />
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {profiles.length === 0 ? (
          <Empty description="Chưa có kết nối Oracle. Cấu hình trong Settings." />
        ) : (
          <Tree
            blockNode
            motion={false}
            treeData={tree}
            loadData={onLoadData}
            expandedKeys={expandedKeys}
            selectedKeys={selectedKeys}
            onExpand={(keys) => setExpandedKeys(keys.map(String))}
            onSelect={(_, info) => {
              const key = String((info.node as TreeDataNode).key);
              if (key.startsWith('object|')) openObject(key);
            }}
          />
        )}
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 'var(--font-size-small)' }}>
        <DatabaseOutlined /> Chỉ đọc · tối đa {PAGE_SIZE} kết quả mỗi trang
      </Typography.Text>
    </div>
  );
}

/** Immutable child patch: only the expanded branch changes identity. */
function patchChildren(nodes: LoadedNode[], key: string, children: LoadedNode[]): LoadedNode[] {
  return nodes.map((node) => {
    if (node.key === key) return { ...node, children };
    if (node.children?.length) {
      return { ...node, children: patchChildren(node.children as LoadedNode[], key, children) };
    }
    return node;
  });
}
