import { useState, useEffect, useCallback } from 'react';
import type { DiffFile, DiffViewMode } from '../types/agent';
import { parseGitDiff } from '../utils/gitDiffParser';
import { isTauriApp } from '../utils/timerPopout';

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return args === undefined ? api.invoke<T>(command) : api.invoke<T>(command, args);
}

export interface UseGhostDevDiffResult {
  rawDiff: string;
  diffFiles: DiffFile[];
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
  revertAll: () => Promise<void>;
  revertFile: (filePath: string) => Promise<void>;
}

export function useGhostDevDiff(worktreePath: string | null): UseGhostDevDiffResult {
  const [rawDiff, setRawDiff] = useState<string>('');
  const [diffFiles, setDiffFiles] = useState<DiffFile[]>([]);
  const [viewMode, setViewMode] = useState<DiffViewMode>('unified');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const refreshDiff = useCallback(
    async (silent = false) => {
      if (!isTauriApp() || !worktreePath) {
        setRawDiff('');
        setDiffFiles([]);
        setSelectedFilePath(null);
        return;
      }

      if (!silent) {
        setLoading(true);
      }
      try {
        const output = await tauriInvoke<string>('get_worktree_diff', { worktreePath });
        setRawDiff(output || '');
        const parsed = parseGitDiff(output || '');
        setDiffFiles(parsed);

        // Maintain valid file selection
        setSelectedFilePath((prev) => {
          if (prev && parsed.some((f) => f.newPath === prev || f.oldPath === prev)) {
            return prev;
          }
          const first = parsed[0];
          return first ? first.newPath : null;
        });
      } catch (err) {
        console.error('[GhostDev] Failed to fetch git diff:', err);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [worktreePath]
  );

  // Initial load and periodic refresh / event-driven refresh
  useEffect(() => {
    void refreshDiff(false);
  }, [refreshDiff]);

  // Periodic poll every 3 seconds to catch live git file modifications by agents (silent refresh)
  useEffect(() => {
    if (!isTauriApp() || !worktreePath) return;

    const interval = setInterval(() => {
      void refreshDiff(true);
    }, 3000);

    return () => clearInterval(interval);
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

  const totalAdditions = diffFiles.reduce((acc, f) => acc + f.additions, 0);
  const totalDeletions = diffFiles.reduce((acc, f) => acc + f.deletions, 0);
  const selectedFile =
    diffFiles.find((f) => f.newPath === selectedFilePath || f.oldPath === selectedFilePath) ||
    null;

  return {
    rawDiff,
    diffFiles,
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
    revertAll,
    revertFile,
  };
}
