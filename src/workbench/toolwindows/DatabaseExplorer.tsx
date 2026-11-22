import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Empty, InputSearch, Spin, Tree, Typography } from '../../components/ui';
import type { TreeDataNode } from '../../components/ui';
import { CodeOutlined, DatabaseOutlined } from '../../components/ui/icon';
import type { TaskPlannerDatabase } from '../../db';
import {
  getOracleConnectionProfiles,
  listOracleConnectionSummaries,
  executeOracleDescribe,
  ORACLE_OBJECT_TYPES,
} from '../../services/ai/oracleSqlclService';
import { extractGridRows, isOracleSourceObjectType, assertOracleObjectType } from '../../services/ai/oracleSqlclService';
import { useLayoutStore } from '../store/layoutStore';
import { foldForSearch, searchIncludes } from '../../utils/searchText';

const PAGE_SIZE = 200;
const TYPE_GROUPS = Object.keys(ORACLE_OBJECT_TYPES);

type LoadedNode = TreeDataNode & { key: string; children?: TreeDataNode[] };

interface DatabaseExplorerProps {
  db?: TaskPlannerDatabase | undefined;
}

// Encode each part: Oracle object names may contain `|`, which would otherwise shift the
// positional parsing used by lazy load and tab opening.
function nodeKey(parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join('|');
}

function decodeParts(key: string): string[] {
  return key.split('|').map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
}

/** Left-docked lazy tree: connection -> schema -> object type group -> object. */
export function DatabaseExplorer({ db }: DatabaseExplorerProps) {
  const openTab = useLayoutStore((s) => s.openTab);
  const [profiles, setProfiles] = useState<ReturnType<typeof listOracleConnectionSummaries>>([]);
  const [schemaFilter, setSchemaFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [objectFilter, setObjectFilter] = useState('');
  const [debouncedObjectFilter, setDebouncedObjectFilter] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Single cache: refilling a branch after collapse/expand never re-issues the same query.
  const cache = useRef(new Map<string, LoadedNode[]>());
  const mounted = useRef(true);
  const generation = useRef(0);

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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedObjectFilter(objectFilter.trim().slice(0, 100)), 300);
    return () => clearTimeout(timer);
  }, [objectFilter]);

  // A filter change invalidates the whole tree. The generation counter drops any in-flight
  // response from the previous filter so it cannot repaint already-expanded branches.
  useEffect(() => {
    generation.current += 1;
    cache.current.clear();
    setExpandedKeys([]);
    setSelectedKeys([]);
  }, [debouncedFilter, debouncedObjectFilter]);

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
        throw new Error(String(payload.error || 'Lỗi truy vấn metadata Oracle.'));
      }
      return payload;
    },
    [db]
  );

  const loadChildren = useCallback(
    async (key: string, connectionId: string): Promise<LoadedNode[]> => {
      const cached = cache.current.get(key);
      if (cached) return cached;
      const parts = decodeParts(key);
      let nodes: LoadedNode[] = [];
      if (parts[0] === 'search') {
        // Cross-schema search: list_objects without an OWNER filter scans ALL_OBJECTS.
        // Results are capped server-side by PAGE_SIZE and only whitelisted types become nodes.
        const result = await query({
          action: 'list_objects',
          connectionId,
          pageSize: PAGE_SIZE,
          search: debouncedObjectFilter,
          searchAlt: foldForSearch(debouncedObjectFilter),
        });
        nodes = extractGridRows(result.data)
          .slice(0, PAGE_SIZE)
          .filter((row) => TYPE_GROUPS.includes(String(row.OBJECT_TYPE ?? '')))
          .filter((row) =>
            searchIncludes(
              `${String(row.OWNER ?? '')}.${String(row.OBJECT_NAME ?? '')}`,
              debouncedObjectFilter
            )
          )
          .map((row) => ({
            key: nodeKey([
              'object', connectionId, String(row.OWNER ?? ''),
              String(row.OBJECT_TYPE ?? ''), String(row.OBJECT_NAME ?? ''),
            ]),
            title: `${row.OWNER}.${row.OBJECT_NAME} (${row.OBJECT_TYPE})`,
            isLeaf: true,
          }));
      } else if (parts[0] === 'schema') {
        const result = await query({
          action: 'list_schemas',
          connectionId,
          ...(debouncedFilter
            ? { search: debouncedFilter, searchAlt: foldForSearch(debouncedFilter) }
            : {}),
          pageSize: PAGE_SIZE,
        });
        nodes = extractGridRows(result.data)
          .filter((row) => !debouncedFilter || searchIncludes(String(row.USERNAME ?? ''), debouncedFilter))
          .slice(0, PAGE_SIZE).map((row) => {
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
          ...(debouncedObjectFilter
            ? { search: debouncedObjectFilter, searchAlt: foldForSearch(debouncedObjectFilter) }
            : {}),
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
          ...(debouncedObjectFilter
            ? { search: debouncedObjectFilter, searchAlt: foldForSearch(debouncedObjectFilter) }
            : {}),
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
    [debouncedFilter, debouncedObjectFilter, query]
  );

  const onLoadData = useCallback(
    async (node: TreeDataNode) => {
      const key = String(node.key);
      if (cache.current.has(key)) return;
      const parts = decodeParts(key);
      // Tree keys: root|c, schema|c|s, types|c|s, objects|c|s|type.
      const isRoot = parts[0] === 'root';
      const fetchKey = isRoot
        ? nodeKey([debouncedObjectFilter ? 'search' : 'schema', parts[1] ?? ''])
        : parts[0] === 'schema'
          ? nodeKey(['types', parts[1] ?? '', parts[2] ?? ''])
          : key;
      const connectionId = parts[1] ?? '';
      if (!['root', 'schema', 'types', 'objects', 'search'].includes(parts[0] ?? '')) return;
      const requestGeneration = generation.current;
      try {
        setLoading(true);
        const children = await loadChildren(fetchKey, connectionId);
        if (!mounted.current || requestGeneration !== generation.current) return;
        setTree((prev) => patchChildren(prev, key, children));
      } catch (err: any) {
        if (!mounted.current || requestGeneration !== generation.current) return;
        setError(String(err?.message || 'Không tải được cây schema.'));
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [loadChildren, debouncedObjectFilter]
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

  // Global object search should show results immediately without a manual expand click.
  useEffect(() => {
    if (debouncedObjectFilter && rootNodes.length) {
      // Global search is expensive (ALL_OBJECTS scan). Expand only the active connection by
      // default; the user can open another connection explicitly if needed.
      const active = profiles.find((p) => p.isActive) ?? profiles[0];
      const activeNode = rootNodes.find((node) =>
        decodeParts(node.key)[1] === active?.id
      );
      setExpandedKeys(activeNode ? [activeNode.key] : [rootNodes[0]!.key]);
    }
  }, [debouncedObjectFilter, rootNodes, profiles]);

  const openObject = useCallback(
    (objectNodeKey: string) => {
      const [, connectionId, schema, objectType, objectName] = decodeParts(objectNodeKey);
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
        placeholder="Tìm object mọi schema..."
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
