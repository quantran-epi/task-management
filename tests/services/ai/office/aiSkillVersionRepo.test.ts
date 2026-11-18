// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  listSkillVersions,
  getLatestApprovedVersionNumber,
  listPendingSkillVersions,
  createSkillVersion,
  decideSkillVersion,
  STALE_VERSION_MESSAGE,
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

    // CR-03: the first approval snapshots the pre-approval content as v1, so the proposal
    // becomes v2 — the user-authored original stays retrievable.
    const approvedFirst = await decideSkillVersion(first.id, 'approved', db);
    expect(approvedFirst.version).toBe(2);

    const approvedThird = await decideSkillVersion(third.id, 'approved', db);
    expect(approvedThird.version).toBe(3);

    // Baseline v1, two approved proposals, one still pending (unnumbered, sorts last).
    expect((await listSkillVersions(skillId, db)).map((row) => row.version)).toEqual([
      3,
      2,
      1,
      undefined,
    ]);
  });

  it('snapshots the pre-approval content as v1 so the original stays retrievable (CR-03)', async () => {
    await db.aiSkills.put({
      ...(await db.aiSkills.get(skillId))!,
      name: 'Bản gốc',
      description: 'Mô tả gốc',
      body: '# GỐC',
    });

    const pending = await createSkillVersion(
      draft(skillId, { name: 'Bản mới', description: 'Mô tả mới', body: '# MỚI' }),
      db
    );
    const approved = await decideSkillVersion(pending.id, 'approved', db);

    const rows = await db.aiSkillVersions.where('skillId').equals(skillId).toArray();
    expect(rows).toHaveLength(2);
    const baseline = rows.find((row) => row.version === 1)!;
    expect(baseline.status).toBe('approved');
    expect(baseline.body).toBe('# GỐC');
    expect(baseline.name).toBe('Bản gốc');
    expect(approved.version).toBe(2);
    expect((await db.aiSkills.get(skillId))?.body).toBe('# MỚI');
  });

  it('does not snapshot a baseline twice when an approved version already exists', async () => {
    const first = await createSkillVersion(draft(skillId), db);
    await decideSkillVersion(first.id, 'approved', db);

    const second = await createSkillVersion(draft(skillId, { body: '# Lần 2' }), db);
    const approved = await decideSkillVersion(second.id, 'approved', db);

    expect(approved.version).toBe(3);
    expect(await db.aiSkillVersions.where('skillId').equals(skillId).count()).toBe(3);
  });

  it('never assigns the same version to two concurrent approvals', async () => {
    const a = await createSkillVersion(draft(skillId), db);
    const b = await createSkillVersion(draft(skillId), db);

    const [approvedA, approvedB] = await Promise.all([
      decideSkillVersion(a.id, 'approved', db),
      decideSkillVersion(b.id, 'approved', db),
    ]);

    // CR-03 adds one baseline v1 row per skill, so the two proposals take 2 and 3.
    expect([approvedA.version, approvedB.version].sort()).toEqual([2, 3]);
    expect(await db.aiSkillVersions.where('skillId').equals(skillId).count()).toBe(3);
  });

  it('records the latest approved number as baseVersion on a new pending (D-15)', async () => {
    const first = await createSkillVersion(draft(skillId), db);
    await decideSkillVersion(first.id, 'approved', db);

    const second = await createSkillVersion(draft(skillId), db);
    expect(second.baseVersion).toBe(2);
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
    // `createdAt` is ISO-millisecond resolution — without a gap the two rows tie and the
    // assertion below becomes a coin flip under parallel workers.
    await new Promise((resolve) => setTimeout(resolve, 3));
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
    // CR-03: a rejection writes no baseline row either — nothing was approved.
    expect(await db.aiSkillVersions.count()).toBe(1);

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
    expect(stored?.version).toBe(2);
  });

  it('strips a legacy version number when a pre-39 pending is rejected (CR-02)', async () => {
    const legacyId = generateId();
    await db.aiSkillVersions.add({
      id: legacyId,
      skillId,
      version: 7,
      status: 'pending',
      name: 'Viết đặc tả',
      description: 'Quy trình viết đặc tả.',
      body: BODY,
      createdAt: new Date().toISOString(),
    });

    const rejected = await decideSkillVersion(legacyId, 'rejected', db);

    expect(rejected.status).toBe('rejected');
    expect('version' in rejected).toBe(false);
    const stored = await db.aiSkillVersions.get(legacyId);
    expect('version' in stored!).toBe(false);
  });

  it('strips a legacy numbered non-approved row before numbering a new approval (CR-01)', async () => {
    // Pre-39 shape: a rejected row that already holds v1.
    const legacyRejectedId = generateId();
    await db.aiSkillVersions.add({
      id: legacyRejectedId,
      skillId,
      version: 1,
      status: 'rejected',
      name: 'Viết đặc tả',
      description: 'Quy trình viết đặc tả.',
      body: BODY,
      createdAt: new Date().toISOString(),
    });

    const pending = await createSkillVersion(draft(skillId), db);
    await decideSkillVersion(pending.id, 'approved', db);

    const rows = await db.aiSkillVersions.where('skillId').equals(skillId).toArray();
    expect('version' in rows.find((row) => row.id === legacyRejectedId)!).toBe(false);
    // Exactly one row per number — the app's own export stays importable.
    const numbers = rows.map((row) => row.version).filter((value) => value !== undefined);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('omits evidence entirely when the input has none', async () => {
    const created = await createSkillVersion(draft(skillId), db);

    expect('evidence' in created).toBe(false);
    const stored = await db.aiSkillVersions.get(created.id);
    expect('evidence' in stored!).toBe(false);
  });

  it('refuses an approval whose reviewed base is no longer the live one (WR-03)', async () => {
    const a = await createSkillVersion(draft(skillId, { body: '# A' }), db);
    const b = await createSkillVersion(draft(skillId, { body: '# B' }), db);
    // Both were proposed against base 0 — legal, and a restored backup can carry exactly this.
    expect(a.baseVersion).toBe(0);
    expect(b.baseVersion).toBe(0);

    await decideSkillVersion(a.id, 'approved', db, 0);

    // B's reviewed base (0) is now behind the live approved version (2).
    await expect(decideSkillVersion(b.id, 'approved', db, 0)).rejects.toThrow(
      STALE_VERSION_MESSAGE
    );

    // A's just-approved content survives; B is untouched and still pending.
    expect((await db.aiSkills.get(skillId))?.body).toBe('# A');
    const storedB = await db.aiSkillVersions.get(b.id);
    expect(storedB?.status).toBe('pending');
    expect('version' in storedB!).toBe(false);
  });

  it('refuses when the caller reviewed a different base than the row records (WR-03)', async () => {
    const pending = await createSkillVersion(draft(skillId), db);

    await expect(decideSkillVersion(pending.id, 'approved', db, 99)).rejects.toThrow(
      STALE_VERSION_MESSAGE
    );
    expect((await db.aiSkillVersions.get(pending.id))?.status).toBe('pending');
  });

  it('still rejects a stale proposal — the guard only blocks approval (WR-03)', async () => {
    const a = await createSkillVersion(draft(skillId, { body: '# A' }), db);
    const b = await createSkillVersion(draft(skillId, { body: '# B' }), db);
    await decideSkillVersion(a.id, 'approved', db, 0);

    const rejected = await decideSkillVersion(b.id, 'rejected', db, 0);
    expect(rejected.status).toBe('rejected');
  });

  it('refuses a dangling skillId and writes no version row (WR-05, D-15)', async () => {
    const ghost = generateId();

    await expect(createSkillVersion(draft(ghost), db)).rejects.toThrow(
      /Không tìm thấy kỹ năng/
    );
    expect(await db.aiSkillVersions.count()).toBe(0);
  });
});
