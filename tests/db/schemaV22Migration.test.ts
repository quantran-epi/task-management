import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import { SCHEMA_V21, SCHEMA_V22, LATEST_SCHEMA_VERSION } from '../../src/db/schema';
import type { AiTeamAssignment, AiTeamBatch } from '../../src/types/aiOffice';

/**
 * V21 → V22 upgrade proof (Phase 37, D-22, AIO-RUNTIME-05).
 *
 * The upgrade is purely additive: two new stores, no backfill, no `.upgrade()` hook.
 * Seeding at V21 is what proves the V20/V21 repair hooks were not renumbered or dropped.
 *
 * `tests/setup.ts` already installs the IndexedDB shim globally — never re-import it.
 */

const NOW = '2026-11-11T00:00:00.000Z';

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const BATCH_ID = '22222222-2222-4222-8222-222222222222';
const ASSIGNMENT_ID = '33333333-3333-4333-8333-333333333333';

async function seedV21Database(dbName: string): Promise<void> {
  const v21Db = new Dexie(dbName);
  v21Db.version(21).stores(SCHEMA_V21);
  await v21Db.open();

  await v21Db.table('aiTeams').bulkAdd([
    {
      id: TEAM_ID,
      name: 'Pre-existing Team',
      status: 'active',
      budgetTokens: 1000,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  await v21Db.close();
}

describe('Dexie SCHEMA_V22 Migration (Phase 37)', () => {
  let dbName: string;
  let upgraded: TaskPlannerDatabase | undefined;

  beforeEach(() => {
    dbName = 'TestSchemaV22MigrationDB_' + Math.random().toString(36).slice(2);
  });

  afterEach(async () => {
    if (upgraded) {
      try {
        await upgraded.delete();
      } catch {
        // already closed/deleted
      }
      upgraded = undefined;
    }
    await Dexie.delete(dbName);
  });

  async function openAtCurrentVersion(): Promise<TaskPlannerDatabase> {
    await seedV21Database(dbName);
    upgraded = new TaskPlannerDatabase(dbName);
    await upgraded.open();
    return upgraded;
  }

  it('opens at the latest version, which is 22', async () => {
    // 37.1 rework: V23 adds the unified team-chat tables on top of V22's ledger.
    expect(LATEST_SCHEMA_VERSION).toBe(23);
    const db = await openAtCurrentVersion();
    expect(db.verno).toBe(LATEST_SCHEMA_VERSION);
  });

  it('declares both ledger stores in SCHEMA_V22', () => {
    expect('aiTeamBatches' in SCHEMA_V22).toBe(true);
    expect('aiTeamAssignments' in SCHEMA_V22).toBe(true);
  });

  it('keeps every pre-existing V21 row readable after the upgrade', async () => {
    const db = await openAtCurrentVersion();

    const team = await db.aiTeams.get(TEAM_ID);
    expect(team?.name).toBe('Pre-existing Team');
    expect(team && 'concurrencyLimit' in team).toBe(false);
  });

  it('round-trips a batch and an assignment through the new stores', async () => {
    const db = await openAtCurrentVersion();

    const batch: AiTeamBatch = {
      id: BATCH_ID,
      teamId: TEAM_ID,
      threadId: 'thread-1',
      batchIndex: 1,
      userRequest: 'Build the thing',
      leadId: '44444444-4444-4444-8444-444444444444',
      planSnapshot: {
        original: [{ agentId: ASSIGNMENT_ID, agentName: 'E1', task: 'Write tests' }],
      },
      planDecision: 'auto',
      startedAt: NOW,
      abortedBy: 'none',
    };
    const assignment: AiTeamAssignment = {
      id: ASSIGNMENT_ID,
      batchId: BATCH_ID,
      agentId: '55555555-5555-4555-8555-555555555555',
      agentName: 'E1',
      model: 'claude-haiku-4',
      task: 'Write tests',
      runStatus: 'queued',
      stopReason: 'none',
      attemptNo: 1,
      incomplete: false,
      queuedAt: NOW,
    };

    await db.aiTeamBatches.put(batch);
    await db.aiTeamAssignments.put(assignment);

    expect(await db.aiTeamBatches.get(BATCH_ID)).toEqual(batch);
    expect(await db.aiTeamAssignments.get(ASSIGNMENT_ID)).toEqual(assignment);
    expect((await db.aiTeamAssignments.get(ASSIGNMENT_ID))?.runStatus).toBe('queued');
  });
});
