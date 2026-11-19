import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { buildScopeKey } from '../../src/db/repositories/chatRepo';
import { threadScopeParts } from '../../src/db/repositories/chatTabRepo';
import { BackupChatThreadRecordSchema } from '../../src/validation/backupSchemas';
import { restoreBackupPayload } from '../../src/services/backup/restoreBackup';
import { validateBackupPayload } from '../../src/services/backup/validateBackup';
import { APP_MARKER, CURRENT_SCHEMA_VERSION } from '../../src/services/backup/exportBackup';
import type { BackupEnvelope } from '../../src/types/backup';

// Wave 0 contract for plan 47-01 Task 1 (D-01, D-06).
// A remote chat scope key MUST be `remote:<v4-uuid>` — no raw SSH config id, repo path or
// branch in the key — and MUST survive threadScopeParts -> buildScopeKey -> backup Zod
// schema -> restoreBackup without falling back to global (Pitfalls 1 & 2 / V20 bug class).
const REMOTE_TARGET_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THREAD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = '2026-01-01T00:00:00.000Z';

function remoteThreadRecord(entityId: string): Record<string, unknown> {
  return {
    id: THREAD_ID,
    scopeKey: `remote:${entityId}`,
    scopeType: 'remote',
    entityId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function envelopeWithRemoteThread(thread: Record<string, unknown>): BackupEnvelope {
  return {
    app: APP_MARKER,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: NOW,
    tables: {
      tasks: [],
      capacityRules: [],
      capacityOverrides: [],
      plannedAllocations: [],
      chatThreads: [thread],
    },
    counts: {
      tasks: 0,
      capacityRules: 0,
      capacityOverrides: 0,
      plannedAllocations: 0,
      chatThreads: 1,
    },
  } as unknown as BackupEnvelope;
}

describe('remote:<uuid> scope round-trip (Phase 47 D-06)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`test-remote-scope-${Date.now()}-${Math.random()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('builds a remote:<uuid> key with no raw path or branch encoded', () => {
    expect(buildScopeKey('remote', REMOTE_TARGET_UUID)).toBe(`remote:${REMOTE_TARGET_UUID}`);
  });

  it('threadScopeParts returns remote not global for a remote:<uuid> key', () => {
    expect(threadScopeParts(`remote:${REMOTE_TARGET_UUID}`)).toEqual({
      scopeType: 'remote',
      entityId: REMOTE_TARGET_UUID,
    });
  });

  it('backup schema accepts a v4 UUID entityId and rejects a raw-path entityId', () => {
    expect(
      BackupChatThreadRecordSchema.safeParse(remoteThreadRecord(REMOTE_TARGET_UUID)).success
    ).toBe(true);

    const rawPath = 'ssh-config/my/repo/feature-branch';
    const rejected = BackupChatThreadRecordSchema.safeParse(remoteThreadRecord(rawPath));
    expect(rejected.success).toBe(false);
    if (!rejected.success) {
      expect(rejected.error.issues.some((issue) => issue.message.includes('RFC 4122 v4 UUID'))).toBe(
        true
      );
    }
  });

  it('backup still validates with a remote thread present', () => {
    expect(validateBackupPayload(envelopeWithRemoteThread(remoteThreadRecord(REMOTE_TARGET_UUID))).valid).toBe(
      true
    );
  });

  it('restore reconstructs remote scope with the same target UUID entityId', async () => {
    await restoreBackupPayload(envelopeWithRemoteThread(remoteThreadRecord(REMOTE_TARGET_UUID)), db);

    const rows = await db.chatThreads.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.scopeType).toBe('remote');
    expect(rows[0]?.entityId).toBe(REMOTE_TARGET_UUID);
    expect(rows[0]?.scopeKey).toBe(`remote:${REMOTE_TARGET_UUID}`);
    // Re-parsing the restored key must still resolve to remote, never global.
    expect(threadScopeParts(rows[0]!.scopeKey)).toEqual({
      scopeType: 'remote',
      entityId: REMOTE_TARGET_UUID,
    });
  });
});
