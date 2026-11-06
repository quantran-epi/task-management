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
} from '../oracleSqlclService';
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
});

describe('oracleSqlclService - Execution & SSH mocking', () => {
  const fakeDb: any = {
    settings: {
      get: vi.fn(),
      put: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns helpful error if tool is disabled', async () => {
    fakeDb.settings.get.mockResolvedValueOnce({
      value: { enabled: false },
    });

    const resStr = await executeOracleQuery({ query: 'SELECT 1 FROM DUAL' }, fakeDb);
    const res = JSON.parse(resStr);
    expect(res.success).toBe(false);
    expect(res.error).toContain('bị tắt');
  });

  it('executes read-only query over mocked SSH', async () => {
    fakeDb.settings.get.mockResolvedValueOnce({
      value: {
        enabled: true,
        sshConfigId: 'ssh-1',
        connectionString: 'user/pass@host:1521/srv',
        maxRows: 100,
      },
    });

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

  it('executes describe_table over mocked SSH', async () => {
    fakeDb.settings.get.mockResolvedValueOnce({
      value: {
        enabled: true,
        sshConfigId: 'ssh-1',
        connectionString: 'user/pass@host:1521/srv',
      },
    });

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
        enabled: true,
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
        enabled: true,
        sshConfigId: 'ssh-1',
        connectionString: 'user/pass@host:1521/srv',
      },
      fakeDb
    );

    expect(fakeDb.settings.put).toHaveBeenCalledWith({
      key: 'oracle_ai_tool_config',
      value: expect.objectContaining({ enabled: true, sshConfigId: 'ssh-1' }),
    });
  });
});
