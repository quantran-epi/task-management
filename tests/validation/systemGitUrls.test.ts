// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { createSystem, getSystem, updateSystem } from '../../src/db/repositories/systemRepo';
import { BackupSystemRecordSchema } from '../../src/validation/backupSchemas';
import {
  gitRepoUrlSchema,
  isGitRepoUrl,
  isValidGitRepoUrl,
  SystemInputSchema,
  SystemUpdateSchema,
} from '../../src/validation/schemas';

const NOW = '2026-11-28T10:00:00.000Z';
const SYSTEM_ID = '11111111-1111-4111-8111-111111111111';

function systemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SYSTEM_ID,
    name: 'Core Service',
    code: 'CORE_SVC',
    parentId: null,
    type: 'SERVICE',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('isGitRepoUrl — allowlist cho link git của System', () => {
  it.each([
    'https://github.com/acme/svc.git',
    'http://git.internal/acme/svc',
    'ssh://git@host/acme/svc.git',
    'git://host/acme/svc.git',
    'git@github.com:acme/svc.git',
  ])('chấp nhận %s', (url) => {
    expect(isGitRepoUrl(url)).toBe(true);
    expect(isValidGitRepoUrl(url)).toBe(true);
    expect(gitRepoUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///srv/repo',
    '/srv/repo',
    'C:\\srv\\repo',
    'https://github.com/acme/my repo.git',
    'a'.repeat(501),
    '',
    '   ',
  ])('từ chối %s', (url) => {
    expect(isGitRepoUrl(url)).toBe(false);
    expect(gitRepoUrlSchema.safeParse(url).success).toBe(false);
  });

  it('từ chối giá trị không phải chuỗi', () => {
    expect(isGitRepoUrl(null)).toBe(false);
    expect(isGitRepoUrl(42)).toBe(false);
  });
});

describe('System git link schemas', () => {
  it('chấp nhận 2 link optional và giữ nguyên field cũ', () => {
    const parsed = SystemInputSchema.parse({
      name: 'Core Service',
      code: 'CORE_SVC',
      type: 'SERVICE',
      remoteRepoPath: '/srv/repo',
      gitSourceUrl: '  https://github.com/acme/svc.git  ',
      gitOpsUrl: 'git@github.com:acme/gitops.git',
    });
    expect(parsed.gitSourceUrl).toBe('https://github.com/acme/svc.git');
    expect(parsed.gitOpsUrl).toBe('git@github.com:acme/gitops.git');
    expect(parsed.remoteRepoPath).toBe('/srv/repo');
  });

  it('từ chối link độc hại ở cả input/update schema', () => {
    expect(
      SystemInputSchema.safeParse({
        name: 'Core Service',
        code: 'CORE_SVC',
        gitSourceUrl: 'javascript:alert(1)',
      }).success
    ).toBe(false);
    expect(SystemUpdateSchema.safeParse({ gitOpsUrl: 'file:///srv/repo' }).success).toBe(false);
  });

  it('LOGICAL_GROUP vẫn nhận link nhưng vẫn bị chặn SSH/repo', () => {
    const withLinks = SystemInputSchema.safeParse({
      name: 'Group',
      code: 'GROUP',
      type: 'LOGICAL_GROUP',
      gitSourceUrl: 'https://github.com/acme/svc.git',
      gitOpsUrl: 'https://github.com/acme/gitops.git',
    });
    expect(withLinks.success).toBe(true);

    const withRepo = SystemInputSchema.safeParse({
      name: 'Group',
      code: 'GROUP',
      type: 'LOGICAL_GROUP',
      remoteRepoPath: '/srv/repo',
      gitSourceUrl: 'https://github.com/acme/svc.git',
    });
    expect(withRepo.success).toBe(false);
  });

  it('BackupSystemRecordSchema chấp nhận link cũ thiếu và hợp lệ, từ chối link độc hại', () => {
    expect(BackupSystemRecordSchema.safeParse(systemRow()).success).toBe(true);
    expect(
      BackupSystemRecordSchema.safeParse(
        systemRow({
          gitSourceUrl: 'https://github.com/acme/svc.git',
          gitOpsUrl: 'git@github.com:acme/gitops.git',
        })
      ).success
    ).toBe(true);
    expect(
      BackupSystemRecordSchema.safeParse(
        systemRow({ gitSourceUrl: 'javascript:alert(1)' })
      ).success
    ).toBe(false);
  });
});

describe('systemRepo — persistence cho 2 link git', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`GitUrlsTest_${Math.random()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('createSystem lưu cả 2 link, update đổi từng link và xoá được bằng key present', async () => {
    const created = await createSystem(
      {
        name: 'Core Service',
        code: 'CORE_SVC',
        parentId: null,
        type: 'SERVICE',
        gitSourceUrl: 'https://github.com/acme/svc.git',
        gitOpsUrl: 'git@github.com:acme/gitops.git',
      },
      db
    );
    expect(created.gitSourceUrl).toBe('https://github.com/acme/svc.git');
    expect(created.gitOpsUrl).toBe('git@github.com:acme/gitops.git');

    const changed = await updateSystem(
      created.id,
      { gitSourceUrl: 'https://github.com/acme/new-svc.git', gitOpsUrl: undefined },
      db
    );
    expect(changed.gitSourceUrl).toBe('https://github.com/acme/new-svc.git');
    expect(changed.gitOpsUrl).toBeUndefined();

    const stored = await getSystem(created.id, db);
    expect(stored?.gitSourceUrl).toBe('https://github.com/acme/new-svc.git');
    expect(stored?.gitOpsUrl).toBeUndefined();
  });

  it('row cũ không có field vẫn đọc và update bình thường', async () => {
    const created = await createSystem(
      { name: 'Legacy Service', code: 'LEGACY', parentId: null, type: 'SERVICE' },
      db
    );
    const stored = await getSystem(created.id, db);
    expect(stored?.gitSourceUrl).toBeUndefined();
    expect(stored?.gitOpsUrl).toBeUndefined();

    const changed = await updateSystem(
      created.id,
      { gitOpsUrl: 'ssh://git@host/acme/gitops.git' },
      db
    );
    expect(changed.gitSourceUrl).toBeUndefined();
    expect(changed.gitOpsUrl).toBe('ssh://git@host/acme/gitops.git');
  });

  it('LOGICAL_GROUP lưu được link nhưng vẫn chặn repo binding', async () => {
    const parent = await createSystem(
      {
        name: 'Parent Group',
        code: 'PARENT',
        parentId: null,
        type: 'LOGICAL_GROUP',
        gitSourceUrl: 'https://github.com/acme/svc.git',
        gitOpsUrl: 'https://github.com/acme/gitops.git',
      },
      db
    );
    expect(parent.gitSourceUrl).toBe('https://github.com/acme/svc.git');
    expect(parent.gitOpsUrl).toBe('https://github.com/acme/gitops.git');

    await expect(
      createSystem(
        {
          name: 'Bad Parent',
          code: 'BAD_PARENT',
          parentId: null,
          type: 'LOGICAL_GROUP',
          remoteRepoPath: '/srv/repo',
        },
        db
      )
    ).rejects.toThrow();
  });
});
