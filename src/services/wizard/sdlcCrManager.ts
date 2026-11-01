import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { ChatThread } from '../../types/models';
import { generateId } from '../../utils/uuid';
import type { SdlcStepId, SdlcWorkflowMetadata } from './workflowSchemas';

export interface SdlcCrRecord {
  id: string;
  crCode: string;
  featureName: string;
  author: string;
  requestingUnit: string;
  date: string;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  completedAt?: string;
  inheritedContext?: boolean;
}

export interface ChangePackHistoryItem {
  hash: string;
  filename: string;
  uploadedAt: string;
  fileSize: number;
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

const CR_SETTING_PREFIX = 'sdlc_crs:';
const PACK_SETTING_PREFIX = 'sdlc_packs:';

function getCrSettingKey(projectId: string): string {
  return `${CR_SETTING_PREFIX}${projectId}`;
}

function getPackSettingKey(projectId: string, crId: string): string {
  return `${PACK_SETTING_PREFIX}${projectId}:${crId}`;
}

export async function listCrs(
  projectId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<SdlcCrRecord[]> {
  const row = await db.settings.get(getCrSettingKey(projectId));
  if (!row || !row.value) {
    return [];
  }
  try {
    const list = JSON.parse(row.value);
    return Array.isArray(list) ? (list as SdlcCrRecord[]) : [];
  } catch {
    return [];
  }
}

export async function getActiveCr(
  projectId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<SdlcCrRecord | null> {
  const crs = await listCrs(projectId, db);
  return crs.find((cr) => cr.status === 'active') ?? null;
}

export async function createNewCr(
  projectId: string,
  metadata: SdlcWorkflowMetadata,
  inheritContext = false,
  db: TaskPlannerDatabase = defaultDb
): Promise<SdlcCrRecord> {
  const crs = await listCrs(projectId, db);
  const now = new Date().toISOString();

  // Mark all prior active CRs as archived (T-25.1.2-02)
  const updatedCrs = crs.map((cr) => {
    if (cr.status === 'active') {
      return { ...cr, status: 'archived' as const };
    }
    return cr;
  });

  const newCr: SdlcCrRecord = {
    id: generateId(),
    crCode: metadata.cr,
    featureName: metadata.featureName,
    author: metadata.author,
    requestingUnit: metadata.requestingUnit,
    date: metadata.date,
    status: 'active',
    createdAt: now,
    inheritedContext: inheritContext || undefined,
  };

  updatedCrs.push(newCr);

  await db.settings.put({
    key: getCrSettingKey(projectId),
    value: JSON.stringify(updatedCrs),
  });

  return newCr;
}

export async function completeCr(
  projectId: string,
  crId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  const crs = await listCrs(projectId, db);
  const now = new Date().toISOString();

  const updatedCrs = crs.map((cr) => {
    if (cr.id === crId) {
      return {
        ...cr,
        status: 'completed' as const,
        completedAt: now,
      };
    }
    return cr;
  });

  await db.settings.put({
    key: getCrSettingKey(projectId),
    value: JSON.stringify(updatedCrs),
  });
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

  await db.chatThreads.add(thread);
  return thread;
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
    const parsed = JSON.parse(row.value);
    return {
      activePackHash: parsed.activePackHash,
      packs: Array.isArray(parsed.packs) ? parsed.packs : [],
    };
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
