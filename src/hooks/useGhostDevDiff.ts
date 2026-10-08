import { useState, useEffect, useCallback, useRef } from 'react';
import type { DiffFile, DiffHunk, DiffViewMode } from '../types/agent';
import { parseGitDiff, formatHunkPatch, buildHunkPatch, buildLinePatch } from '../utils/gitDiffParser';
import { isTauriApp } from '../utils/timerPopout';

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return args === undefined ? api.invoke<T>(command) : api.invoke<T>(command, args);
}

export interface UseGhostDevDiffResult {
  rawDiff: string;
  diffFiles: DiffFile[];
  allWorktreeFiles: string[];
  selectedFileContent: string | null;
  totalAdditions: number;
  totalDeletions: number;
  viewMode: DiffViewMode;
  setViewMode: (mode: DiffViewMode) => void;
  selectedFilePath: string | null;
  setSelectedFilePath: (path: string | null) => void;
  selectedFile: DiffFile | null;
  loading: boolean;
  refreshDiff: (silent?: boolean) => Promise<void>;
  acceptAll: (commitMessage?: string) => Promise<string>;
  acceptFile: (filePath: string, commitMessage?: string) => Promise<string>;
  acceptPatch: (patchContent: string, commitMessage?: string) => Promise<string>;
  acceptHunk: (file: DiffFile, hunk: DiffHunk) => Promise<string>;
  acceptLine: (file: DiffFile, hunk: DiffHunk, targetLineIndex: number) => Promise<string>;
  revertAll: () => Promise<void>;
  revertFile: (filePath: string) => Promise<void>;
  revertHunk: (filePath: string, hunk: DiffHunk) => Promise<void>;
}

interface CachedDiff {
  rawDiff: string;
  diffFiles: DiffFile[];
  selectedFilePath: string | null;
}

// Module-level in-memory cache to guarantee instant 0ms diff restoration on process switch
const diffCache = new Map<string, CachedDiff>();

export function useGhostDevDiff(worktreePath: string | null): UseGhostDevDiffResult {
  const [rawDiff, setRawDiff] = useState<string>(() => {
    if (worktreePath && diffCache.has(worktreePath)) {
      return diffCache.get(worktreePath)!.rawDiff;
    }
    return '';
  });
  const [diffFiles, setDiffFiles] = useState<DiffFile[]>(() => {
    if (worktreePath && diffCache.has(worktreePath)) {
      return diffCache.get(worktreePath)!.diffFiles;
    }
    return [];
  });
  const [allWorktreeFiles, setAllWorktreeFiles] = useState<string[]>([]);
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>('unified');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(() => {
    if (worktreePath && diffCache.has(worktreePath)) {
      return diffCache.get(worktreePath)!.selectedFilePath;
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    return Boolean(worktreePath && !diffCache.has(worktreePath));
  });

  const requestIdRef = useRef(0);
  const currentWorktreeRef = useRef<string | null>(worktreePath);
  currentWorktreeRef.current = worktreePath;

  const refreshDiff = useCallback(
    async (silent = false) => {
      const targetWorktree = worktreePath;
      if (!isTauriApp() || !targetWorktree) {
        setRawDiff('');
        setDiffFiles([]);
        setAllWorktreeFiles([]);
        setSelectedFilePath(null);
        setSelectedFileContent(null);
        setLoading(false);
        return;
      }

      const reqId = ++requestIdRef.current;
      const cached = diffCache.get(targetWorktree);

      if (!silent && !cached) {
        setLoading(true);
      }

      try {
        const [output, fileListRaw] = await Promise.all([
          tauriInvoke<string>('get_worktree_diff', { worktreePath: targetWorktree }).catch(() => ''),
          tauriInvoke<string[]>('list_worktree_files', { worktreePath: targetWorktree }).catch(() => [] as string[]),
        ]);

        if (requestIdRef.current !== reqId || currentWorktreeRef.current !== targetWorktree) {
          return;
        }

        const raw = output || '';
        const parsed = parseGitDiff(raw);
        const fileList: string[] = Array.isArray(fileListRaw) ? fileListRaw : [];
        setRawDiff(raw);
        setDiffFiles(parsed);
        setAllWorktreeFiles(fileList);

        let nextSelectedPath: string | null = null;
        setSelectedFilePath((prev) => {
          if (
            prev &&
            (parsed.some((f) => f.newPath === prev || f.oldPath === prev) ||
              fileList.includes(prev))
          ) {
            nextSelectedPath = prev;
            return prev;
          }
          const first = parsed[0]?.newPath || fileList[0] || null;
          nextSelectedPath = first;
          return first;
        });

        diffCache.set(targetWorktree, {
          rawDiff: raw,
          diffFiles: parsed,
          selectedFilePath: nextSelectedPath,
        });
      } catch (err) {
        if (requestIdRef.current === reqId && currentWorktreeRef.current === targetWorktree) {
          console.error('[GhostDev] Failed to fetch git diff:', err);
        }
      } finally {
        if (requestIdRef.current === reqId && currentWorktreeRef.current === targetWorktree) {
          setLoading(false);
        }
      }
    },
    [worktreePath]
  );

  // Load unchanged file content when selectedFilePath is not in diff
  useEffect(() => {
    if (!isTauriApp() || !worktreePath || !selectedFilePath) {
      setSelectedFileContent(null);
      return;
    }

    const isChanged = diffFiles.some(
      (f) => f.newPath === selectedFilePath || f.oldPath === selectedFilePath
    );
    if (isChanged) {
      setSelectedFileContent(null);
      return;
    }

    let isSubscribed = true;
    void (async () => {
      try {
        const content = await tauriInvoke<string>('read_worktree_file_content', {
          worktreePath,
          filePath: selectedFilePath,
        });
        if (isSubscribed) {
          setSelectedFileContent(content);
        }
      } catch (err) {
        if (isSubscribed) {
          setSelectedFileContent(`[Không thể đọc file: ${String(err)}]`);
        }
      }
    })();

    return () => {
      isSubscribed = false;
    };
  }, [worktreePath, selectedFilePath, diffFiles]);

  // Initial load and worktree switch handler
  useEffect(() => {
    if (!worktreePath) {
      setRawDiff('');
      setDiffFiles([]);
      setAllWorktreeFiles([]);
      setSelectedFilePath(null);
      setSelectedFileContent(null);
      setLoading(false);
      return;
    }

    const cached = diffCache.get(worktreePath);
    if (cached) {
      setRawDiff(cached.rawDiff);
      setDiffFiles(cached.diffFiles);
      setSelectedFilePath(cached.selectedFilePath);
      setLoading(false);
    } else {
      setRawDiff('');
      setDiffFiles([]);
      setSelectedFilePath(null);
      setLoading(true);
    }

    void refreshDiff(Boolean(cached));
  }, [worktreePath, refreshDiff]);

  // Event-driven refresh: update diff only on actual agent activity or status changes
  useEffect(() => {
    if (!isTauriApp() || !worktreePath) return;

    let unlistenUpdated: (() => void) | undefined;
    let unlistenFinished: (() => void) | undefined;
    let unlistenStream: (() => void) | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        unlistenUpdated = await listen('ghost-dev:session-updated', () => {
          void refreshDiff(true);
        });

        unlistenFinished = await listen('ghost-dev:session-finished', () => {
          void refreshDiff(true);
        });

        unlistenStream = await listen<{ type?: string; content?: string }>('ghost-dev:stream-chunk', (event) => {
          if (event.payload?.type === 'status_change') {
            void refreshDiff(true);
          } else if (
            event.payload?.type === 'tool_result' ||
            event.payload?.type === 'tool_call' ||
            (event.payload?.type === 'log' &&
              (event.payload?.content?.includes('"tool_result"') ||
                event.payload?.content?.includes('"tool_use"')))
          ) {
            // Debounce git diff to prevent concurrent Windows file handle conflicts during tool execution
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              void refreshDiff(true);
            }, 600);
          }
        });
      } catch (err) {
        console.error('[GhostDev] Error setting up diff event listeners:', err);
      }
    })();

    // Auto-refresh diff when user returns focus to app window
    const handleWindowFocus = () => {
      void refreshDiff(true);
    };
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (unlistenUpdated) unlistenUpdated();
      if (unlistenFinished) unlistenFinished();
      if (unlistenStream) unlistenStream();
    };
  }, [worktreePath, refreshDiff]);

  const acceptAll = useCallback(
    async (commitMessage = 'chore(ghost-dev): accept agent changes') => {
      if (!isTauriApp() || !worktreePath) return '';
      const sha = await tauriInvoke<string>('accept_all_diff', {
        worktreePath,
        commitMessage,
      });
      await refreshDiff();
      return sha;
    },
    [worktreePath, refreshDiff]
  );

  const acceptFile = useCallback(
    async (filePath: string, commitMessage?: string) => {
      if (!isTauriApp() || !worktreePath) return '';
      const sha = await tauriInvoke<string>('accept_file_diff', {
        worktreePath,
        filePath,
        commitMessage,
      });
      await refreshDiff();
      return sha;
    },
    [worktreePath, refreshDiff]
  );

  const acceptPatch = useCallback(
    async (patchContent: string, commitMessage?: string) => {
      if (!isTauriApp() || !worktreePath) return '';
      const sha = await tauriInvoke<string>('accept_patch_diff', {
        worktreePath,
        patchContent,
        commitMessage,
      });
      await refreshDiff();
      return sha;
    },
    [worktreePath, refreshDiff]
  );

  const acceptHunk = useCallback(
    async (file: DiffFile, hunk: DiffHunk) => {
      const filePath = file.newPath || file.oldPath;
      const patch = buildHunkPatch(filePath, hunk);
      return acceptPatch(patch, `chore(ghost-dev): accept hunk in ${filePath}`);
    },
    [acceptPatch]
  );

  const acceptLine = useCallback(
    async (file: DiffFile, hunk: DiffHunk, targetLineIndex: number) => {
      const filePath = file.newPath || file.oldPath;
      const patch = buildLinePatch(filePath, hunk, targetLineIndex);
      if (!patch) return '';
      return acceptPatch(patch, `chore(ghost-dev): accept change line in ${filePath}`);
    },
    [acceptPatch]
  );

  const revertAll = useCallback(async () => {
    if (!isTauriApp() || !worktreePath) return;
    await tauriInvoke('revert_all_diff', { worktreePath });
    await refreshDiff();
  }, [worktreePath, refreshDiff]);

  const revertFile = useCallback(
    async (filePath: string) => {
      if (!isTauriApp() || !worktreePath) return;
      await tauriInvoke('revert_file_diff', { worktreePath, filePath });
      await refreshDiff();
    },
    [worktreePath, refreshDiff]
  );

  const revertHunk = useCallback(
    async (filePath: string, hunk: DiffHunk) => {
      if (!isTauriApp() || !worktreePath) return;
      const patch = formatHunkPatch(filePath, hunk);
      await tauriInvoke('revert_hunk_diff', { worktreePath, patchContent: patch });
      await refreshDiff();
    },
    [worktreePath, refreshDiff]
  );

  const totalAdditions = diffFiles.reduce((acc, f) => acc + f.additions, 0);
  const totalDeletions = diffFiles.reduce((acc, f) => acc + f.deletions, 0);
  const selectedFile =
    diffFiles.find((f) => f.newPath === selectedFilePath || f.oldPath === selectedFilePath) ||
    null;

  return {
    rawDiff,
    diffFiles,
    allWorktreeFiles,
    selectedFileContent,
    totalAdditions,
    totalDeletions,
    viewMode,
    setViewMode,
    selectedFilePath,
    setSelectedFilePath,
    selectedFile,
    loading,
    refreshDiff,
    acceptAll,
    acceptFile,
    acceptPatch,
    acceptHunk,
    acceptLine,
    revertAll,
    revertFile,
    revertHunk,
  };
}
