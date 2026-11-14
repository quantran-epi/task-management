// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  listSkillVersions,
  getLatestSkillVersion,
  getLatestApprovedVersionNumber,
  listPendingSkillVersions,
  createSkillVersion,
  decideSkillVersion,
} from '../../../../src/db/repositories/aiSkillVersionRepo';
import { generateId } from '../../../../src/utils/uuid';
import { createSkill } from '../../../../src/db/repositories/aiOfficeRepo';

const BODY = '# Skill\nBước 1: đọc.\nBước 2: tóm tắt.';

function skillInput(name: string) {
  return { name, description: 'Mô tả.', body: BODY };
}

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
    // WR-05: fixture ids must name real aiSkills rows or the new existence guard refuses them.
    skillId = (await createSkill(skillInput('Viết đặc tả'), db)).id;
  });

  afterEach(async () => {
    await db.delete();
  });

  it('creates a pending row with no version number (D-14)', async () => {
    const created = await createSkillVersion(draft(skillId), db);

    // The key must be absent, not `undefined`: the compound index skips absent key parts.
    expect('version' in created).toBe(false);
    expect(created.status).toBe('pending');
    expect(created.baseVersion).toBe(0);
    expect(created.name).toBe('Viết đặc tả');
    expect(created.description).toBe('Quy trình viết đặc tả.');
    expect(created.body).toBe(BODY);
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
    expect(await db.aiSkillVersions.where('[skillId+version]').equals([skillId, 0]).count()).toBe(0);
  });

  it('assigns a number only when a version is approved (D-14)', async () => {
    const first = await createSkillVersion(draft(skillId), db);
    const second = await createSkillVersion(draft(skillId), db);
    const third = await createSkillVersion(draft(skillId), db);

    for (const row of [first, second, third]) expect('version' in row).toBe(false);
    expect(await getLatestApprovedVersionNumber(skillId, db)).toBe(0);

    const approvedFirst = await decideSkillVersion(first.id, 'approved', db);
    expect(approvedFirst.version).toBe(1);

    const approvedThird = await decideSkillVersion(third.id, 'approved', db);
    expect(approvedThird.version).toBe(2);

    // Two approved plus one still pending; the unnumbered row sorts last.
    expect((await listSkillVersions(skillId, db)).map((row) => row.version)).toEqual([
      2,
      1,
      undefined,
    ]);
  });

  it('getLatestSkillVersion ignores unnumbered pending rows', async () => {
    const first = await createSkillVersion(draft(skillId), db);
    await createSkillVersion(draft(skillId), db);

    expect(await getLatestSkillVersion(skillId, db)).toBeUndefined();

    const approved = await decideSkillVersion(first.id, 'approved', db);
    expect((await getLatestSkillVersion(skillId, db))?.id).toBe(approved.id);
  });

  it('never assigns the same version to two concurrent approvals', async () => {
    const a = await createSkillVersion(draft(skillId), db);
    const b = await createSkillVersion(draft(skillId), db);

    const [approvedA, approvedB] = await Promise.all([
      decideSkillVersion(a.id, 'approved', db),
      decideSkillVersion(b.id, 'approved', db),
    ]);

    expect([approvedA.version, approvedB.version].sort()).toEqual([1, 2]);
    expect(await db.aiSkillVersions.where('skillId').equals(skillId).count()).toBe(2);
  });

  it('records the latest approved number as baseVersion on a new pending (D-15)', async () => {
    const first = await createSkillVersion(draft(skillId), db);
    await decideSkillVersion(first.id, 'approved', db);

    const second = await createSkillVersion(draft(skillId), db);
    expect(second.baseVersion).toBe(1);
    expect('version' in second).toBe(false);
  });

  it('overwrites aiSkills name, description and body in the approval transaction (D-07)', async () => {
    const pending = await createSkillVersion(
      draft(skillId, {
        name: 'Viết đặc tả v2',
        description: 'Quy trình mới.',
        body: '# Skill v2\nBước 1: viết.',
      }),
      db
    );

    const approved = await decideSkillVersion(pending.id, 'approved', db);

    const skill = await db.aiSkills.get(skillId);
    expect(skill?.name).toBe('Viết đặc tả v2');
    expect(skill?.description).toBe('Quy trình mới.');
    expect(skill?.body).toBe('# Skill v2\nBước 1: viết.');
    expect(skill?.updatedAt).toBe(approved.decidedAt);
  });

  it('rolls back both tables when the approval cannot write aiSkills (Pitfall 2)', async () => {
    const pending = await createSkillVersion(draft(skillId), db);
    await db.aiSkills.delete(skillId);

    await expect(decideSkillVersion(pending.id, 'approved', db)).rejects.toThrow(
      /Không tìm thấy kỹ năng/
    );

    const stored = await db.aiSkillVersions.get(pending.id);
    expect(stored?.status).toBe('pending');
    expect('version' in stored!).toBe(false);
  });

  it('rejects a non-pending status on create (AIO-SKILL-04)', async () => {
    await expect(
      createSkillVersion(draft(skillId, { status: 'approved' }), db)
    ).rejects.toThrow(/chờ duyệt/);

    expect(await db.aiSkillVersions.count()).toBe(0);
  });

  it('listPendingSkillVersions returns only pending rows, newest first', async () => {
    const older = await createSkillVersion(draft(skillId), db);
    const newer = await createSkillVersion(draft(skillId), db);
    const approved = await createSkillVersion(draft(skillId), db);
    await decideSkillVersion(approved.id, 'approved', db);

    const pending = await listPendingSkillVersions(db);
    expect(pending.map((row) => row.id)).toEqual([newer.id, older.id]);
  });

  it('rejects a pending version and throws a UUID-free not-found error for a missing id', async () => {
    const pending = await createSkillVersion(draft(skillId), db);

    const rejected = await decideSkillVersion(pending.id, 'rejected', db);
    expect(rejected.status).toBe('rejected');
    // A rejected row gets no number.
    expect('version' in rejected).toBe(false);

    await expect(decideSkillVersion(pending.id, 'approved', db)).rejects.toThrow(
      /đã được quyết định/
    );

    const missingId = generateId();
    await expect(decideSkillVersion(missingId, 'approved', db)).rejects.toThrow(
      /^Không tìm thấy phiên bản kỹ năng đã chọn\.$/
    );
  });

  it('keeps an approved row status and decidedAt when a second decision is refused (WR-08)', async () => {
    const pending = await createSkillVersion(draft(skillId), db);
    const approved = await decideSkillVersion(pending.id, 'approved', db);

    await expect(decideSkillVersion(pending.id, 'rejected', db)).rejects.toThrow(
      /đã được quyết định/
    );

    const stored = await db.aiSkillVersions.get(pending.id);
    expect(stored?.status).toBe('approved');
    expect(stored?.decidedAt).toBe(approved.decidedAt);
    expect(stored?.version).toBe(1);
  });

  it('omits evidence entirely when the input has none', async () => {
    const created = await createSkillVersion(draft(skillId), db);

    expect('evidence' in created).toBe(false);
    const stored = await db.aiSkillVersions.get(created.id);
    expect('evidence' in stored!).toBe(false);
  });

  it('refuses a dangling skillId and writes no version row (WR-05, D-15)', async () => {
    const ghost = generateId();

    await expect(createSkillVersion(draft(ghost), db)).rejects.toThrow(
      /Không tìm thấy kỹ năng/
    );
    expect(await db.aiSkillVersions.count()).toBe(0);
  });
});
