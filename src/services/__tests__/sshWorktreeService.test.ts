import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SshConfig } from '../../types/ssh';
import type { DiffHunk } from '../../types/agent';

const execRemoteCommandMock = vi.hoisted(() => vi.fn());
const getSshConfigByIdMock = vi.hoisted(() => vi.fn());

vi.mock('../sshService', () => ({
  execRemoteCommand: execRemoteCommandMock,
  getSshConfigById: getSshConfigByIdMock,
}));

import {
  confineWorktreePath,
  getWorktreeDiff,
  applyHunk,
  revertHunk,
  readWorktreeFile,
  listWorktreeFiles,
  WorktreeVerbError,
} from '../sshWorktreeService';

const REPO = '/home/dev/projects/task-management';
const WT = `${REPO}/.taskmate-worktrees/agent-developer-s1`;
const CONFIG: SshConfig = {
  id: 'ssh-1',
  name: 'dev',
  host: '10.0.0.1',
  port: 22,
  username: 'dev',
  authType: 'password',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const DESC = {
  sshConfigId: 'ssh-1',
  remoteRepoPath: REPO,
  remoteWorktreePath: WT,
  branch: 'taskmate/agent-developer-s1',
};
const HUNK: DiffHunk = {
  oldStart: 1,
  oldCount: 1,
  newStart: 1,
  newCount: 1,
  header: '',
  lines: [
    { type: 'delete', oldLineNumber: 1, content: 'old' },
    { type: 'add', newLineNumber: 1, content: 'new' },
  ],
};

function ok(stdout = '') {
  return { stdout, stderr: '', exitStatus: 0, finishReason: 'complete' };
}

describe('confineWorktreePath', () => {
  it('keeps a normal relative file inside the worktree', () => {
    expect(confineWorktreePath('README.md', DESC)).toBe(`${WT}/README.md`);
    expect(confineWorktreePath('src/a b.ts', DESC)).toBe(`${WT}/src/a b.ts`);
  });

  it.each(['../secret', '/etc/passwd', '~/.ssh/id', 'src/../../escape', '', 'a\nPATCH_EOF\ntouch /tmp/pwned', 'src/a\rb.ts', 'src/a\0b.ts'])(
    'refuses unsafe path %s',
    (input) => {
      expect(() => confineWorktreePath(input, DESC)).toThrow(WorktreeVerbError);
    }
  );

  it('refuses the main checkout root and paths outside the worktree', () => {
    expect(() => confineWorktreePath(REPO, DESC)).toThrow(WorktreeVerbError);
    expect(() => confineWorktreePath(`${REPO}/src/main.ts`, DESC)).toThrow(WorktreeVerbError);
  });

  it('refuses a path resolving outside via symlink-like .. chain', () => {
    expect(() => confineWorktreePath('.taskmate-worktrees/../../etc/passwd', DESC)).toThrow(
      WorktreeVerbError
    );
  });
});

describe('confined worktree verbs', () => {
  beforeEach(() => {
    execRemoteCommandMock.mockReset();
    getSshConfigByIdMock.mockReset();
    getSshConfigByIdMock.mockResolvedValue(CONFIG);
    execRemoteCommandMock.mockResolvedValue(ok());
  });

  it('getWorktreeDiff parses remote git diff rooted at remoteWorktreePath', async () => {
    const raw = [
      'diff --git a/README.md b/README.md',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');
    execRemoteCommandMock.mockResolvedValue(ok(raw));
    const files = await getWorktreeDiff(DESC);
    expect(files).toHaveLength(1);
    expect(files[0]?.newPath).toBe('README.md');
    const command = execRemoteCommandMock.mock.calls[0]![1] as string;
    expect(command).toContain(WT);
    expect(command).toContain('git diff');
    expect(command).not.toContain(`-C ${REPO}`);
  });

  it('applyHunk uses git apply and revertHunk uses git apply --reverse over base64, not heredoc', async () => {
    await applyHunk(DESC, 'README.md', HUNK);
    await revertHunk(DESC, 'README.md', HUNK);
    const apply = execRemoteCommandMock.mock.calls[0]![1] as string;
    const revert = execRemoteCommandMock.mock.calls[1]![1] as string;
    expect(apply).toContain('git apply -');
    expect(apply).not.toContain('--reverse');
    expect(revert).toContain('git apply --reverse');
    for (const command of [apply, revert]) {
      expect(command).toContain(`cd '${WT}'`);
      expect(command).toContain('base64 -d');
      expect(command).not.toContain('PATCH_EOF');
      expect(command).not.toContain(`cd '${REPO}'`);
      expect(command).not.toContain(`-C '${REPO}'`);
      // The patch (including the confined path) travels as base64, never raw shell text.
      const encoded = command.match(/'([A-Za-z0-9+/=]+)'/)?.[1] ?? '';
      expect(Buffer.from(encoded, 'base64').toString('utf8')).toContain('a/README.md');
    }
  });

  it('never issues an SSH command for a newline-bearing filePath (CR-01)', async () => {
    await expect(applyHunk(DESC, 'a\nPATCH_EOF\ntouch /tmp/pwned', HUNK)).rejects.toMatchObject({
      code: 'WORKTREE_PATH_ESCAPE',
    });
    expect(execRemoteCommandMock).not.toHaveBeenCalled();
  });

  it('surfaces a failed apply as a typed error containing the remote stderr', async () => {
    execRemoteCommandMock.mockResolvedValue({
      stdout: '',
      stderr: 'patch does not apply',
      exitStatus: 1,
      finishReason: 'complete',
    });
    await expect(applyHunk(DESC, 'README.md', HUNK)).rejects.toMatchObject({
      code: 'WORKTREE_APPLY_FAILED',
      message: expect.stringContaining('patch does not apply'),
    });
  });

  it('readWorktreeFile rejects symlink escape reported by the remote realpath guard', async () => {
    execRemoteCommandMock.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitStatus: 77,
      finishReason: 'complete',
    });
    await expect(readWorktreeFile(DESC, 'secret.txt')).rejects.toMatchObject({
      code: 'WORKTREE_PATH_ESCAPE',
    });
  });

  it('listWorktreeFiles never touches the main checkout', async () => {
    execRemoteCommandMock.mockResolvedValue(ok('README.md\nsrc/a.ts\n'));
    const files = await listWorktreeFiles(DESC);
    expect(files).toEqual(['README.md', 'src/a.ts']);
    const command = execRemoteCommandMock.mock.calls[0]![1] as string;
    expect(command).toContain(`cd '${WT}'`);
    expect(command).not.toContain(`cd '${REPO}'`);
  });
});
