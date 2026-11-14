import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { AiSkillVersion, AiSkillVersionStatus } from '../../types/aiOffice';
import { generateId } from '../../utils/uuid';
import type { z } from 'zod';
import { AiSkillVersionInputSchema } from '../../validation/aiOfficeSchemas';

/** D-05 shape: `status` has a schema default, so a draft may omit it. */
export type AiSkillVersionDraft = z.input<typeof AiSkillVersionInputSchema>;

/**
 * Skill-version store (AIO-DATA-01, D-05).
 *
 * D-14: a pending row carries NO `version` key. The number is assigned only when a row is
 * approved, as `max(approved versions) + 1`, inside the same `rw` transaction as the status
 * write — so three simultaneous proposals cannot leave gaps behind.
 *
 * D-07: approval also overwrites `aiSkills.name`/`description`/`body`, in that same
 * transaction. `aiSkills` stays the current approved copy, so `read_skill` and the prompt
 * keep their existing source (D-08 keeps the `body` field).
 *
 * `status` is persisted exactly as validated — `pending` is the schema's default, never a
 * derivation. The only writer that moves a row off `pending` is `decideSkillVersion`.
 *
 * Phase 39 pins a run to a monotonic `version`; there is deliberately no `skillVersionId`
 * field on members, messages or assignments (research Open Question 2).
 */

/** WR-05/D-15: no id in the message — it renders in the UI, and the field name suffices. */
const MISSING_SKILL_MESSAGE =
  'Không tìm thấy kỹ năng đã chọn. Hãy chọn lại kỹ năng từ danh sách.';

/** WR-08: a decision is final — re-deciding would overwrite the recorded status/decidedAt. */
const ALREADY_DECIDED_MESSAGE =
  'Phiên bản kỹ năng đã được quyết định, không thể đổi trạng thái.';

/** WR-08: no id in the message — it renders in the UI. */
const MISSING_VERSION_MESSAGE = 'Không tìm thấy phiên bản kỹ năng đã chọn.';

/** AIO-SKILL-04: `createSkillVersion` is the only insert path, and it only ever mints pendings. */
const ONLY_PENDING_ON_CREATE_MESSAGE =
  'Chỉ có thể tạo phiên bản kỹ năng ở trạng thái chờ duyệt.';

/**
 * WR-03: the stale guard's refusal. Exported so the UI can tell this apart from a transient
 * write failure — the row stays pending either way, but only this one tells the user to
 * re-propose instead of retrying.
 */
export const STALE_VERSION_MESSAGE =
  'Kỹ năng đã có bản mới được duyệt sau khi đề xuất này được tạo. Hãy từ chối và yêu cầu đề xuất lại.';

export async function listSkillVersions(
  skillId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiSkillVersion[]> {
  const rows = await db.aiSkillVersions.where('skillId').equals(skillId).toArray();
  // D-14: unnumbered pendings need the `?? 0` or the subtraction is NaN; the createdAt
  // tiebreak keeps the "Chờ duyệt" list from reordering on every render.
  return rows.sort(
    (a, b) =>
      (b.version ?? 0) - (a.version ?? 0) || b.createdAt.localeCompare(a.createdAt)
  );
}

/**
 * D-14: the single numbering reader — used by `createSkillVersion` (to record `baseVersion`),
 * by `updateSkill` and by `decideSkillVersion`. Filters to `approved`: reading `max(version)`
 * over all rows would let a leaked number create gaps.
 */
export async function getLatestApprovedVersionNumber(
  skillId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<number> {
  const row = await db.aiSkillVersions
    .where('[skillId+version]')
    .between([skillId, 0], [skillId, Number.MAX_SAFE_INTEGER])
    .filter((row) => row.status === 'approved')
    .last();
  return row?.version ?? 0;
}

/** D-29: pendings hang until the user decides. `status` is already indexed — no Dexie bump. */
export async function listPendingSkillVersions(
  db: TaskPlannerDatabase = defaultDb
): Promise<AiSkillVersion[]> {
  const rows = await db.aiSkillVersions.where('status').equals('pending').toArray();
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * WR-06: `baseVersion` is passed in by the caller that already built the diff, so the stored
 * snapshot and the diff label cannot disagree. Omitted means "read it now" — the default for
 * every caller that does not render a diff.
 */
/**
 * D-14 write-side invariant: only an approved row may hold a number.
 *
 * The V26 upgrade repairs existing databases, but a row can still arrive numbered through a
 * direct write or a pre-39 backup. Stripping here — inside the same `rw` transaction that is
 * about to assign the next number — is what stops `max(approved) + 1` from colliding with a
 * non-approved row and making the app's own export fail its own duplicate check.
 *
 * IN-04: `validateBackup.ts` holds the same rule for a raw backup payload (before schema
 * validation, so pre-39 exports still restore). Keep the two in step: change both or neither.
 */
export async function stripNonApprovedVersionNumbers(
  skillId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  const rows = await db.aiSkillVersions.where('skillId').equals(skillId).toArray();
  for (const row of rows) {
    if (row.status === 'approved' || row.version === undefined) continue;
    const { version: _dropped, ...rest } = row;
    await db.aiSkillVersions.put(rest);
  }
}

export async function createSkillVersion(
  input: AiSkillVersionDraft,
  db: TaskPlannerDatabase = defaultDb,
  baseVersion?: number
): Promise<AiSkillVersion> {
  const validated = AiSkillVersionInputSchema.parse(input);
  // AIO-SKILL-04: a caller that smuggles `status: 'approved'` must fail here — this is the
  // only insert path, so no approved row can be minted without `decideSkillVersion`.
  if (validated.status !== 'pending') throw new Error(ONLY_PENDING_ON_CREATE_MESSAGE);

  return db.transaction('rw', [db.aiSkillVersions, db.aiSkills], async () => {
    const skill = await db.aiSkills.get(validated.skillId);
    if (!skill) throw new Error(MISSING_SKILL_MESSAGE);

    const row: AiSkillVersion = {
      id: generateId(),
      skillId: validated.skillId,
      status: 'pending',
      name: validated.name,
      description: validated.description,
      body: validated.body,
      baseVersion:
        baseVersion ?? (await getLatestApprovedVersionNumber(validated.skillId, db)),
      createdAt: new Date().toISOString(),
    };
    if (validated.evidence !== undefined) row.evidence = validated.evidence;

    await db.aiSkillVersions.add(row);
    return row;
  });
}

export async function decideSkillVersion(
  id: string,
  status: Extract<AiSkillVersionStatus, 'approved' | 'rejected'>,
  db: TaskPlannerDatabase = defaultDb,
  /**
   * WR-03: the base the user actually reviewed. The UI's disabled Approve button reads a live
   * query that updates asynchronously, so it is an affordance, not enforcement — two pendings
   * on the same base (legal in a restored backup) or two clicks inside the refresh window
   * would otherwise approve both and overwrite the newer content with the older. Passing the
   * reviewed base makes the repo refuse the mismatch inside the same `rw` transaction.
   */
  expectedBaseVersion?: number
): Promise<AiSkillVersion> {
  // Pitfall 2: `db.aiSkills` must be in the scope or the write throws `NotFoundError` at
  // runtime and TypeScript will not catch it.
  return db.transaction('rw', [db.aiSkillVersions, db.aiSkills], async () => {
    const existing = await db.aiSkillVersions.get(id);
    if (!existing) throw new Error(MISSING_VERSION_MESSAGE);
    // WR-08/D-16: the recorded decision is preserved, never flipped.
    if (existing.status !== 'pending') throw new Error(ALREADY_DECIDED_MESSAGE);

    const decidedAt = new Date().toISOString();

    if (status === 'rejected') {
      // D-14: a rejected row carries no number. The spread would preserve a legacy number
      // (pre-39 rows were all numbered), so drop the key explicitly.
      const { version: _dropped, ...rest } = existing;
      const rejected: AiSkillVersion = { ...rest, status, decidedAt };
      await db.aiSkillVersions.put(rejected);
      return rejected;
    }

    // D-14: number over approved rows only — one reader, so the rule has one definition.
    // CR-01: repair any legacy numbered non-approved row first, or the new number collides.
    await stripNonApprovedVersionNumbers(existing.skillId, db);
    const latestApproved = await getLatestApprovedVersionNumber(existing.skillId, db);

    // WR-03: the base the user reviewed must still be the live one. Checked here, inside the
    // same `rw` transaction that writes the number, so two approvals on one base cannot both
    // land — the second would overwrite the first's content and leave it view-only history.
    if (expectedBaseVersion !== undefined) {
      const reviewedBase = existing.baseVersion ?? 0;
      if (expectedBaseVersion !== reviewedBase || reviewedBase !== latestApproved) {
        throw new Error(STALE_VERSION_MESSAGE);
      }
    }

    // D-07: `aiSkills` becomes the approved copy in the same transaction.
    const skill = await db.aiSkills.get(existing.skillId);
    if (!skill) throw new Error(MISSING_SKILL_MESSAGE);

    // Criterion 3: the previous version stays retrievable. A skill that was never saved has
    // no version row at all, so the pre-approval content would be overwritten with no copy.
    // Snapshot it as v1; the proposal then becomes v2.
    let nextVersion = latestApproved + 1;
    if (latestApproved === 0) {
      await db.aiSkillVersions.add({
        id: generateId(),
        skillId: skill.id,
        version: 1,
        baseVersion: 0,
        status: 'approved',
        name: skill.name,
        description: skill.description,
        body: skill.body,
        createdAt: skill.createdAt,
        decidedAt: skill.updatedAt,
      });
      nextVersion = 2;
    }

    const approved: AiSkillVersion = {
      ...existing,
      status,
      version: nextVersion,
      decidedAt,
    };

    await db.aiSkillVersions.put(approved);
    await db.aiSkills.put({
      ...skill,
      name: approved.name,
      description: approved.description,
      body: approved.body,
      updatedAt: decidedAt,
    });
    return approved;
  });
}
