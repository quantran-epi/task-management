import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mergeUncommittedFilesIntoTree,
  getRemoteFileContent,
} from '../gitRemoteTreeService';
import * as gitRemoteService from '../gitRemoteService';
import * as sshService from '../sshService';
import type { SshConfig } from '../../types/ssh';

const mockConfig: SshConfig = {
  id: 'ssh-1',
  name: 'Dev',
  host: '10.0.0.1',
  port: 22,
  username: 'dev',
  authType: 'password',
  createdAt: '',
  updatedAt: '',
};

describe('gitRemoteTreeService uncommitted files & working copy fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mergeUncommittedFilesIntoTree correctly merges untracked and modified files', () => {
    const initialNodes = [
      { key: 'src', title: 'src', isLeaf: false, sha: 'tree-sha' },
      { key: 'package.json', title: 'package.json', isLeaf: true, sha: 'blob-sha' },
    ];

    const uncommitted = [
      { path: 'package.json', indexStatus: ' ', workingTreeStatus: 'M' },
      { path: 'src/new-feature.ts', indexStatus: '?', workingTreeStatus: '?' },
      { path: 'notes.txt', indexStatus: '?', workingTreeStatus: '?' },
    ];

    const merged = mergeUncommittedFilesIntoTree(initialNodes, uncommitted);

    const pkg = merged.find((n) => n.title === 'package.json');
    expect(pkg?.gitStatus).toBe('M');

    const src = merged.find((n) => n.title === 'src');
    expect(src?.gitStatus).toBe('M');

    const notes = merged.find((n) => n.title === 'notes.txt');
    expect(notes).toBeDefined();
    expect(notes?.isLeaf).toBe(true);
    expect(notes?.gitStatus).toBe('?');
  });

  it('getRemoteFileContent falls back to getRemoteWorkingFileContent when git show fails', async () => {
    vi.spyOn(gitRemoteService, 'runGitCommand').mockRejectedValue(
      new Error("fatal: path 'untracked.ts' does not exist in 'main'")
    );

    vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      exitStatus: 0,
      stdout: 'console.log("untracked fallback content");',
      stderr: '',
    });

    const content = await getRemoteFileContent(mockConfig, '/home/dev/repo', 'main', 'untracked.ts');
    expect(content).toBe('console.log("untracked fallback content");');
    expect(sshService,).toBeDefined();
    expect(sshService.execRemoteCommand).toHaveBeenCalledWith(
      mockConfig,
      expect.stringContaining("cat -- '/home/dev/repo/untracked.ts'"),
      undefined
    );
  });
});
