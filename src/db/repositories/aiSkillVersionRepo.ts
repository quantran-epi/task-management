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
 * Versions are 1-based and monotonic per skill. The number is computed inside the same
 * `rw` transaction as the insert, so two concurrent creates cannot take the same number.
 *
 * `status` is persisted exactly as validated — `pending` is the schema's default, never a
 * derivation. The only writer that can move a row off `pending` is `decideSkillVersion`,
 * which touches `status` and `decidedAt` and nothing else (T-36-12).
 *
 * Phase 39 pins a run to a monotonic `version`; there is deliberately no `skillVersionId`
 * field on members, messages or assignments (research Open Question 2).
 */

export async function listSkillVersions(
  skillId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiSkillVersion[]> {
  const rows = await db.aiSkillVersions.where('skillId').equals(skillId).toArray();
  return rows.sort((a, b) => b.version - a.version);
}

/** Reads through the `[skillId+version]` compound index — never `toArray()` the table. */
export async function getLatestSkillVersion(
  skillId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiSkillVersion | undefined> {
  return db.aiSkillVersions
    .where('[skillId+version]')
    .between([skillId, 0], [skillId, Number.MAX_SAFE_INTEGER])
    .last();
}

export async function createSkillVersion(
  input: AiSkillVersionDraft,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiSkillVersion> {
  const validated = AiSkillVersionInputSchema.parse(input);

  return db.transaction('rw', [db.aiSkillVersions], async () => {
    const latest = await getLatestSkillVersion(validated.skillId, db);
    const row: AiSkillVersion = {
      id: generateId(),
      skillId: validated.skillId,
      version: (latest?.version ?? 0) + 1,
      status: validated.status,
      name: validated.name,
      description: validated.description,
      body: validated.body,
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
  return db.transaction('rw', [db.aiSkillVersions], async () => {
    const existing = await db.aiSkillVersions.get(id);
    if (!existing) throw new Error(`Không tìm thấy phiên bản kỹ năng: ${id}`);

    const updated: AiSkillVersion = {
      ...existing,
      status,
      decidedAt: new Date().toISOString(),
    };
    await db.aiSkillVersions.put(updated);
    return updated;
  });
}
