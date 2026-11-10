// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  listSkillVersions,
  getLatestSkillVersion,
  createSkillVersion,
  decideSkillVersion,
} from '../../../../src/db/repositories/aiSkillVersionRepo';
import { generateId } from '../../../../src/utils/uuid';

const BODY = '# Skill\nBước 1: đọc.\nBước 2: tóm tắt.';

function draft(skillId: string, overrides: Record<string, unknown> = {}) {
  return {
    skillId,
    name: 'Viết đặc tả',
    description: 'Quy trình viết đặc tả.',
    body: BODY,
    ...overrides,
  };
}

describe('aiSkillVersionRepo (AIO-DATA-01, D-05)', () => {
  let db: TaskPlannerDatabase;
  let skillId: string;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('TestAiSkillVersionRepo_' + Math.random().toString(36).slice(2));
    await db.open();
    skillId = generateId();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('creates version 1 as pending when the input omits status', async () => {
    const created = await createSkillVersion(draft(skillId), db);

    expect(created).toEqual({
      id: created.id,
      skillId,
      version: 1,
      status: 'pending',
      name: 'Viết đặc tả',
      description: 'Quy trình viết đặc tả.',
      body: BODY,
      createdAt: created.createdAt,
    });
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
  });

  it('numbers versions monotonically per skill and restarts at 1 for another skill', async () => {
    const otherSkillId = generateId();

    const first = await createSkillVersion(draft(skillId), db);
    const second = await createSkillVersion(draft(skillId), db);
    const third = await createSkillVersion(draft(skillId), db);
    const other = await createSkillVersion(draft(otherSkillId), db);

    expect([first.version, second.version, third.version]).toEqual([1, 2, 3]);
    expect(other.version).toBe(1);
    expect((await listSkillVersions(skillId, db)).map((row) => row.version)).toEqual([3, 2, 1]);
  });

  it('returns the highest version row as the latest', async () => {
    await createSkillVersion(draft(skillId), db);
    const second = await createSkillVersion(draft(skillId), db);
    const third = await createSkillVersion(draft(skillId), db);

    expect(await getLatestSkillVersion(skillId, db)).toEqual(third);
    expect((await getLatestSkillVersion(skillId, db))?.id).toBe(third.id);
    expect(second.version).toBe(2);
  });

  it('decides a version by writing status and decidedAt only (T-36-12)', async () => {
    const pending = await createSkillVersion(draft(skillId), db);

    const approved = await decideSkillVersion(pending.id, 'approved', db);

    expect(approved).toEqual({
      ...pending,
      status: 'approved',
      decidedAt: approved.decidedAt,
    });
    expect(approved.decidedAt).toBeTruthy();
    expect(new Date(approved.decidedAt!).toISOString()).toBe(approved.decidedAt);
    expect(approved.name).toBe(pending.name);
    expect(approved.description).toBe(pending.description);
    expect(approved.body).toBe(pending.body);
    expect(approved.version).toBe(pending.version);
  });

  it('rejects a pending version and throws the not-found error for a missing id', async () => {
    const pending = await createSkillVersion(draft(skillId), db);

    expect((await decideSkillVersion(pending.id, 'rejected', db)).status).toBe('rejected');

    const missingId = generateId();
    await expect(decideSkillVersion(missingId, 'approved', db)).rejects.toThrow(
      `Không tìm thấy phiên bản kỹ năng: ${missingId}`
    );
  });

  it('omits evidence entirely when the input has none', async () => {
    const created = await createSkillVersion(draft(skillId), db);

    expect('evidence' in created).toBe(false);
    const stored = await db.aiSkillVersions.get(created.id);
    expect('evidence' in stored!).toBe(false);
  });

  it('never assigns the same version to two concurrent creates', async () => {
    const [a, b] = await Promise.all([
      createSkillVersion(draft(skillId), db),
      createSkillVersion(draft(skillId), db),
    ]);

    expect(a.version).not.toBe(b.version);
    expect([a.version, b.version].sort()).toEqual([1, 2]);
    expect(await db.aiSkillVersions.where('skillId').equals(skillId).count()).toBe(2);
  });
});
