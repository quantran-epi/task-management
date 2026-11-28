// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { createSystem, getSystem, updateSystem } from '../../src/db/repositories/systemRepo';
import { BackupSystemRecordSchema } from '../../src/validation/backupSchemas';
import {
  gitLinkStringSchema,
  SystemInputSchema,
  SystemUpdateSchema,
} from '../../src/validation/schemas';
import { shouldRenderGitLink } from '../../src/utils/gitLink';

const NOW = '2026-11-28T10:00:00.000Z';
const SYSTEM_ID = '11111111-1111-4111-8111-111111111111';
const ANY_STRINGS = [
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'file:///srv/repo',
  '/srv/repo',
  'C:\\srv\\repo',
  'https://user:pass@host/x',
  'https://evil.com\\@github.com/x',
  'a'.repeat(501),
  '   ',
  '\t\n',
  '',
];

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

describe('gitLinkStringSchema + System schemas — lưu nguyên mọi chuỗi', () => {
  it.each(ANY_STRINGS)('chấp nhận nguyên chuỗi %j', (value) => {
    expect(gitLinkStringSchema.safeParse(value).success).toBe(true);
    expect(gitLinkStringSchema.parse(value)).toBe(value);
  });

  it('giữ nguyên khoảng trắng ở input/update schema', () => {
    const parsed = SystemInputSchema.parse({
      name: 'Core Service',
      code: 'CORE_SVC',
      type: 'SERVICE',
      remoteRepoPath: '/srv/repo',
      gitSourceUrl: '  abc  ',
      gitOpsUrl: '  git@github.com:acme/gitops.git  ',
    });
    expect(parsed.gitSourceUrl).toBe('  abc  ');
    expect(parsed.gitOpsUrl).toBe('  git@github.com:acme/gitops.git  ');
    expect(parsed.remoteRepoPath).toBe('/srv/repo');

    const updated = SystemUpdateSchema.parse({ gitSourceUrl: '  weird value  ', gitOpsUrl: '' });
    expect(updated.gitSourceUrl).toBe('  weird value  ');
    expect(updated.gitOpsUrl).toBe('');
  });

  it('LOGICAL_GROUP vẫn nhận link nhưng vẫn bị chặn SSH/repo', () => {
    const withLinks = SystemInputSchema.safeParse({
      name: 'Group',
      code: 'GROUP',
      type: 'LOGICAL_GROUP',
      gitSourceUrl: 'javascript:alert(1)',
      gitOpsUrl: '  abc  ',
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

  it('BackupSystemRecordSchema chấp nhận mọi string và payload cũ thiếu field', () => {
    expect(BackupSystemRecordSchema.safeParse(systemRow()).success).toBe(true);
    for (const value of ANY_STRINGS) {
      expect(BackupSystemRecordSchema.safeParse(systemRow({ gitSourceUrl: value, gitOpsUrl: value })).success).toBe(true);
    }
  });
});

describe('shouldRenderGitLink — predicate HIỂN THỊ, không phải validator input', () => {
  it.each([
    'https://github.com/a/b.git',
    'http://git.internal/acme/svc',
    'ssh://host/acme/svc.git',
    'git://host/acme/svc.git',
    'git@host:owner/repo.git',
  ])('render link cho %s', (url) => {
    expect(shouldRenderGitLink(url)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///srv/repo',
    '/srv/repo',
    'C:\\srv\\repo',
    'https://user:pass@host/x',
    'https://evil.com\\@github.com/x',
    'https://github.com/acme/my repo.git',
    'ssh:///repo',
    'a'.repeat(501).slice(0, 20) + ' x ' + 'b'.repeat(20),
    '',
    '   ',
    '\t\n',
  ])('render text cho %j', (url) => {
    expect(shouldRenderGitLink(url)).toBe(false);
  });
});

describe('systemRepo — persistence giữ nguyên chuỗi lạ', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`GitUrlsTest_${Math.random()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('create/update lưu nguyên chuỗi lạ; xoá bằng chuỗi rỗng', async () => {
    const created = await createSystem(
      {
        name: 'Core Service',
        code: 'CORE_SVC',
        parentId: null,
        type: 'SERVICE',
        gitSourceUrl: '  weird value  ',
        gitOpsUrl: 'javascript:alert(1)',
      },
      db
    );
    expect(created.gitSourceUrl).toBe('  weird value  ');
    expect(created.gitOpsUrl).toBe('javascript:alert(1)');

    const changed = await updateSystem(
      created.id,
      { gitSourceUrl: '  weird value  ', gitOpsUrl: '' },
      db
    );
    expect(changed.gitSourceUrl).toBe('  weird value  ');
    expect(changed.gitOpsUrl).toBeUndefined();

    const stored = await getSystem(created.id, db);
    expect(stored?.gitSourceUrl).toBe('  weird value  ');
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
        gitSourceUrl: 'javascript:alert(1)',
        gitOpsUrl: '  abc  ',
      },
      db
    );
    expect(parent.gitSourceUrl).toBe('javascript:alert(1)');
    expect(parent.gitOpsUrl).toBe('  abc  ');

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
