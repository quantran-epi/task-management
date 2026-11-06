import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getSshConfigs, getSshSecret, execRemoteCommand } from '../sshService';
import {
  ORACLE_TOOL_CONFIG_KEY,
  type OracleToolConfig,
  type OracleQueryArgs,
  type OracleDescribeArgs,
  type OracleToolExecutionResult,
} from '../../types/oracleSqlcl';

export const DEFAULT_ORACLE_CONFIG: OracleToolConfig = {
  enabled: false,
  sshConfigId: '',
  connectionString: '',
  sqlclPath: 'sql',
  envVars: '',
  maxRows: 100,
  timeoutSeconds: 30,
};

/**
 * Loads the active Oracle SQLcl AI Tool configuration from database settings.
 */
export async function getOracleToolConfig(
  db: TaskPlannerDatabase = defaultDb
): Promise<OracleToolConfig> {
  try {
    const rec = await db.settings.get(ORACLE_TOOL_CONFIG_KEY);
    if (!rec || !rec.value) return { ...DEFAULT_ORACLE_CONFIG };
    return { ...DEFAULT_ORACLE_CONFIG, ...(rec.value as Partial<OracleToolConfig>) };
  } catch {
    return { ...DEFAULT_ORACLE_CONFIG };
  }
}

/**
 * Persists the Oracle SQLcl AI Tool configuration.
 */
export async function saveOracleToolConfig(
  config: OracleToolConfig,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.settings.put({
    key: ORACLE_TOOL_CONFIG_KEY,
    value: config,
  });
}

/**
 * Strips comments and string literals from SQL to safely inspect tokens.
 */
export function stripCommentsAndLiterals(sql: string): string {
  // Remove multi-line comments /* ... */
  let stripped = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove single-line comments -- ...
  stripped = stripped.replace(/--.*$/gm, ' ');
  // Remove string literals '...' (handling escaped single quotes '')
  stripped = stripped.replace(/'(?:''|[^'])*'/g, "''");
  return stripped.trim();
}

/**
 * Strict read-only guardrail check.
 * Throws an Error with explanation if query attempts mutation or non-SELECT operations.
 */
export function assertReadOnlyQuery(sql: string): void {
  const stripped = stripCommentsAndLiterals(sql);
  if (!stripped) {
    throw new Error('Câu lệnh SQL rỗng.');
  }

  // Must begin with SELECT or WITH
  const firstWordMatch = stripped.match(/^\s*([A-Za-z]+)/);
  if (!firstWordMatch || !firstWordMatch[1]) {
    throw new Error('Không nhận dạng được câu lệnh SQL.');
  }
  const firstWord = firstWordMatch[1].toUpperCase();
  if (firstWord !== 'SELECT' && firstWord !== 'WITH' && firstWord !== 'EXPLAIN') {
    throw new Error(
      `Bị từ chối: Chỉ cho phép câu lệnh đọc (SELECT hoặc WITH). Nhận được câu lệnh bắt đầu bằng '${firstWord}'.`
    );
  }

  // Guard against forbidden mutating DDL/DML/admin keywords anywhere in statement tokens
  const FORBIDDEN_PATTERN =
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|MERGE|GRANT|REVOKE|CREATE|REPLACE|EXEC|EXECUTE|CALL|BEGIN|DECLARE|LOCK|COMMENT|PURGE|FLASHBACK)\b/i;

  const match = stripped.match(FORBIDDEN_PATTERN);
  if (match) {
    throw new Error(
      `Bị từ chối: Phát hiện từ khóa thay đổi dữ liệu hoặc quyền quản trị '${match[0].toUpperCase()}'. Chỉ cho phép truy vấn SELECT an toàn.`
    );
  }
}

/**
 * Wraps SQL query with row limit if query does not already limit rows.
 */
export function applyQueryLimit(sql: string, maxRows: number): string {
  const stripped = stripCommentsAndLiterals(sql);
  const cleanSql = sql.trim().replace(/;+\s*$/, '');

  // If already has ROWNUM, FETCH FIRST, or OFFSET, do not wrap
  if (/\b(ROWNUM|FETCH\s+FIRST|OFFSET)\b/i.test(stripped)) {
    return cleanSql;
  }

  return `SELECT * FROM (\n${cleanSql}\n) WHERE ROWNUM <= ${Math.min(Math.max(1, maxRows), 1000)}`;
}

/**
 * Extracts and parses JSON output from SQLcl stdout.
 * SQLcl output may contain terminal banners or echoes before/after JSON array/object.
 */
export function extractJsonFromSqlclOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return [];

  // Try direct parse first
  try {
    return JSON.parse(trimmed);
  } catch {
    // Locate the first '[' or '{' and last ']' or '}'
    const firstBracket = trimmed.indexOf('[');
    const firstBrace = trimmed.indexOf('{');
    let startIdx = -1;
    let endIdx = -1;

    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      startIdx = firstBracket;
      endIdx = trimmed.lastIndexOf(']');
    } else if (firstBrace !== -1) {
      startIdx = firstBrace;
      endIdx = trimmed.lastIndexOf('}');
    }

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonSubstr = trimmed.substring(startIdx, endIdx + 1);
      try {
        return JSON.parse(jsonSubstr);
      } catch {
        // Return raw text if JSON sub-parsing fails
      }
    }
  }

  return stdout;
}

/**
 * Checks stdout/stderr for Oracle ORA- or SP2- error messages.
 */
export function extractOracleError(stdout: string, stderr: string): string | null {
  const combined = `${stderr}\n${stdout}`;
  const oraMatch = combined.match(/ORA-\d{5}:[^\n\r]+/);
  if (oraMatch) return oraMatch[0].trim();

  const sp2Match = combined.match(/SP2-\d{4}:[^\n\r]+/);
  if (sp2Match) return sp2Match[0].trim();

  return null;
}

/**
 * Executes an arbitrary SQL script through remote SQLcl over SSH.
 */
async function runSqlclScriptOverSsh(
  config: OracleToolConfig,
  sqlScript: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<{ stdout: string; stderr: string; exitStatus: number }> {
  if (!config.sshConfigId) {
    throw new Error('Chưa chọn cấu hình SSH remote trong cấu hình Oracle AI Tool.');
  }
  if (!config.connectionString) {
    throw new Error('Chưa cấu hình chuỗi kết nối Oracle (connection string).');
  }

  const sshConfigs = await getSshConfigs(db);
  const targetSsh = sshConfigs.find((s) => s.id === config.sshConfigId);
  if (!targetSsh) {
    throw new Error(`Không tìm thấy cấu hình SSH với ID '${config.sshConfigId}'.`);
  }

  const secret = await getSshSecret(targetSsh.id);
  const sqlclBin = (config.sqlclPath || 'sql').trim();
  const envPrefix = config.envVars?.trim() ? `${config.envVars.trim()} && ` : '';

  // Use heredoc to securely pipe SQL script without escaping hell
  // -s: silent mode, -L: attempt login only once (prevents locking accounts)
  const remoteCommand = `${envPrefix}${sqlclBin} -s -L '${config.connectionString}' << 'EOF_ORACLE_SQLCL'\n${sqlScript}\nEXIT;\nEOF_ORACLE_SQLCL`;

  return await execRemoteCommand(targetSsh, remoteCommand, secret ?? undefined);
}

/**
 * Tests connection to remote machine and Oracle database.
 */
export async function testOracleConnection(
  config: OracleToolConfig,
  db: TaskPlannerDatabase = defaultDb
): Promise<{ ok: boolean; message: string; version?: string }> {
  const startTime = Date.now();
  try {
    const testScript = `
SET PAGESIZE 0;
SET FEEDBACK OFF;
SET HEADING OFF;
SELECT 'TEST_OK|' || BANNER FROM V$VERSION WHERE ROWNUM = 1;
EXIT;
    `.trim();

    const res = await runSqlclScriptOverSsh(config, testScript, db);
    const duration = Date.now() - startTime;

    const oracleError = extractOracleError(res.stdout, res.stderr);
    if (oracleError) {
      return { ok: false, message: `Lỗi Oracle (${duration}ms): ${oracleError}` };
    }

    if (res.exitStatus !== 0 && !res.stdout.includes('TEST_OK')) {
      const err = res.stderr.trim() || res.stdout.trim() || `Exit status ${res.exitStatus}`;
      return { ok: false, message: `Lệnh SQLcl thất bại (${duration}ms): ${err}` };
    }

    const match = res.stdout.match(/TEST_OK\|([^\n\r]+)/);
    const version = match && match[1] ? match[1].trim() : res.stdout.trim() || 'Oracle DB Connected';

    return {
      ok: true,
      message: `Kết nối thành công tới Oracle DB (${duration}ms)`,
      version,
    };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    return {
      ok: false,
      message: `Lỗi kết nối (${duration}ms): ${err?.message || 'Không rõ lỗi'}`,
    };
  }
}

/**
 * Executes a read-only query on remote Oracle database via SQLcl.
 */
export async function executeOracleQuery(
  args: OracleQueryArgs,
  db: TaskPlannerDatabase = defaultDb
): Promise<string> {
  const startTime = Date.now();
  const config = await getOracleToolConfig(db);

  if (!config.enabled) {
    return JSON.stringify({
      success: false,
      error:
        'Oracle AI Tool đang bị tắt. Vui lòng bật và kiểm tra cấu hình trong Cài đặt hoặc Hộp công cụ AI Chat.',
    } satisfies Partial<OracleToolExecutionResult>);
  }

  try {
    const query = args.query?.trim();
    if (!query) {
      return JSON.stringify({
        success: false,
        error: 'Vui lòng cung cấp câu truy vấn query.',
      });
    }

    // Guardrail: Assert query is read-only
    assertReadOnlyQuery(query);

    const limit = args.limit || config.maxRows || 100;

    if (args.explain) {
      // Explain Plan execution
      const explainSql = query.replace(/;+\s*$/, '');
      const script = `
SET PAGESIZE 0;
SET FEEDBACK OFF;
SET LINESIZE 200;
EXPLAIN PLAN FOR ${explainSql};
SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY());
EXIT;
      `.trim();

      const res = await runSqlclScriptOverSsh(config, script, db);
      const executionTimeMs = Date.now() - startTime;
      const oracleError = extractOracleError(res.stdout, res.stderr);

      if (oracleError) {
        return JSON.stringify({
          success: false,
          action: 'explain',
          error: oracleError,
          executionTimeMs,
        } satisfies OracleToolExecutionResult);
      }

      return JSON.stringify({
        success: true,
        action: 'explain',
        data: res.stdout.trim(),
        executionTimeMs,
        executedSql: explainSql,
      } satisfies OracleToolExecutionResult);
    }

    // Normal query with SET TRANSACTION READ ONLY + SET SQLFORMAT JSON
    const limitedSql = applyQueryLimit(query, limit);
    const script = `
SET SQLFORMAT JSON;
SET FEEDBACK OFF;
SET PAGESIZE 0;
SET LINESIZE 32767;
SET TRIMSPOOL ON;
SET HEADING ON;
SET TRANSACTION READ ONLY;
${limitedSql};
EXIT;
    `.trim();

    const res = await runSqlclScriptOverSsh(config, script, db);
    const executionTimeMs = Date.now() - startTime;
    const oracleError = extractOracleError(res.stdout, res.stderr);

    if (oracleError) {
      return JSON.stringify({
        success: false,
        action: 'query',
        error: oracleError,
        executionTimeMs,
        executedSql: limitedSql,
      } satisfies OracleToolExecutionResult);
    }

    const parsedJson = extractJsonFromSqlclOutput(res.stdout);
    const isArray = Array.isArray(parsedJson);
    const rowCount = isArray
      ? (parsedJson as unknown[]).length
      : parsedJson && typeof parsedJson === 'object' && 'results' in parsedJson
        ? (parsedJson as any).results?.[0]?.rows?.length ?? 0
        : undefined;

    // Truncate output string if payload exceeds safety token budget (~60KB)
    let jsonString = JSON.stringify(parsedJson);
    let truncated = false;
    if (jsonString.length > 60000) {
      truncated = true;
      if (isArray) {
        const half = (parsedJson as unknown[]).slice(0, Math.floor(limit / 2));
        jsonString = JSON.stringify(half);
      }
    }

    return JSON.stringify({
      success: true,
      action: 'query',
      rowCount,
      data: JSON.parse(jsonString),
      truncated,
      executionTimeMs,
      executedSql: limitedSql,
    } satisfies OracleToolExecutionResult);
  } catch (err: any) {
    const executionTimeMs = Date.now() - startTime;
    return JSON.stringify({
      success: false,
      action: 'query',
      error: err?.message || 'Lỗi thực thi Oracle SQLcl',
      executionTimeMs,
    } satisfies OracleToolExecutionResult);
  }
}

/**
 * Inspects database metadata (list tables, describe columns, constraints, or get DDL).
 */
export async function executeOracleDescribe(
  args: OracleDescribeArgs,
  db: TaskPlannerDatabase = defaultDb
): Promise<string> {
  const startTime = Date.now();
  const config = await getOracleToolConfig(db);

  if (!config.enabled) {
    return JSON.stringify({
      success: false,
      error: 'Oracle AI Tool đang bị tắt. Vui lòng bật trong Cài đặt hoặc Hộp công cụ AI Chat.',
    });
  }

  try {
    const action = args.action;

    if (action === 'list_tables') {
      const search = (args.search || '').trim().toUpperCase();
      const schema = (args.schema || '').trim().toUpperCase();

      const schemaFilter = schema ? `AND OWNER = '${schema}'` : '';
      const searchFilter = search ? `AND (UPPER(TABLE_NAME) LIKE '%${search}%' OR UPPER(COMMENTS) LIKE '%${search}%')` : '';

      const script = `
SET SQLFORMAT JSON;
SET FEEDBACK OFF;
SET PAGESIZE 0;
SET LINESIZE 32767;
SET TRIMSPOOL ON;
SET TRANSACTION READ ONLY;
SELECT t.OWNER, t.TABLE_NAME, t.NUM_ROWS, t.LAST_ANALYZED, c.COMMENTS
FROM ALL_TABLES t
LEFT JOIN ALL_TAB_COMMENTS c ON t.OWNER = c.OWNER AND t.TABLE_NAME = c.TABLE_NAME
WHERE t.OWNER NOT IN ('SYS', 'SYSTEM', 'MDSYS', 'CTXSYS', 'XDB', 'WMSYS', 'LBACSYS', 'DVSYS', 'GSMADMIN_INTERNAL', 'AUDSYS')
  ${schemaFilter}
  ${searchFilter}
ORDER BY t.OWNER, t.TABLE_NAME
FETCH FIRST 100 ROWS ONLY;
EXIT;
      `.trim();

      const res = await runSqlclScriptOverSsh(config, script, db);
      const executionTimeMs = Date.now() - startTime;
      const oracleError = extractOracleError(res.stdout, res.stderr);
      if (oracleError) {
        return JSON.stringify({ success: false, action, error: oracleError, executionTimeMs });
      }

      return JSON.stringify({
        success: true,
        action,
        data: extractJsonFromSqlclOutput(res.stdout),
        executionTimeMs,
      });
    }

    if (action === 'describe_table') {
      const tableName = (args.tableOrView || '').trim().toUpperCase();
      if (!tableName) {
        return JSON.stringify({ success: false, error: 'Cần cung cấp tên bảng tableOrView.' });
      }
      const schema = (args.schema || '').trim().toUpperCase();
      const schemaFilter = schema ? `AND c.OWNER = '${schema}'` : '';

      // Queries columns, data types, nullability, comments, and primary keys
      const script = `
SET SQLFORMAT JSON;
SET FEEDBACK OFF;
SET PAGESIZE 0;
SET LINESIZE 32767;
SET TRIMSPOOL ON;
SET TRANSACTION READ ONLY;
SELECT
    c.COLUMN_NAME,
    c.DATA_TYPE ||
      CASE
        WHEN c.DATA_TYPE IN ('VARCHAR2', 'CHAR', 'NVARCHAR2') THEN '(' || c.DATA_LENGTH || ')'
        WHEN c.DATA_TYPE = 'NUMBER' AND c.DATA_PRECISION IS NOT NULL THEN '(' || c.DATA_PRECISION || ',' || NVL(c.DATA_SCALE, 0) || ')'
        ELSE ''
      END AS FULL_DATA_TYPE,
    c.NULLABLE,
    c.DATA_DEFAULT,
    cm.COMMENTS,
    (SELECT 'YES' FROM ALL_CONSTRAINTS pk
     JOIN ALL_CONS_COLUMNS pcol ON pk.CONSTRAINT_NAME = pcol.CONSTRAINT_NAME AND pk.OWNER = pcol.OWNER
     WHERE pk.CONSTRAINT_TYPE = 'P' AND pk.TABLE_NAME = c.TABLE_NAME AND pcol.COLUMN_NAME = c.COLUMN_NAME AND ROWNUM = 1) AS IS_PRIMARY_KEY
FROM ALL_TAB_COLS c
LEFT JOIN ALL_COL_COMMENTS cm ON c.OWNER = cm.OWNER AND c.TABLE_NAME = cm.TABLE_NAME AND c.COLUMN_NAME = cm.COLUMN_NAME
WHERE c.TABLE_NAME = '${tableName}'
  ${schemaFilter}
ORDER BY c.COLUMN_ID;
EXIT;
      `.trim();

      const res = await runSqlclScriptOverSsh(config, script, db);
      const executionTimeMs = Date.now() - startTime;
      const oracleError = extractOracleError(res.stdout, res.stderr);
      if (oracleError) {
        return JSON.stringify({ success: false, action, error: oracleError, executionTimeMs });
      }

      return JSON.stringify({
        success: true,
        action,
        table: tableName,
        columns: extractJsonFromSqlclOutput(res.stdout),
        executionTimeMs,
      });
    }

    if (action === 'get_ddl') {
      const tableName = (args.tableOrView || '').trim().toUpperCase();
      if (!tableName) {
        return JSON.stringify({ success: false, error: 'Cần cung cấp tên bảng tableOrView.' });
      }
      const schema = (args.schema || '').trim().toUpperCase();
      const schemaExpr = schema ? `'${schema}'` : 'USER';

      const script = `
SET LONG 200000;
SET PAGESIZE 0;
SET FEEDBACK OFF;
SET LINESIZE 32767;
SET HEADING OFF;
SELECT DBMS_METADATA.GET_DDL('TABLE', '${tableName}', ${schemaExpr}) FROM DUAL;
EXIT;
      `.trim();

      const res = await runSqlclScriptOverSsh(config, script, db);
      const executionTimeMs = Date.now() - startTime;
      const oracleError = extractOracleError(res.stdout, res.stderr);
      if (oracleError) {
        return JSON.stringify({ success: false, action, error: oracleError, executionTimeMs });
      }

      return JSON.stringify({
        success: true,
        action,
        table: tableName,
        ddl: res.stdout.trim(),
        executionTimeMs,
      });
    }

    return JSON.stringify({ success: false, error: `Hành động không hỗ trợ: ${action}` });
  } catch (err: any) {
    const executionTimeMs = Date.now() - startTime;
    return JSON.stringify({
      success: false,
      error: err?.message || 'Lỗi khi kiểm tra metadata Oracle',
      executionTimeMs,
    });
  }
}
