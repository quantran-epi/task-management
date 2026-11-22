import React, { useMemo, useState } from 'react';
import type { DiffFile } from '../../types/agent';
import type { WorktreeDescriptor } from '../../types/codingZone';
import { foldForSearch, searchIncludes } from '../../utils/searchText';

/** Phase 48 D-03: compact SSH worktree tree. All paths/hunks render as escaped text. */
export interface CodingZoneTreeProps {
  descriptor: WorktreeDescriptor | undefined;
  files: readonly string[];
  diffFiles: readonly DiffFile[];
  scope: 'diff' | 'all';
  onScopeChange: (scope: 'diff' | 'all') => void;
  query: string;
  onQueryChange: (query: string) => void;
  activeFile: string | null;
  onOpenFile: (filePath: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
  status?: DiffFile['status'] | undefined;
  additions: number;
  deletions: number;
}

function buildTree(paths: readonly string[], diffByPath: Map<string, DiffFile>): TreeNode[] {
  const root: TreeNode[] = [];
  for (const filePath of paths) {
    const diff = diffByPath.get(filePath);
    const segments = filePath.split('/').filter(Boolean);
    let level = root;
    let prefix = '';
    segments.forEach((segment, index) => {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      const isLeaf = index === segments.length - 1;
      let node = level.find((candidate) => candidate.name === segment);
      let current = node;
      if (!current) {
        current = { name: segment, path: prefix, children: [], isFile: isLeaf, additions: 0, deletions: 0 };
        level.push(current);
      }
      if (isLeaf) {
        current.isFile = true;
        if (diff) {
          current.status = diff.status;
          current.additions = diff.additions;
          current.deletions = diff.deletions;
        }
      } else {
        level = current.children;
      }
    });
  }
  const sort = (nodes: TreeNode[]): void => {
    nodes.sort((a, b) => {
      const aFolder = a.children.length > 0;
      const bFolder = b.children.length > 0;
      if (aFolder !== bFolder) return aFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => sort(node.children));
  };
  sort(root);
  return root;
}

function subtreeHasChanges(node: TreeNode): boolean {
  return Boolean(node.status) || node.children.some(subtreeHasChanges);
}

const STATUS_LABEL: Record<DiffFile['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
};

export const CodingZoneTree: React.FC<CodingZoneTreeProps> = ({
  descriptor,
  files,
  diffFiles,
  scope,
  onScopeChange,
  query,
  onQueryChange,
  activeFile,
  onOpenFile,
}) => {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const diffByPath = useMemo(() => new Map(diffFiles.map((file) => [file.newPath, file])), [diffFiles]);
  const changedPaths = useMemo(() => new Set(diffFiles.map((file) => file.newPath)), [diffFiles]);
  const normalizedQuery = foldForSearch(query);
  const visibleFiles = useMemo(
    () => files.filter((filePath) =>
      (scope === 'all' || changedPaths.has(filePath)) &&
      (!normalizedQuery || searchIncludes(filePath, normalizedQuery))
    ),
    [files, scope, changedPaths, normalizedQuery]
  );
  const tree = useMemo(() => buildTree(visibleFiles, diffByPath), [visibleFiles, diffByPath]);

  // Search auto-expands ancestors so a match is never hidden behind a collapsed folder.
  const effectiveCollapsed = normalizedQuery ? new Set<string>() : collapsed;
  const toggle = (path: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const isFolder = !node.isFile;
      const isOpen = !effectiveCollapsed.has(node.path);
      if (scope === 'diff' && isFolder && !subtreeHasChanges(node)) return null;
      return (
        <React.Fragment key={node.path}>
          <div
            className="cz-tree-row"
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={isFolder ? isOpen : undefined}
            aria-selected={!isFolder && activeFile === node.path}
            data-testid="coding-zone-tree-row"
            data-path={node.path}
            title={node.path}
            style={{ paddingLeft: 6 + depth * 12 }}
            onClick={() => {
              if (isFolder) toggle(node.path);
              else onOpenFile(node.path);
            }}
          >
            <span className="cz-tree-caret">{isFolder ? (isOpen ? '▾' : '▸') : ''}</span>
            <span className={`cz-tree-icon ${isFolder ? 'folder' : 'file'}`}>{isFolder ? '▣' : '◇'}</span>
            <span className="cz-tree-name">{node.name}</span>
            {node.status ? (
              <span className={`cz-status st-${STATUS_LABEL[node.status]}`} data-testid={`cz-status-${STATUS_LABEL[node.status]}`}>
                {STATUS_LABEL[node.status]}
              </span>
            ) : null}
            {node.status ? (
              <span className="cz-tree-delta">
                <span className="delta-add">+{node.additions}</span> <span className="delta-del">−{node.deletions}</span>
              </span>
            ) : null}
          </div>
          {isFolder && isOpen ? renderNodes(node.children, depth + 1) : null}
        </React.Fragment>
      );
    });

  return (
    <div className="cz-explorer">
      <div className="cz-target-card">
        <div className="cz-target-line">
          <span>SSH</span>
          <span className="mono">{descriptor ? `${descriptor.sshConfigId} · ${descriptor.remoteWorktreePath}` : '—'}</span>
        </div>
        <div className="cz-branch-line">
          <span className="tag branch">{descriptor?.branch ?? '—'}</span>
          <span title="Read-Only chỉ áp dụng cho sửa file trực tiếp; review hunk vẫn hoạt động trong worktree">read-only</span>
        </div>
      </div>
      <div className="cz-explorer-controls">
        <div className="cz-search-wrap">
          <span>⌕</span>
          <input
            type="text"
            value={query}
            placeholder="Tìm file trong worktree..."
            aria-label="Tìm file trong worktree"
            data-testid="coding-zone-tree-search"
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
        <div className="cz-scope-row">
          <div className="cz-segmented" role="group" aria-label="Phạm vi cây worktree">
            <button type="button" className={scope === 'diff' ? 'on' : ''} aria-pressed={scope === 'diff'} onClick={() => onScopeChange('diff')}>Diff</button>
            <button type="button" className={scope === 'all' ? 'on' : ''} aria-pressed={scope === 'all'} onClick={() => onScopeChange('all')}>Tất cả</button>
          </div>
          <span className="cz-scope-hint">{scope === 'diff' ? 'chỉ file có thay đổi' : 'mọi file trong cây'}</span>
        </div>
      </div>
      <div className="cz-tree" role="tree" aria-label="Cây worktree SSH" data-testid="coding-zone-tree">
        {visibleFiles.length === 0 ? (
          <div className="cz-empty" data-testid="coding-zone-tree-empty">
            <strong>{descriptor ? 'Chưa có file thay đổi' : 'Worktree đang tải'}</strong>
            <p>Chưa có thay đổi trong worktree. Khi agent chỉnh sửa, các file sẽ xuất hiện ở đây.</p>
          </div>
        ) : renderNodes(tree, 0)}
      </div>
    </div>
  );
};
