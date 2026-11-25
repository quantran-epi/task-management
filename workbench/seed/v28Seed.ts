/**
 * Shared V28 fixture rows for workbench unit + browser E2E.
 * Imports the real app classes/initializer; no raw IndexedDB writes.
 */
import { TaskPlannerDatabase } from '../../src/db/index';
import { initializeDatabaseDefaults } from '../../src/db/seeds';
import { LATEST_SCHEMA_VERSION } from '../../src/db/schema';
import type {
  ChangeRequest,
  DocumentSet,
  Note,
  System,
  Task,
} from '../../src/types/models';

const FIXED_NOW = '2026-11-25T00:00:00.000Z';

export interface V28FixtureIds {
  systemId: string;
  crId: string;
  taskIds: readonly string[];
  noteId: string;
  documentSetId: string;
}

export interface V28Fixture {
  databaseName?: string;
  ids: V28FixtureIds;
  systems: readonly System[];
  changeRequests: readonly ChangeRequest[];
  tasks: readonly Task[];
  notes: readonly Note[];
  documentSets: readonly DocumentSet[];
}

/** Deterministic UUIDs from a seeded byte stream — no dependency, stable per run. */
function fixtureUuid(seed: number): string {
  let state = seed >>> 0;
  const byte = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state & 0xff;
  };
  const hex = Array.from({ length: 16 }, byte)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function v28FixtureRows(): V28Fixture {
  const systemId = fixtureUuid(11);
  const crId = fixtureUuid(23);
  const taskIds = Array.from({ length: 5 }, (_, i) => fixtureUuid(31 + i));
  const noteId = fixtureUuid(77);
  const documentSetId = fixtureUuid(88);

  const systems: System[] = [
    {
      id: systemId,
      name: 'V28 Workbench System',
      code: 'WB-V28-SYS',
      parentId: null,
      type: 'MICROSERVICE',
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    },
  ];
  const changeRequests: ChangeRequest[] = [
    {
      id: crId,
      name: 'V28 Workbench CR',
      code: 'WB-V28-CR',
      status: 'In Progress',
      type: 'ENHANCEMENT',
      targets: [{ systemId }],
      deadline: '2026-12-01',
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    },
  ];
  const taskStatuses = ['Open', 'In Progress', 'Done', 'Open', 'In Progress'] as const;
  const priorities = ['High', 'Medium', 'Low', 'Medium', 'High'] as const;
  const deadlines = ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'];
  const estimates = [120, 240, 90, 180, 300];
  const tasks: Task[] = taskIds.map((id, i) => ({
    id,
    crId,
    systemId,
    name: `V28 task ${i + 1}`,
    status: taskStatuses[i] ?? 'Open',
    priority: priorities[i] ?? 'Medium',
    estimateMinutes: estimates[i] ?? 60,
    deadline: deadlines[i],
    progress: (i + 1) * 10,
    workType: 'code',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  }));
  const notes: Note[] = [
    {
      id: noteId,
      type: 'document',
      title: 'V28 workbench note',
      body: '# V28\n\nTài liệu kiểm chứng workbench.',
      isPinned: false,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    },
  ];
  const documentSets: DocumentSet[] = [
    {
      id: documentSetId,
      name: 'V28 workbench set',
      documentIds: [noteId],
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    },
  ];

  return {
    ids: { systemId, crId, taskIds, noteId, documentSetId },
    systems,
    changeRequests,
    tasks,
    notes,
    documentSets,
  };
}

/** Default workbench DB name — random per call, never the production name. */
export function workbenchDbName(): string {
  return `WorkbenchV28-${crypto.randomUUID()}`;
}

/** Seed into a fresh V28 database. Never defaults to the production DB name. */
export async function seedV28(targetDb?: TaskPlannerDatabase): Promise<V28Fixture> {
  const db = targetDb ?? new TaskPlannerDatabase(workbenchDbName());
  await initializeDatabaseDefaults(db);
  const rows = v28FixtureRows();
  await db.transaction(
    'rw',
    db.systems,
    db.changeRequests,
    db.tasks,
    db.notes,
    db.documentSets,
    async () => {
      await db.systems.bulkAdd([...rows.systems]);
      await db.changeRequests.bulkAdd([...rows.changeRequests]);
      await db.tasks.bulkAdd([...rows.tasks]);
      await db.notes.bulkAdd([...rows.notes]);
      await db.documentSets.bulkAdd([...rows.documentSets]);
    }
  );
  return { ...rows, databaseName: db.name };
}

export const V28_SCHEMA_VERSION = LATEST_SCHEMA_VERSION;
