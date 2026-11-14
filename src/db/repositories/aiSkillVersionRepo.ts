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
 * Reads through the `[skillId+version]` compound index — never `toArray()` the table.
 *
 * Dexie skips rows whose key part is absent, so an unnumbered pending is invisible here and
 * this returns the highest *numbered* row by construction — no status filter needed.
 */
export async function getLatestSkillVersion(
  skillId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiSkillVersion | undefined> {
  return db.aiSkillVersions
    .where('[skillId+version]')
    .between([skillId, 0], [skillId, Number.MAX_SAFE_INTEGER])
    .last();
}

/**
 * D-14: the single numbering reader — used by `createSkillVersion` (to record `baseVersion`)
 * and by the run pin. Filters to `approved`: reading `max(version)` over all rows would let a
 * leaked number create gaps.
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

export async function createSkillVersion(
  input: AiSkillVersionDraft,
  db: TaskPlannerDatabase = defaultDb
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
      baseVersion: await getLatestApprovedVersionNumber(validated.skillId, db),
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
  db: TaskPlannerDatabase = defaultDb
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
      // A rejected row gets no number — the spread must not invent one.
      const rejected: AiSkillVersion = { ...existing, status, decidedAt };
      await db.aiSkillVersions.put(rejected);
      return rejected;
    }

    // D-14: number over approved rows only.
    const latestApproved = await db.aiSkillVersions
      .where('[skillId+version]')
      .between([existing.skillId, 0], [existing.skillId, Number.MAX_SAFE_INTEGER])
      .filter((row) => row.status === 'approved')
      .last();
    const nextVersion = (latestApproved?.version ?? 0) + 1;
    const approved: AiSkillVersion = {
      ...existing,
      status,
      version: nextVersion,
      decidedAt,
    };

    // D-07: `aiSkills` becomes the approved copy in the same transaction.
    const skill = await db.aiSkills.get(existing.skillId);
    if (!skill) throw new Error(MISSING_SKILL_MESSAGE);

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
