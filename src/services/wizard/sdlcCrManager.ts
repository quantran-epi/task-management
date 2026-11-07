import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { ChatThread } from '../../types/models';
import { generateId } from '../../utils/uuid';
import type { SdlcStepId } from './workflowSchemas';
import type { ChangePackManifest } from './changePack';

/**
 * Marker for pack rows written before the subsystem dimension existed (and for a CR that
 * carries no targets). Never a real `System.id`; the UI renders it as an unnamed pack.
 */
export const LEGACY_SYSTEM_ID = '__legacy__';

export interface SdlcCrRecord {
  id: string;
  crCode: string;
  featureName: string;
  author: string;
  requestingUnit: string;
  date: string;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  completedAt?: string | undefined;
  inheritedContext?: boolean | undefined;
}

export interface ChangePackHistoryItem {
  hash: string;
  filename: string;
  uploadedAt: string;
  fileSize: number;
  /** D-40: the subsystem this pack was built from. */
  systemId: string;
  /**
   * Validated manifest persisted at upload (entry bytes stripped) so activation can
   * reconcile without the original zip. Rows written before this field existed have none;
   * they are re-uploaded rather than guessed.
   */
  manifest?: ChangePackManifest;
  driftSummary?: {
    outsideSolution: number;
    missingImplementation: number;
    divergent: number;
  };
}

export interface MultiPackState {
  activePackHash?: string;
  packs: ChangePackHistoryItem[];
}

const PACK_SETTING_PREFIX = 'sdlc_packs:';

function getPackSettingKey(projectId: string, crId: string): string {
  return `${PACK_SETTING_PREFIX}${projectId}:${crId}`;
}

/** D-40: pack history grouped per subsystem for the per-card result and Pack All summary. */
export function groupPacksBySystem(
  state: MultiPackState
): Record<string, ChangePackHistoryItem[]> {
  const grouped: Record<string, ChangePackHistoryItem[]> = {};
  for (const pack of state.packs) {
    (grouped[pack.systemId] ??= []).push(pack);
  }
  return grouped;
}

/**
 * Resolves an isolated ChatThread strictly keyed by `sdlc:${projectId}:${crId}:${stepId}` (D-02, D-05).
 * Thread history is isolated per CR and per step.
 */
export async function getStepThread(
  projectId: string,
  crId: string,
  stepId: SdlcStepId,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatThread> {
  const scopeKey = `sdlc:${projectId}:${crId}:${stepId}`;
  return db.transaction('rw', db.chatThreads, async () => {
    const existing = await db.chatThreads.where('scopeKey').equals(scopeKey).first();
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const thread: ChatThread = {
      id: generateId(),
      scopeKey,
      scopeType: 'project',
      entityId: projectId,
      title: `[SDLC] ${stepId}`,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.chatThreads.add(thread);
      return thread;
    } catch {
      const raceExisting = await db.chatThreads.where('scopeKey').equals(scopeKey).first();
      if (raceExisting) return raceExisting;
      throw new Error(`Failed to create or retrieve step thread for ${scopeKey}`);
    }
  });
}

export async function getMultiPackState(
  projectId: string,
  crId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<MultiPackState> {
  const row = await db.settings.get(getPackSettingKey(projectId, crId));
  if (!row || !row.value) {
    return { packs: [] };
  }
  try {
    const parsed = JSON.parse(String(row.value));
    const packs: ChangePackHistoryItem[] = Array.isArray(parsed.packs)
      ? parsed.packs.map((pack: ChangePackHistoryItem) => ({
          ...pack,
          // Rows persisted before D-40 carry no subsystem; keep them visible rather than
          // dropping history, and never fabricate an id that could collide with a real system.
          systemId: typeof pack.systemId === 'string' && pack.systemId ? pack.systemId : LEGACY_SYSTEM_ID,
        }))
      : [];
    return { activePackHash: parsed.activePackHash, packs };
  } catch {
    return { packs: [] };
  }
}

export async function saveMultiPackState(
  projectId: string,
  crId: string,
  state: MultiPackState,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.settings.put({
    key: getPackSettingKey(projectId, crId),
    value: JSON.stringify(state),
  });
}
