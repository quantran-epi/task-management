import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../db';
import {
  getOracleConnectionProfiles,
  resolveOracleConnection,
  listOracleConnectionSummaries,
  saveOracleConnectionProfiles,
} from '../oracleSqlclService';
import { executeAiTool } from '../aiTools';
import {
  ORACLE_TOOL_CONFIG_KEY,
  ORACLE_TOOL_CONFIG_LIST_KEY,
  type OracleConnectionProfile,
} from '../../../types/oracleSqlcl';
import { isSafeBackupSetting } from '../../backup/exportBackup';

const profiles: OracleConnectionProfile[] = [
  {
    id: 'sit-uuid',
    name: 'Main SIT',
    environment: 'SIT',
    isActive: true,
    sshConfigId: 'ssh-sit',
    connectionString: 'sit_user/sit_secret@sithost:1521/SIT',
    maxRows: 100,
  },
  {
    id: 'uat-uuid',
    name: 'QA UAT',
    environment: 'UAT',
    isActive: false,
    sshConfigId: 'ssh-uat',
    connectionString: 'uat_user/uat_secret@uathost:1521/UAT',
    maxRows: 200,
  },
];

describe('Oracle multi-connection resolution', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`OracleMulti_${Math.random()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('resolves exact id before case-insensitive name and environment, then active fallback', () => {
    expect(resolveOracleConnection(profiles, { connectionId: 'uat-uuid' }).id).toBe('uat-uuid');
    expect(resolveOracleConnection(profiles, { name: 'qa uat' }).id).toBe('uat-uuid');
    expect(resolveOracleConnection(profiles, { environment: 'sit' }).id).toBe('sit-uuid');
    expect(resolveOracleConnection(profiles).id).toBe('sit-uuid');
  });

  it('returns only safe metadata in listOracleConnectionSummaries', () => {
    const summaries = listOracleConnectionSummaries(profiles);
    expect(summaries).toEqual([
      { id: 'sit-uuid', name: 'Main SIT', environment: 'SIT', isActive: true },
      { id: 'uat-uuid', name: 'QA UAT', environment: 'UAT', isActive: false },
    ]);
    const serialized = JSON.stringify(summaries);
    expect(serialized).not.toContain('sit_secret');
    expect(serialized).not.toContain('@sithost');
    expect(serialized).not.toContain('ssh-sit');
  });

  it('unknown selector error lists names only, never a connection string or host', () => {
    let message = '';
    try {
      resolveOracleConnection(profiles, { name: 'PROD' });
    } catch (err: any) {
      message = err?.message || '';
    }
    expect(message).toContain('Main SIT');
    expect(message).toContain('QA UAT');
    expect(message).not.toContain('sit_secret');
    expect(message).not.toContain('uat_secret');
    expect(message).not.toContain('@sithost');
    expect(message).not.toContain('@uathost');
    expect(message).not.toContain('connectionString');
  });

  it('migrates legacy config into active profile #1 then deletes the plaintext legacy row', async () => {
    await db.settings.put({
      key: ORACLE_TOOL_CONFIG_KEY,
      value: {
        sshConfigId: 'ssh-legacy',
        connectionString: 'legacy_user/legacy_secret@legacyhost:1521/LEGACY',
        maxRows: 100,
      },
    });

    const migrated = await getOracleConnectionProfiles(db);
    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({
      sshConfigId: 'ssh-legacy',
      connectionString: 'legacy_user/legacy_secret@legacyhost:1521/LEGACY',
      isActive: true,
    });
    expect(await db.settings.get(ORACLE_TOOL_CONFIG_KEY)).toBeUndefined();
    expect((await db.settings.get(ORACLE_TOOL_CONFIG_LIST_KEY))?.value).toMatchObject({
      profiles: [migrated[0]],
    });
  });

  it('oracle_list_connections advertises only safe metadata via the dispatch path', async () => {
    await saveOracleConnectionProfiles(profiles, db);
    const result = JSON.parse(await executeAiTool('oracle_list_connections', {}, db));
    expect(result).toEqual([
      { id: 'sit-uuid', name: 'Main SIT', environment: 'SIT', isActive: true },
      { id: 'uat-uuid', name: 'QA UAT', environment: 'UAT', isActive: false },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('both Oracle settings keys are excluded from plaintext backups', () => {
    expect(isSafeBackupSetting(ORACLE_TOOL_CONFIG_LIST_KEY)).toBe(false);
    expect(isSafeBackupSetting(ORACLE_TOOL_CONFIG_KEY)).toBe(false);
  });
});
