import { useState, useEffect, useCallback, useRef } from 'react';
import { Select, Input, Tree, Button, Tooltip, Tag, Spin, Alert, Empty, Segmented } from 'antd';
import type { DataNode } from 'antd/es/tree';
import FolderOutlined from '@ant-design/icons/FolderOutlined';
import FolderOpenOutlined from '@ant-design/icons/FolderOpenOutlined';
import FileTextOutlined from '@ant-design/icons/FileTextOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import BranchesOutlined from '@ant-design/icons/BranchesOutlined';
import CloudServerOutlined from '@ant-design/icons/CloudServerOutlined';
import FolderViewOutlined from '@ant-design/icons/FolderViewOutlined';
import { RemoteDirectoryBrowserModal } from '../../components/common/RemoteDirectoryBrowserModal';
import { getSshConfigs, getSshSecret } from '../../services/sshService';
import { getRemoteBranches, checkDirtyStatus, grepRemoteRef } from '../../services/gitRemoteService';
import { getRemoteTree, mergeUncommittedFilesIntoTree } from '../../services/gitRemoteTreeService';
import type { SshConfig } from '../../types/ssh';
import type { RemoteGitBranch, RemoteGitTreeNode, RemoteGrepHit } from '../../types/gitRemote';
import { useLayoutStore } from '../store/layoutStore';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';

export interface RemoteGitExplorerProps {
  db?: TaskPlannerDatabase;
}

interface CustomTreeNodeData extends DataNode {
  isLeaf?: boolean;
  size?: number;
  sha?: string;
  gitStatus?: string;
  rawNode?: RemoteGitTreeNode;
}

function renderGitStatusBadge(status?: string) {
  if (!status) return null;
  const s = status.trim();
  if (s === '?') {
    return (
      <Tag
        bordered={false}
        data-testid="status-badge-untracked"
        style={{
          fontSize: 10,
          fontWeight: 600,
          lineHeight: '14px',
          padding: '0 4px',
          margin: 0,
          color: '#16a34a',
          background: 'rgba(22, 163, 74, 0.1)',
        }}
      >
        ?
      </Tag>
    );
  }
  if (s === 'A' || s === 'AM') {
    return (
      <Tag
        bordered={false}
        data-testid="status-badge-added"
        style={{
          fontSize: 10,
          fontWeight: 600,
          lineHeight: '14px',
          padding: '0 4px',
          margin: 0,
          color: '#0891b2',
          background: 'rgba(8, 145, 178, 0.1)',
        }}
      >
        {s}
      </Tag>
    );
  }
  if (s === 'D') {
    return (
      <Tag
        bordered={false}
        data-testid="status-badge-deleted"
        style={{
          fontSize: 10,
          fontWeight: 600,
          lineHeight: '14px',
          padding: '0 4px',
          margin: 0,
          color: '#dc2626',
          background: 'rgba(220, 38, 38, 0.1)',
        }}
      >
        D
      </Tag>
    );
  }
  return (
    <Tag
      bordered={false}
      data-testid="status-badge-modified"
      style={{
        fontSize: 10,
        fontWeight: 600,
        lineHeight: '14px',
        padding: '0 4px',
        margin: 0,
        color: '#2563eb',
        background: 'rgba(37, 99, 235, 0.1)',
      }}
    >
      {s || 'M'}
    </Tag>
  );
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${formatted} ${sizes[i]}`;
}

export function RemoteGitExplorer({ db = defaultDb }: RemoteGitExplorerProps) {
  const openTab = useLayoutStore((s) => s.openTab);
  const activeRemoteConfigId = useLayoutStore((s) => s.activeRemoteConfigId);
  const activeRemoteRepoPath = useLayoutStore((s) => s.activeRemoteRepoPath);
  const activeRemoteBranch = useLayoutStore((s) => s.activeRemoteBranch);
  const setActiveRemoteTarget = useLayoutStore((s) => s.setActiveRemoteTarget);
  const setActiveRemoteBranch = useLayoutStore((s) => s.setActiveRemoteBranch);

  const [sshConfigs, setSshConfigs] = useState<SshConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(activeRemoteConfigId);
  const [repoPath, setRepoPath] = useState<string>(activeRemoteRepoPath || '');
  const [browserModalOpen, setBrowserModalOpen] = useState<boolean>(false);
  const [branches, setBranches] = useState<RemoteGitBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>(activeRemoteBranch || '');
  const [loadingBranches, setLoadingBranches] = useState<boolean>(false);
  const [treeData, setTreeData] = useState<CustomTreeNodeData[]>([]);
  const [loadingTree, setLoadingTree] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Phase 47 search state — scoped to the active target above; never a new target picker (D-02).
  const [searchMode, setSearchMode] = useState<'content' | 'name'>('content');
  const [searchInput, setSearchInput] = useState<string>('');
  const [grepHits, setGrepHits] = useState<RemoteGrepHit[]>([]);
  const [grepTruncated, setGrepTruncated] = useState<boolean>(false);
  const [searching, setSearching] = useState<boolean>(false);
  const searchSeq = useRef<number>(0);

  // Load SSH configs on mount
  useEffect(() => {
    let mounted = true;
    getSshConfigs(db)
      .then((configs) => {
        if (!mounted) return;
        setSshConfigs(configs);
        // A target already in the store wins (restored layout or a 1-click Git action).
        if (activeRemoteConfigId || activeRemoteRepoPath) return;
        const initialConfig = configs[0];
        if (initialConfig) {
          const initialPath = initialConfig.defaultRemotePath || '';
          setSelectedConfigId(initialConfig.id);
          if (initialPath) setRepoPath(initialPath);
          setActiveRemoteTarget(initialConfig.id, initialPath);
        }
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'Failed to load SSH configs');
      });
    return () => {
      mounted = false;
    };
  }, [db]);

  // Store → local sync (RESEARCH H5): unconditional, so a second 1-click on a different
  // subsystem actually switches the explorer instead of being swallowed. Keyed on the last
  // applied store value so local typing is never clobbered mid-edit.
  const lastAppliedTargetRef = useRef<string>('');
  useEffect(() => {
    const key = `${activeRemoteConfigId ?? ''}|${activeRemoteRepoPath}`;
    if (lastAppliedTargetRef.current === key) return;
    lastAppliedTargetRef.current = key;
    if (activeRemoteConfigId) setSelectedConfigId(activeRemoteConfigId);
    if (activeRemoteRepoPath) setRepoPath(activeRemoteRepoPath);
  }, [activeRemoteConfigId, activeRemoteRepoPath]);

  const selectedConfig = sshConfigs.find((c) => c.id === selectedConfigId);

  const [uncommittedFiles, setUncommittedFiles] = useState<
    Array<{ path: string; indexStatus: string; workingTreeStatus: string }>
  >([]);

  const mapTreeNodeToDataNode = useCallback((node: RemoteGitTreeNode): CustomTreeNodeData => {
    const isCode = /\.(ts|tsx|js|jsx|json|rs|go|py|css|html|md)$/i.test(node.title);
    return {
      key: node.key,
      title: (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            userSelect: 'none',
          }}
        >
          <span>{node.title}</span>
          {renderGitStatusBadge(node.gitStatus)}
          {node.isLeaf && node.size !== undefined && (
            <Tag
              bordered={false}
              style={{
                fontSize: 10,
                lineHeight: '14px',
                padding: '0 4px',
                color: 'var(--fg-muted, #6c707e)',
                background: 'rgba(0,0,0,0.04)',
              }}
            >
              {formatBytes(node.size)}
            </Tag>
          )}
        </span>
      ),
      icon: ({ expanded }: { expanded?: boolean }) =>
        node.isLeaf ? (
          <FileTextOutlined
            style={{ color: isCode ? 'var(--accent, #3871e1)' : 'var(--fg-muted, #6c707e)' }}
          />
        ) : expanded ? (
          <FolderOpenOutlined style={{ color: '#f59e0b' }} />
        ) : (
          <FolderOutlined style={{ color: '#f59e0b' }} />
        ),
      isLeaf: node.isLeaf,
      ...(node.size !== undefined ? { size: node.size } : {}),
      sha: node.sha,
      ...(node.gitStatus !== undefined ? { gitStatus: node.gitStatus } : {}),
      rawNode: node,
    };
  }, []);

  // Load root tree
  const loadRootTree = useCallback(
    async (branchOverride?: string, pathOverride?: string) => {
      const activeBranch = branchOverride ?? selectedBranch;
      const targetPath = (pathOverride ?? repoPath).trim();
      if (!selectedConfig || !targetPath || !activeBranch) return;
      setLoadingTree(true);
      setError(null);
      try {
        const secret = await getSshSecret(selectedConfig.id);
        let dirtyFiles: Array<{ path: string; indexStatus: string; workingTreeStatus: string }> = [];
        try {
          const dirtyStatus = await checkDirtyStatus(selectedConfig, targetPath, secret ?? undefined);
          dirtyFiles = dirtyStatus?.uncommittedFiles || [];
          setUncommittedFiles(dirtyFiles);
        } catch {
          // Gracefully continue if not git repo or command error
        }

        const rawNodes = await getRemoteTree(
          selectedConfig,
          targetPath,
          activeBranch,
          '',
          secret ?? undefined
        );

        const mergedNodes = mergeUncommittedFilesIntoTree(rawNodes, dirtyFiles);
        const mapped: CustomTreeNodeData[] = mergedNodes.map(mapTreeNodeToDataNode);
        setTreeData(mapped);
      } catch (err: any) {
        setError(err?.message || 'Failed to load repository tree');
        setTreeData([]);
      } finally {
        setLoadingTree(false);
      }
    },
    [selectedConfig, repoPath, selectedBranch, mapTreeNodeToDataNode]
  );

  // Load branches whenever config or repoPath changes
  const loadBranches = useCallback(
    async (pathOverride?: string) => {
      const targetPath = (pathOverride ?? repoPath).trim();
      if (!selectedConfig || !targetPath) return;
      setLoadingBranches(true);
      setError(null);
      try {
        const secret = await getSshSecret(selectedConfig.id);
        const remoteBranches = await getRemoteBranches(selectedConfig, targetPath, secret ?? undefined);
        setBranches(remoteBranches);

        if (remoteBranches.length > 0) {
          const targetMain = remoteBranches.find((b) => b.name === 'main')?.name
            ?? remoteBranches.find((b) => b.name === 'origin/main')?.name;
          const targetMaster = remoteBranches.find((b) => b.name === 'master')?.name
            ?? remoteBranches.find((b) => b.name === 'origin/master')?.name;
          const firstBranch = remoteBranches[0]?.name;
          const defaultBranch = targetMain ?? targetMaster ?? firstBranch ?? '';

          setSelectedBranch((current) => {
            const preferred = current || activeRemoteBranch;
            const stillValid = preferred && remoteBranches.some((b) => b.name === preferred);
            const nextBranch = stillValid ? preferred : defaultBranch;
            if (nextBranch) {
              setActiveRemoteBranch(nextBranch);
              void loadRootTree(nextBranch, targetPath);
            }
            return nextBranch;
          });
        } else {
          setSelectedBranch('');
          setTreeData([]);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load remote branches');
        setBranches([]);
        setTreeData([]);
      } finally {
        setLoadingBranches(false);
      }
    },
    [selectedConfig, repoPath, loadRootTree, activeRemoteBranch, setActiveRemoteBranch]
  );

  // Trigger branch load when repoPath input changes / blurred
  const handleRepoPathSubmit = () => {
    setActiveRemoteTarget(selectedConfigId, repoPath);
    void loadBranches();
  };

  const handleConfigChange = (newConfigId: string) => {
    setSelectedConfigId(newConfigId);
    setActiveRemoteTarget(newConfigId, repoPath);
  };

  const handleBranchChange = (newBranch: string) => {
    if (!newBranch || newBranch === selectedBranch) return;
    setSelectedBranch(newBranch);
    setActiveRemoteBranch(newBranch);
    setLoadingTree(true);
    void loadRootTree(newBranch);
  };

  // Re-load branches and tree whenever selectedConfig or repoPath changes
  useEffect(() => {
    if (selectedConfig && repoPath.trim()) {
      void loadBranches(repoPath.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConfig, repoPath]);

  // Lazy child loader for directory nodes
  const onLoadData = async (node: any) => {
    if (!selectedConfig || !repoPath.trim() || !selectedBranch) return;
    try {
      const secret = await getSshSecret(selectedConfig.id);
      const rawChildren = await getRemoteTree(
        selectedConfig,
        repoPath.trim(),
        selectedBranch,
        node.key as string,
        secret ?? undefined
      );

      const mergedChildren = mergeUncommittedFilesIntoTree(
        rawChildren,
        uncommittedFiles,
        node.key as string
      );
      const childrenNodes: CustomTreeNodeData[] = mergedChildren.map(mapTreeNodeToDataNode);
      const updateTreeNodes = (list: CustomTreeNodeData[]): CustomTreeNodeData[] => {
        return list.map((item) => {
          if (item.key === node.key) {
            return {
              ...item,
              children: childrenNodes,
            };
          }
          if (item.children) {
            return {
              ...item,
              children: updateTreeNodes(item.children as CustomTreeNodeData[]),
            };
          }
          return item;
        });
      };

      setTreeData((prev) => updateTreeNodes(prev));
    } catch (err: any) {
      setError(err?.message || `Failed to expand folder ${node.key}`);
    }
  };

  /**
   * Single tab-open path for tree clicks and both search modes. `initialLine` is a one-shot
   * hint: it is included only for a search hit, never for a plain tree reopen (Pitfall 3).
   */
  const openRemoteFile = (
    filePath: string,
    title: string,
    extra?: {
      size?: number | undefined;
      gitStatus?: string | undefined;
      initialLine?: number | undefined;
    }
  ) => {
    if (!selectedConfig) return;
    openTab({
      id: `remote:${filePath}`,
      title,
      viewType: 'remote_file',
      closable: true,
      params: {
        config: selectedConfig,
        repoPath: repoPath.trim(),
        branch: selectedBranch,
        filePath,
        ...(extra?.size !== undefined ? { size: extra.size } : {}),
        ...(extra?.gitStatus !== undefined ? { gitStatus: extra.gitStatus } : {}),
        ...(extra?.initialLine !== undefined ? { initialLine: extra.initialLine } : {}),
      },
    });
  };

  const handleSelectNode = (_selectedKeys: any, info: any) => {
    const node = info.node as CustomTreeNodeData;
    if (!node.isLeaf || !selectedConfig) return;

    const rawTitle = node.rawNode?.title || (node.title as string) || node.key.toString();
    openRemoteFile(node.key as string, rawTitle, {
      size: node.size,
      gitStatus: node.gitStatus,
    });
  };

  // Content search: reuse the confined, escaped, bounded git grep service (D-14). The pattern
  // goes to grepRemoteRef as DATA — escaping (`-e`, `--end-of-options`, escapeShellArg) stays
  // in the service and is never reimplemented here. 200 hits are capped again in the service.
  const CONTENT_HIT_LIMIT = 200;
  const runContentSearch = useCallback(
    async (pattern: string) => {
      const trimmed = pattern.trim();
      if (!selectedConfig || !repoPath.trim() || !selectedBranch || !trimmed) {
        setGrepHits([]);
        setGrepTruncated(false);
        return;
      }
      const seq = ++searchSeq.current;
      setSearching(true);
      setError(null);
      try {
        const secret = await getSshSecret(selectedConfig.id);
        const result = await grepRemoteRef(
          selectedConfig,
          repoPath.trim(),
          selectedBranch,
          { pattern: trimmed, literal: true, limit: CONTENT_HIT_LIMIT },
          secret ?? undefined
        );
        if (seq !== searchSeq.current) return; // discard stale async result
        setGrepHits(result.hits.slice(0, CONTENT_HIT_LIMIT));
        setGrepTruncated(result.truncated);
      } catch (err: any) {
        if (seq !== searchSeq.current) return;
        setGrepHits([]);
        setGrepTruncated(false);
        setError(err?.message || 'Content search failed');
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    },
    [selectedConfig, repoPath, selectedBranch]
  );

  // Renderer-side debounce so typing does not fire a remote grep per keystroke. It only starts
  // once the user has engaged the search field, so opening the explorer never greps on mount.
  const hasSearchedRef = useRef<boolean>(false);
  useEffect(() => {
    if (searchMode !== 'content' || !hasSearchedRef.current) return;
    const timer = setTimeout(() => {
      void runContentSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchMode, searchInput, runContentSearch]);

  return (
    <div
      data-testid="remote-git-explorer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--bg-island, #ffffff)',
      }}
    >
      {/* Controls Container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '8px 10px',
          borderBottom: '1px solid var(--border, #e9eaee)',
          background: 'var(--bg-elev, #f7f8fa)',
        }}
      >
        {/* SSH Host Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CloudServerOutlined style={{ color: '#f59e0b', fontSize: 13 }} />
          <Select
            size="small"
            style={{ flex: 1 }}
            placeholder="Select SSH Host"
            value={selectedConfigId}
            onChange={(val) => handleConfigChange(val)}
            options={sshConfigs.map((c) => ({
              label: `${c.name} (${c.host})`,
              value: c.id,
            }))}
            data-testid="ssh-config-select"
          />
        </div>

        {/* Remote Repository Path */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FolderViewOutlined style={{ color: 'var(--fg-muted, #6c707e)', fontSize: 13 }} />
          <Input
            size="small"
            style={{ flex: 1, fontSize: 12 }}
            placeholder="/path/to/remote/repo"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            onPressEnter={handleRepoPathSubmit}
            onBlur={handleRepoPathSubmit}
            data-testid="repo-path-input"
          />
          <Tooltip title="Browse remote folder">
            <Button
              size="small"
              icon={<FolderOpenOutlined />}
              onClick={() => setBrowserModalOpen(true)}
              disabled={!selectedConfig}
              data-testid="browse-remote-repo-btn"
            />
          </Tooltip>
        </div>

        {/* Branch Selector & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BranchesOutlined style={{ color: 'var(--accent, #3871e1)', fontSize: 13 }} />
          <Select
            size="small"
            style={{ flex: 1 }}
            placeholder="Branch"
            value={selectedBranch || undefined}
            onChange={(val) => handleBranchChange(val ?? '')}
            loading={loadingBranches || loadingTree}
            disabled={branches.length === 0}
            options={branches.map((b) => ({
              label: b.name,
              value: b.name,
            }))}
            data-testid="branch-select"
          />
          <Tooltip title="Refresh directory tree">
            <Button
              size="small"
              icon={<ReloadOutlined spin={loadingTree} />}
              onClick={() => loadRootTree()}
              disabled={!selectedConfig || !repoPath.trim()}
              data-testid="refresh-tree-btn"
            />
          </Tooltip>
        </div>

        {/* Search (scoped to the active target — D-02/D-03) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Segmented
            size="small"
            value={searchMode}
            onChange={(val) => setSearchMode(val as 'content' | 'name')}
            options={[
              { label: 'Content', value: 'content' },
              { label: 'Name', value: 'name' },
            ]}
            data-testid="search-mode-segmented"
          />
          <Input.Search
            size="small"
            style={{ flex: 1 }}
            placeholder={searchMode === 'content' ? 'Search file contents…' : 'Search file/folder names…'}
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              hasSearchedRef.current = true;
            }}
            onSearch={(val) => {
              hasSearchedRef.current = true;
              if (searchMode === 'content') void runContentSearch(val);
            }}
            loading={searching}
            allowClear
            data-testid="remote-search-input"
          />
        </div>
      </div>

      {/* Error alert if any */}
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          onClose={() => setError(null)}
          style={{ margin: 8, fontSize: 12 }}
        />
      )}

      {/* Tree Content Area */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '6px 4px',
          position: 'relative',
        }}
      >
        {searchMode === 'content' && hasSearchedRef.current && searchInput.trim() ? (
          <div data-testid="content-search-results" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {grepHits.length === 0 && !searching ? (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--fg-muted, #6c707e)' }}>
                No content matches in this target.
              </div>
            ) : (
              grepHits.map((hit, idx) => (
                <div
                  key={`${hit.path}:${hit.line}:${idx}`}
                  role="button"
                  tabIndex={0}
                  data-testid="content-search-hit"
                  onClick={() =>
                    openRemoteFile(hit.path, hit.path.split('/').pop() || hit.path, {
                      initialLine: hit.line,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      openRemoteFile(hit.path, hit.path.split('/').pop() || hit.path, {
                        initialLine: hit.line,
                      });
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', Consolas, Monaco, monospace",
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  <span style={{ color: 'var(--accent, #3871e1)' }}>{hit.path}</span>
                  <span style={{ color: 'var(--fg-muted, #8c8f9c)' }}>:{hit.line}:</span>
                  <span>{hit.text}</span>
                </div>
              ))
            )}
            {grepTruncated && (
              <div style={{ padding: '4px 6px', fontSize: 11, color: '#d97706' }}>
                Results limited to {CONTENT_HIT_LIMIT} hits.
              </div>
            )}
          </div>
        ) : (
        <Spin spinning={loadingTree}>
          {treeData.length > 0 ? (
            <Tree
              motion={false as any}
              loadData={onLoadData}
              treeData={treeData}
              onSelect={handleSelectNode}
              showIcon
              blockNode
              style={{
                background: 'transparent',
                fontSize: 12.5,
                padding: '4px 6px',
              }}
            />
          ) : !loadingTree ? (
            <div style={{ padding: 20 }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  !selectedConfig
                    ? 'No SSH host selected'
                    : !repoPath.trim()
                    ? 'Enter remote repository path above'
                    : 'No files or branches found'
                }
              />
            </div>
          ) : null}
        </Spin>
        )}
      </div>

      {/* Remote Directory Browser Modal */}
      <RemoteDirectoryBrowserModal
        open={browserModalOpen}
        sshConfig={selectedConfig}
        initialPath={repoPath}
        onSelect={(selectedPath) => {
          setRepoPath(selectedPath);
          setActiveRemoteTarget(selectedConfigId, selectedPath);
          setBrowserModalOpen(false);
          void loadBranches(selectedPath);
        }}
        onCancel={() => setBrowserModalOpen(false)}
      />
    </div>
  );
}
