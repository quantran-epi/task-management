import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Select, Input, SearchInput, Tree, Button, Tooltip, Tag, Spin, Alert, Empty, EmptyImageSimple, IconButton } from '../../components/ui';
import type { DataNode } from 'antd/es/tree';
import FolderOutlined from '@ant-design/icons/FolderOutlined';
import FolderOpenOutlined from '@ant-design/icons/FolderOpenOutlined';
import FileTextOutlined from '@ant-design/icons/FileTextOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import BranchesOutlined from '@ant-design/icons/BranchesOutlined';
import CloudServerOutlined from '@ant-design/icons/CloudServerOutlined';
import FolderViewOutlined from '@ant-design/icons/FolderViewOutlined';
import { RemoteDirectoryBrowserModal } from '../../components/common/RemoteDirectoryBrowserModal';
import { getSshConfigs, getSshSecret } from '../../services/sshService';
import { getRemoteBranches, checkDirtyStatus } from '../../services/gitRemoteService';
import {
  getRemoteTree,
  mergeUncommittedFilesIntoTree,
  searchRemoteTree,
  type RemoteTreeSearchResult,
} from '../../services/gitRemoteTreeService';
import type { SshConfig } from '../../types/ssh';
import type { RemoteGitBranch, RemoteGitTreeNode } from '../../types/gitRemote';
import { compactRemoteTree, keyOfPathFor, type CompactedNode } from '../../utils/remoteTreeCompact';
import { useLayoutStore } from '../store/layoutStore';
import { executeAction, type ActionNotify } from '../actions/actionRegistry';
import { useMessage } from '../../components/ui';
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
  /** Full repo-relative path to fetch children for (compacted last-path, or raw key). */
  rawPath?: string;
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
          lineHeight: 'var(--status-badge-height)',
          padding: '0 var(--status-badge-pad)',
          margin: 0,
          color: 'var(--status-untracked)',
          background: 'var(--status-untracked-bg)',
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
          lineHeight: 'var(--status-badge-height)',
          padding: '0 var(--status-badge-pad)',
          margin: 0,
          color: 'var(--status-added)',
          background: 'var(--status-added-bg)',
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
          lineHeight: 'var(--status-badge-height)',
          padding: '0 var(--status-badge-pad)',
          margin: 0,
          color: 'var(--status-deleted)',
          background: 'var(--status-deleted-bg)',
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
        lineHeight: 'var(--status-badge-height)',
        padding: '0 var(--status-badge-pad)',
        margin: 0,
        color: 'var(--status-modified)',
        background: 'var(--status-modified-bg)',
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

/** Hard ceiling on chained folder fetches for one expand — keeps read-only walks bounded (T-vcb-01). */
const CHAIN_FETCH_CAP = 24;

/** Mirrors the source-root stop in compactRemoteTree so the walk stops at the same boundary. */
const SOURCE_ROOT_RE = /(?:^|\/)(?:src|test)\/(?:main|test)\/(?:java|kotlin|resources|scala|groovy)$/;

/** Replace children of the raw node matching `targetPath`, leaving all sibling branches intact. */
function injectRawChildren(
  nodes: RemoteGitTreeNode[],
  targetPath: string,
  children: RemoteGitTreeNode[]
): RemoteGitTreeNode[] {
  return nodes.map((item) => {
    if (item.key === targetPath) return { ...item, children };
    if (item.children) {
      return { ...item, children: injectRawChildren(item.children, targetPath, children) };
    }
    return item;
  });
}

function findRawTreeNode(nodes: RemoteGitTreeNode[], key: string): RemoteGitTreeNode | undefined {
  for (const node of nodes) {
    if (node.key === key) return node;
    if (node.children) {
      const found = findRawTreeNode(node.children, key);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Build AntD nodes from a compacted view. `key` is the stable first-path key; `rawPath` is the
 * last path in the chain and is the operation target for lazy child fetches and file opens.
 * Status badges stay on the row and the full path is available via Tooltip on the title.
 */
function compactedNodeToDataNode(node: CompactedNode): CustomTreeNodeData {
  const isCode = /\.(ts|tsx|js|jsx|json|rs|go|py|css|html|md)$/i.test(node.label);
  const fullTitle: React.ReactNode = (
    <Tooltip title={node.chain.length > 1 ? node.chain.join(' / ') : undefined}>
      <span
        className="remote-tree-title"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--gap-6)',
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          userSelect: 'none',
        }}
      >
        <span className="remote-tree-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {node.label}
        </span>
        {renderGitStatusBadge(node.gitStatus)}
        {node.isLeaf && node.size !== undefined && (
          <Tag
            variant="filled"
            style={{
              fontSize: 10,
              lineHeight: 'var(--status-badge-height)',
              padding: '0 var(--status-badge-pad)',
              margin: 0,
              color: 'var(--fg-muted)',
              background: 'var(--surface-sunken)',
            }}
          >
            {formatBytes(node.size)}
          </Tag>
        )}
      </span>
    </Tooltip>
  );
  return {
    key: node.key,
    title: fullTitle,
    icon: ({ expanded }: { expanded?: boolean }) =>
      node.isLeaf ? (
        <FileTextOutlined
          style={{ color: isCode ? 'var(--accent)' : 'var(--fg-muted)' }}
        />
      ) : expanded ? (
        <FolderOpenOutlined style={{ color: 'var(--folder-icon)' }} />
      ) : (
        <FolderOutlined style={{ color: 'var(--folder-icon)' }} />
      ),
    isLeaf: node.isLeaf,
    ...(node.size !== undefined ? { size: node.size } : {}),
    sha: node.path,
    ...(node.gitStatus !== undefined ? { gitStatus: node.gitStatus } : {}),
    rawPath: node.path,
    ...(node.children.length > 0 ? { children: node.children.map(compactedNodeToDataNode) } : {}),
  };
}

export function RemoteGitExplorer({ db = defaultDb }: RemoteGitExplorerProps) {
  const message = useMessage();
  const notify: ActionNotify = (kind, text) => message[kind](text);
  const openTab = useLayoutStore((s) => s.openTab);
  const activeRemoteConfigId = useLayoutStore((s) => s.activeRemoteConfigId);
  const activeRemoteRepoPath = useLayoutStore((s) => s.activeRemoteRepoPath);
  const activeRemoteBranch = useLayoutStore((s) => s.activeRemoteBranch);
  const setActiveRemoteTarget = useLayoutStore((s) => s.setActiveRemoteTarget);
  const setActiveRemoteBranch = useLayoutStore((s) => s.setActiveRemoteBranch);
  const pendingRevealTarget = useLayoutStore((s) => s.pendingRevealTarget);
  const consumePendingRevealTarget = useLayoutStore((s) => s.consumePendingRevealTarget);

  const [sshConfigs, setSshConfigs] = useState<SshConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(activeRemoteConfigId);
  const [repoPath, setRepoPath] = useState<string>(activeRemoteRepoPath || '');
  const [browserModalOpen, setBrowserModalOpen] = useState<boolean>(false);
  const [branches, setBranches] = useState<RemoteGitBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>(activeRemoteBranch || '');
  const [loadingBranches, setLoadingBranches] = useState<boolean>(false);
  const [treeData, setTreeData] = useState<RemoteGitTreeNode[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [loadingTree, setLoadingTree] = useState<boolean>(false);
  // Refresh must reset rc-tree's internal loadedKeys (cached by node key) while keeping the
  // user's expandedKeys. Remounting on this counter does both in one step (BUG-04).
  const [treeRefreshKey, setTreeRefreshKey] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  // Global (whole-ref) search state — the unified Find dialog (plan 02) owns subtree search.
  const [globalQuery, setGlobalQuery] = useState<string>('');
  const [globalResults, setGlobalResults] = useState<RemoteTreeSearchResult[]>([]);
  const [globalSearching, setGlobalSearching] = useState<boolean>(false);
  const [globalActiveIndex, setGlobalActiveIndex] = useState<number>(0);
  const globalSeq = useRef<number>(0);

  // Identity of the remote target the tree is showing. Remounting the Tree on change drops
  // AntD's internal loadedKeys; clearing the controlled keys drops stale expansion/selection.
  const treeTargetKey = `${selectedConfigId ?? ''}|${repoPath}|${selectedBranch}`;

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
    // New target: stale expansion/selection from the previous repo must not survive (BUG-01).
    setExpandedKeys([]);
    setSelectedKeys([]);
  }, [activeRemoteConfigId, activeRemoteRepoPath]);

  // Store → local branch sync, mirroring the target sync above. A cross-branch reveal sets the
  // store branch; without this the local guard in the reveal effect never clears (T-quick-05).
  const lastAppliedBranchRef = useRef<string>('');
  useEffect(() => {
    if (lastAppliedBranchRef.current === activeRemoteBranch) return;
    lastAppliedBranchRef.current = activeRemoteBranch;
    if (activeRemoteBranch) setSelectedBranch(activeRemoteBranch);
    // Branch switch invalidates loaded children and any selection in the old ref (BUG-01).
    setExpandedKeys([]);
    setSelectedKeys([]);
  }, [activeRemoteBranch]);

  const selectedConfig = sshConfigs.find((c) => c.id === selectedConfigId);

  // Reveal targets (and their ancestors) must not be merged away — a search result path stays
  // a distinct, selectable node so the reveal effect can highlight it (D-12, Pitfall 6).
  const revealPaths = useMemo(() => {
    const target = pendingRevealTarget?.filePath?.trim();
    if (!target) return [] as string[];
    const segments = target.split('/').filter(Boolean);
    const paths: string[] = [];
    let acc = '';
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      paths.push(acc);
    }
    return paths;
  }, [pendingRevealTarget]);

  // Raw tree is the source of truth; the compacted view is derived for rendering only.
  const compactedNodes = useMemo(
    () => compactRemoteTree(treeData, { revealTargets: revealPaths }),
    [treeData, revealPaths]
  );
  const compactDisplayNodes = useMemo(
    () => compactedNodes.map(compactedNodeToDataNode),
    [compactedNodes]
  );
  /** Resolve any raw chain path (including a reveal target) to the stable compact node key. */
  const keyOfPath = useMemo(() => keyOfPathFor(compactedNodes), [compactedNodes]);

  const [uncommittedFiles, setUncommittedFiles] = useState<
    Array<{ path: string; indexStatus: string; workingTreeStatus: string }>
  >([]);

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
        setTreeData(mergedNodes);
      } catch (err: any) {
        setError(err?.message || 'Failed to load repository tree');
        setTreeData([]);
      } finally {
        setLoadingTree(false);
      }
    },
    [selectedConfig, repoPath, selectedBranch]
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

          // Keep state updaters pure: React StrictMode may invoke them twice. Compute the
          // next branch from the latest store/state values and perform remote side effects once.
          const preferred = selectedBranch || activeRemoteBranch;
          const stillValid = preferred && remoteBranches.some((b) => b.name === preferred);
          const nextBranch = stillValid ? preferred : defaultBranch;
          setSelectedBranch(nextBranch);
          if (nextBranch) {
            setActiveRemoteBranch(nextBranch);
            void loadRootTree(nextBranch, targetPath);
          }
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
    [selectedConfig, repoPath, loadRootTree, selectedBranch, activeRemoteBranch, setActiveRemoteBranch]
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
  }, [selectedConfig, repoPath]);

  // Lazy child loader for directory nodes. `node.rawPath` is the compacted chain's LAST path:
  // fetch there, then walk down a single-folder chain so the deepest real children appear
  // without exposing intermediate rows. Every read goes through the confined tree service.
  const onLoadData = async (node: any) => {
    if (!selectedConfig || !repoPath.trim() || !selectedBranch) return;
    const startPath = node.rawPath as string;
    try {
      const secret = await getSshSecret(selectedConfig.id);
      const fetchLevel = async (path: string): Promise<RemoteGitTreeNode[]> => {
        const rawChildren = await getRemoteTree(
          selectedConfig,
          repoPath.trim(),
          selectedBranch,
          path,
          secret ?? undefined
        );
        return mergeUncommittedFilesIntoTree(rawChildren, uncommittedFiles, path);
      };

      let level = await fetchLevel(startPath);
      let fetches = 1;
      // `level` is the children of the last node we descended through; `chain` records the
      // folders we walked past so the result can be folded back into one nested subtree.
      const chain: RemoteGitTreeNode[] = [];
      while (fetches < CHAIN_FETCH_CAP && level.length === 1) {
        const only = level[0]!;
        if (
          only.isLeaf ||
          only.gitStatus?.trim() ||
          Boolean(only.children?.length) ||
          revealPaths.includes(only.key) ||
          SOURCE_ROOT_RE.test(only.key)
        ) {
          break;
        }
        const deeper = await fetchLevel(only.key);
        fetches += 1;
        chain.push(only);
        level = deeper;
        if (deeper.length === 0) break;
      }
      let children = level;
      for (let i = chain.length - 1; i >= 0; i -= 1) {
        children = [{ ...chain[i]!, children }];
      }
      setTreeData((prev) => injectRawChildren(prev, startPath, children));
    } catch (err: any) {
      setError(err?.message || `Failed to expand folder ${startPath}`);
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

  const handleSelectNode = (keys: any, info: any) => {
    setSelectedKeys((keys as string[]) ?? []);
    const node = info.node as CustomTreeNodeData;
    if (!node.isLeaf || !selectedConfig) return;

    const rawTitle = node.rawPath?.split('/').at(-1) || String(node.key);
    openRemoteFile(node.rawPath as string, rawTitle, {
      size: node.size,
      gitStatus: node.gitStatus,
    });
  };

  // Global whole-ref search: debounced, guarded on a full remote target, query stays DATA only.
  const globalSearchReady = Boolean(selectedConfig && repoPath.trim() && selectedBranch);
  useEffect(() => {
    if (!globalQuery.trim() || !globalSearchReady || !selectedConfig) {
      setGlobalResults([]);
      setGlobalSearching(false);
      return;
    }
    const seq = ++globalSeq.current;
    const timer = setTimeout(() => {
      setGlobalSearching(true);
      setError(null);
      void (async () => {
        try {
          const secret = await getSshSecret(selectedConfig.id);
          const results = await searchRemoteTree(
            selectedConfig,
            repoPath.trim(),
            selectedBranch,
            globalQuery,
            secret ?? undefined
          );
          if (seq === globalSeq.current) {
            setGlobalResults(results);
            setGlobalActiveIndex(0);
          }
        } catch (err: any) {
          if (seq === globalSeq.current) {
            setGlobalResults([]);
            setError(err?.message || 'Global search failed');
          }
        } finally {
          if (seq === globalSeq.current) setGlobalSearching(false);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [globalQuery, globalSearchReady, selectedConfig, repoPath, selectedBranch]);

  useEffect(() => {
    setGlobalResults([]);
    setGlobalQuery('');
  }, [selectedConfigId, repoPath, selectedBranch]);

  const activateGlobalResult = (result: RemoteTreeSearchResult) => {
    if (result.type === 'file') {
      openRemoteFile(result.path, result.name, { size: result.size });
      return;
    }
    // Folders have no file tab: reveal the folder node in the tree. Clear the global query so
    // the results panel unmounts and the Tree is visible for the reveal (T-quick-05).
    setGlobalQuery('');
    setExpandedKeys(result.path.split('/').slice(0, -1));
    useLayoutStore.getState().setPendingRevealTarget({
      configId: selectedConfig?.id ?? null,
      repoPath: repoPath.trim(),
      branch: selectedBranch,
      filePath: result.path,
    });
  };

  const handleGlobalKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setGlobalActiveIndex((i) => Math.min(i + 1, globalResults.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setGlobalActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && globalResults[globalActiveIndex]) {
      event.preventDefault();
      activateGlobalResult(globalResults[globalActiveIndex]!);
    }
  };

  const renderHighlightedName = (result: RemoteTreeSearchResult) => {
    const { name, matchStart, matchLength } = result;
    if (!matchLength) return name;
    return (
      <>
        {name.slice(0, matchStart)}
        <mark>{name.slice(matchStart, matchStart + matchLength)}</mark>
        {name.slice(matchStart + matchLength)}
      </>
    );
  };

  // Reveal an already-open remote file in the tree. The target comes from a remote tab; its path
  // is passed only to the confined getRemoteTree service, never to a shell command (T-quick-01).
  const revealInFlightRef = useRef<string | null>(null);
  useEffect(() => {
    const target = pendingRevealTarget;
    if (!target || sshConfigs.length === 0) return; // wait until configs resolve before judging staleness
    const normalizedPath = target.filePath.trim();
    const knownConfig =
      target.configId === null || sshConfigs.some((c) => c.id === target.configId);
    if (!knownConfig) {
      // Unknown target: discard it instead of selecting an arbitrary node.
      consumePendingRevealTarget();
      return;
    }
    const alignedConfig = target.configId ?? selectedConfigId;
    if (
      alignedConfig !== selectedConfigId ||
      target.repoPath.trim() !== repoPath.trim() ||
      (target.branch && target.branch !== selectedBranch)
    ) {
      // Different target: align the explorer first; the pending request survives for the
      // follow-up render once the matching root tree is loaded. Sync local branch too, so the
      // alignment guard above clears instead of awaiting a store echo that never reaches us.
      setSelectedConfigId(alignedConfig);
      if (target.branch) setSelectedBranch(target.branch);
      setActiveRemoteTarget(
        alignedConfig,
        target.repoPath.trim(),
        target.branch || selectedBranch
      );
      return;
    }
    if (!selectedConfig || !normalizedPath || !repoPath.trim() || !selectedBranch) return;
    if (treeData.length === 0) return; // wait for the root tree of this target to load

    // The effect depends on treeData, which the reveal itself updates. Guard by target identity so
    // the state update cannot re-enter the reveal and re-fetch the same ancestors (T-quick-08).
    const flightKey = `${alignedConfig}|${repoPath.trim()}|${selectedBranch}|${normalizedPath}`;
    if (revealInFlightRef.current === flightKey) return;
    revealInFlightRef.current = flightKey;

    const segments = normalizedPath.split('/').filter(Boolean);
    const ancestors: string[] = [];
    const ancestorPaths: string[] = [];
    for (let i = 0; i < segments.length - 1; i++) {
      const parent = ancestorPaths[i - 1];
      const path = parent ? `${parent}/${segments[i]}` : segments[i]!;
      ancestorPaths.push(path);
      ancestors.push(path);
    }

    let cancelled = false;
    const reveal = async () => {
      try {
        const secret = await getSshSecret(selectedConfig.id);
        let currentTree = treeData;
        for (const ancestor of ancestorPaths) {
          if (cancelled) return;
          if (findRawTreeNode(currentTree, ancestor)?.children) continue;
          const rawChildren = await getRemoteTree(
            selectedConfig,
            repoPath.trim(),
            selectedBranch,
            ancestor,
            secret ?? undefined
          );
          if (cancelled) return;
          const merged = mergeUncommittedFilesIntoTree(rawChildren, uncommittedFiles, ancestor);
          currentTree = injectRawChildren(currentTree, ancestor, merged);
        }
        if (cancelled) return;
        setTreeData(currentTree); // one update, after all ancestors are materialized
        setExpandedKeys(ancestors);
        // A chain may have compacted the raw path into a stable first-path key (Pitfall 6).
        // Resolve through the map before selecting; never select a raw path that no longer exists.
        const displayKey = keyOfPath.get(normalizedPath) ?? normalizedPath;
        setSelectedKeys([displayKey]);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || `Failed to reveal ${normalizedPath}`);
      } finally {
        if (!cancelled) consumePendingRevealTarget();
        if (revealInFlightRef.current === flightKey) revealInFlightRef.current = null;
      }
    };
    void reveal();
    return () => {
      cancelled = true;
      if (revealInFlightRef.current === flightKey) revealInFlightRef.current = null;
    };
  }, [
    pendingRevealTarget,
    selectedConfig,
    selectedConfigId,
    repoPath,
    selectedBranch,
    treeData,
    uncommittedFiles,
    sshConfigs,
    setActiveRemoteTarget,
    consumePendingRevealTarget,
    keyOfPath,
  ]);

  return (
    <div
      data-testid="remote-git-explorer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--bg-island)',
      }}
    >
      {/* Controls Container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--gap-8)',
          padding: '8px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elev)',
        }}
      >
        {/* SSH Host Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)' }}>
          <CloudServerOutlined style={{ color: 'var(--folder-icon)', fontSize: 13 }} />
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)' }}>
          <FolderViewOutlined style={{ color: 'var(--fg-muted)', fontSize: 13 }} />
          <Input
            size="small"
            style={{ flex: 1, fontSize: 'var(--font-size-small)' }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)' }}>
          <BranchesOutlined style={{ color: 'var(--accent)', fontSize: 13 }} />
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
              onClick={() => {
                setTreeRefreshKey((n) => n + 1);
                void loadRootTree();
              }}
              disabled={!selectedConfig || !repoPath.trim()}
              data-testid="refresh-tree-btn"
            />
          </Tooltip>
          <Tooltip title="Find in Remote Files">
            <IconButton
              size="small"
              icon={<SearchOutlined />}
              aria-label="Find in Remote Files"
              onClick={() => executeAction('find.inPath', notify)}
              disabled={!selectedConfig || !repoPath.trim() || !selectedBranch}
              data-testid="open-find-btn"
            />
          </Tooltip>
        </div>

        {/* Global whole-ref search (IntelliJ-style) — distinct from the subtree search below */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
            Tìm toàn kho
          </span>
          <SearchInput
            style={{ flex: 1 }}
            placeholder="Tìm tệp/thư mục trong toàn kho"
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            onKeyDown={handleGlobalKeyDown}
            disabled={!globalSearchReady}
            data-testid="global-search-input"
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
          style={{ margin: 8, fontSize: 'var(--font-size-small)' }}
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
        {globalQuery.trim() ? (
          <div data-testid="global-search-results" role="listbox" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-2)' }}>
            {globalResults.length === 0 && !globalSearching ? (
              <div style={{ padding: 12, fontSize: 'var(--font-size-small)', color: 'var(--fg-muted)' }}>
                Không có kết quả trong kho từ xa.
              </div>
            ) : (
              globalResults.map((result, idx) => {
                const breadcrumb = result.path.split('/').slice(0, -1).join(' / ');
                return (
                  <div
                    key={`${result.type}:${result.path}`}
                    role="option"
                    aria-selected={idx === globalActiveIndex}
                    tabIndex={0}
                    data-testid={result.type === 'file' ? 'global-search-hit-file' : 'global-search-hit-folder'}
                    data-file-path={result.path}
                    data-result-type={result.type}
                    onMouseEnter={() => setGlobalActiveIndex(idx)}
                    onClick={() => activateGlobalResult(result)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') activateGlobalResult(result);
                    }}
                    style={{
                      cursor: 'pointer',
                      padding: '4px 6px',
                      borderRadius: 4,
                      fontSize: 'var(--font-size-small)',
                      background: idx === globalActiveIndex ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    {result.type === 'file' ? <FileTextOutlined /> : <FolderOutlined />}{' '}
                    <Tag bordered={false} style={{ fontSize: 10, margin: '0 4px 0 0' }}>
                      {result.type === 'file' ? 'Tệp' : 'Thư mục'}
                    </Tag>
                    {breadcrumb && (
                      <span style={{ color: 'var(--fg-muted)' }}>{breadcrumb} / </span>
                    )}
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {renderHighlightedName(result)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        ) : (
        <Spin spinning={loadingTree}>
          {compactDisplayNodes.length > 0 ? (
            <Tree
              key={`${treeTargetKey}|refresh-${treeRefreshKey}`}
              className="remote-git-tree"
              motion={false as any}
              loadData={onLoadData}
              treeData={compactDisplayNodes}
              selectedKeys={selectedKeys}
              expandedKeys={expandedKeys}
              onSelect={handleSelectNode}
              onExpand={(keys) => setExpandedKeys(keys as string[])}
              showIcon
              blockNode
              style={{
                background: 'transparent',
                fontSize: 'var(--font-size-small)',
                padding: '4px 6px',
              }}
            />
          ) : !loadingTree ? (
            <div style={{ padding: 20 }}>
              <Empty
                image={EmptyImageSimple}
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
