import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getSshConfigs, getSshSecret, execRemoteCommand } from '../sshService';
import {
  ORACLE_TOOL_CONFIG_KEY,
  ORACLE_TOOL_CONFIG_LIST_KEY,
  type OracleToolConfig,
  type OracleToolConfigList,
  type OracleConnectionProfile,
  type OracleConnectionSelector,
  type OracleConnectionSummary,
  type OracleQueryArgs,
  type OracleDescribeArgs,
  type OracleToolExecutionResult,
} from '../../types/oracleSqlcl';

export const DEFAULT_ORACLE_CONFIG: OracleToolConfig = {
  sshConfigId: '',
  connectionString: '',
  sqlclPath: 'sql',
  envVars: '',
  maxRows: 100,
};

/**
 * Loads the named profile list, migrating the legacy single-config row on first read.
 *
 * Migration wraps the existing working connection unchanged into active profile #1,
 * persists the list, then deletes `oracle_ai_tool_config` in the SAME transaction so no
 * plaintext copy of the password-bearing connection string survives in settings.
 * See T-45-06 / D-13.
 */
export async function getOracleConnectionProfiles(
  db: TaskPlannerDatabase = defaultDb
): Promise<OracleConnectionProfile[]> {
  try {
    const listRec = await db.settings.get(ORACLE_TOOL_CONFIG_LIST_KEY);
    if (listRec?.value) {
      const profiles = (listRec.value as OracleToolConfigList).profiles;
      if (Array.isArray(profiles)) return profiles;
    }

    // No list yet: attempt one-shot migration from the legacy single-config row.
    const legacyRec = await db.settings.get(ORACLE_TOOL_CONFIG_KEY);
    if (!legacyRec?.value) return [];

    const legacy = {
      ...DEFAULT_ORACLE_CONFIG,
      ...(legacyRec.value as Partial<OracleToolConfig>),
    };
    const migrated: OracleConnectionProfile = {
      ...legacy,
      id: crypto.randomUUID(),
      name: 'Oracle (migrated)',
      environment: 'UNKNOWN',
      isActive: true,
    };

    await db.transaction('rw', db.settings, async () => {
      await db.settings.put({
        key: ORACLE_TOOL_CONFIG_LIST_KEY,
        value: { profiles: [migrated] } satisfies OracleToolConfigList,
      });
      // Delete the legacy row only after the list is persisted successfully inside the
      // same transaction — if either write fails, Dexie rolls both back and migration
      // is retried on the next read. Never keep a rollback copy of the raw string.
      await db.settings.delete(ORACLE_TOOL_CONFIG_KEY);
    });

    return [migrated];
  } catch {
    return [];
  }
}

/** Persists the whole named profile list as one settings row. */
export async function saveOracleConnectionProfiles(
  profiles: OracleConnectionProfile[],
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.settings.put({
    key: ORACLE_TOOL_CONFIG_LIST_KEY,
    value: { profiles } satisfies OracleToolConfigList,
  });
}

/** Safe metadata only — never include connectionString, sqlclPath, envVars or test details. */
export function listOracleConnectionSummaries(
  profiles: OracleConnectionProfile[]
): OracleConnectionSummary[] {
  return profiles.map(({ id, name, environment, isActive }) => ({
    id,
    name,
    environment,
    isActive,
  }));
}

/**
 * Resolves a tool selector to exactly one profile: exact id, then case-insensitive
 * name/environment, then the active profile. Throws a name-only error for an unknown
 * selector so passwords and `@host` fragments can never reach the model or logs (T-45-07).
 */
export function resolveOracleConnection(
  profiles: OracleConnectionProfile[],
  selector: OracleConnectionSelector = {}
): OracleConnectionProfile {
  const byId = selector.connectionId
    ? profiles.find((profile) => profile.id === selector.connectionId)
    : undefined;
  if (byId) return byId;

  const needle = selector.name?.trim().toLowerCase();
  const envNeedle = selector.environment?.trim().toLowerCase();
  if (needle) {
    const byName = profiles.find((profile) => profile.name.trim().toLowerCase() === needle);
    if (byName) return byName;
  }
  if (envNeedle) {
    const byEnv = profiles.find(
      (profile) => profile.environment.trim().toLowerCase() === envNeedle
    );
    if (byEnv) return byEnv;
  }

  const hasSelector = Boolean(
    selector.connectionId?.trim() || selector.name?.trim() || selector.environment?.trim()
  );
  if (!hasSelector) {
    // D-10: no selector at all -> active default.
    const active = profiles.find((profile) => profile.isActive);
    if (active) return active;
  }

  // A selector was supplied but matched nothing (or no active profile exists): report
  // safe names only. Never include a connection string, host or password (T-45-07).
  const safeList = profiles.length
    ? listOracleConnectionSummaries(profiles)
        .map((p) => `${p.name} (${p.environment})${p.isActive ? ' [active]' : ''}`)
        .join(', ')
    : '(chưa có kết nối nào)';
  throw new Error(
    `Không tìm thấy kết nối Oracle phù hợp. Các kết nối hiện có: ${safeList}. ` +
      `Chọn connectionId/name/environment trong danh sách trên.`
  );
}

/**
 * Loads the active Oracle SQLcl AI Tool configuration from database settings.
 *
 * Legacy callers (chat toolbox indicator, Telegram gating) keep working after migration:
 * the legacy row is deleted on migration, so when it is absent we resolve the active
 * profile instead. This never recreates the plaintext legacy row.
 */
export async function getOracleToolConfig(
  db: TaskPlannerDatabase = defaultDb
): Promise<OracleToolConfig> {
  try {
    const rec = await db.settings.get(ORACLE_TOOL_CONFIG_KEY);
    if (rec?.value) {
      return { ...DEFAULT_ORACLE_CONFIG, ...(rec.value as Partial<OracleToolConfig>) };
    }
  } catch {
    return { ...DEFAULT_ORACLE_CONFIG };
  }
  try {
    const profiles = await getOracleConnectionProfiles(db);
    if (!profiles.length) return { ...DEFAULT_ORACLE_CONFIG };
    const active = resolveOracleConnection(profiles);
    return { ...DEFAULT_ORACLE_CONFIG, ...active };
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
 * WR-03: validate a model-supplied identifier (schema / table / view name) before it is
 * interpolated into a describe script. Oracle unquoted identifiers are letters, digits and
 * _ $ #, start with a letter; we normalize to uppercase. Rejecting anything else stops an
 * injected `EMP' UNION SELECT ... --` from breaking out of the SQL string literal.
 */
export function safeOracleIdentifier(value: string | undefined, label: string): string {
  const normalized = (value ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_$#]*$/.test(normalized)) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return normalized;
}

/**
 * WR-03: escape a model-supplied free-text filter for safe embedding inside a SQL
 * string literal (LIKE '%...%'). Doubling single quotes is the SQL-standard escape; the
 * value stays a pure literal and cannot terminate the surrounding quote.
 */
export function escapeOracleLikeFilter(value: string): string {
  return value.replace(/'/g, "''");
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
 * Redacts the password-bearing connection string from any text before it reaches a tool
 * result or model-visible error. Covers the full `user/pass@host` string and the bare
 * password component, which a shell/SSH error may echo back.
 */
function redactConnectionSecrets(message: string, config: OracleToolConfig): string {
  let out = message;
  const cs = config.connectionString?.trim();
  if (!cs) return out;
  out = out.split(cs).join('***');
  const atIdx = cs.indexOf('@');
  const beforeAt = atIdx >= 0 ? cs.slice(0, atIdx) : cs;
  const slashIdx = beforeAt.indexOf('/');
  const password = slashIdx >= 0 ? beforeAt.slice(slashIdx + 1) : '';
  if (password) out = out.split(password).join('***');
  return out;
}

/**
 * Detects a remote command failure that `extractOracleError` cannot see (SSH auth failure,
 * missing `sql`, connect timeout, shell error). These produce no ORA-/SP2- token; without
 * this guard `extractJsonFromSqlclOutput('')` turns an empty stdout into `[]` and the tool
 * falsely reports `{ success: true, data: [] }` instead of the real error.
 *
 * Returns a redacted error message on failure, or null when the command output is usable.
 * A legitimately empty result set (exit 0, no stderr) is NOT treated as a failure.
 */
export function detectRemoteFailure(
  res: { stdout: string; stderr: string; exitStatus: number; finishReason?: string },
  config: OracleToolConfig
): string | null {
  const stdout = (res.stdout ?? '').trim();
  const stderr = (res.stderr ?? '').trim();
  const nonZeroExit = typeof res.exitStatus === 'number' && res.exitStatus !== 0;
  const badFinish = res.finishReason === 'error' || res.finishReason === 'cancelled';
  // Empty stdout WITH stderr content on an otherwise-ok exit is a silent shell/sqlcl failure
  // (e.g. `sql: command not found` written to stderr). Empty stdout alone may be a valid 0-row
  // result, so it is not by itself an error.
  const emptyOutWithStderr = !stdout && Boolean(stderr);
  if (!nonZeroExit && !badFinish && !emptyOutWithStderr) return null;

  const firstLine = stderr.split('\n').find((line) => line.trim().length > 0)?.trim() ?? '';
  let reason: string;
  if (firstLine) {
    reason = firstLine;
  } else if (res.finishReason === 'cancelled') {
    reason = 'Lệnh SQLcl đã bị hủy.';
  } else if (nonZeroExit) {
    reason = `Lệnh SQLcl thoát với mã ${res.exitStatus} và không trả về dữ liệu.`;
  } else {
    reason = 'Lệnh SQLcl không trả về dữ liệu.';
  }
  return redactConnectionSecrets(reason, config);
}

/**
 * Executes an arbitrary SQL script through remote SQLcl over SSH.
 */
async function runSqlclScriptOverSsh(
  config: OracleToolConfig,
  sqlScript: string,
  db: TaskPlannerDatabase = defaultDb,
  callId?: string
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

  // Every heavy tool passes the model tool-call id to Rust so cancel only needs that id.
  // Settings/test callers without a model call get a nonce id for symmetry.
  const taskId = callId ?? `oracle-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return await execRemoteCommand(targetSsh, remoteCommand, secret ?? undefined, taskId);
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
  db: TaskPlannerDatabase = defaultDb,
  callId?: string
): Promise<string> {
  const startTime = Date.now();

  // Quick cz2: enable/disable lives on the aiTeams row, not the shared connection config.
  // Execution here only checks that the connection is configured; payload gating is in chatTurnTools.
  const profiles = await getOracleConnectionProfiles(db);
  if (!profiles.length) {
    return JSON.stringify({
      success: false,
      error:
        'Oracle AI Tool chưa được cấu hình. Vui lòng chọn máy chủ SSH và chuỗi kết nối trong Cài đặt hoặc Hộp công cụ AI Chat.',
    } satisfies Partial<OracleToolExecutionResult>);
  }

  let config: OracleToolConfig;
  try {
    config = resolveOracleConnection(profiles, args);
  } catch (err: any) {
    return JSON.stringify({
      success: false,
      error: err?.message || 'Không tìm thấy kết nối Oracle phù hợp.',
    } satisfies Partial<OracleToolExecutionResult>);
  }
  if (!config.sshConfigId || !config.connectionString) {
    return JSON.stringify({
      success: false,
      error: 'Kết nối Oracle đã chọn chưa được cấu hình đầy đủ (SSH hoặc connection string).',
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

      const res = await runSqlclScriptOverSsh(config, script, db, callId);
      const executionTimeMs = Date.now() - startTime;
      const oracleError = extractOracleError(res.stdout, res.stderr);
      const remoteFailure = detectRemoteFailure(res, config);

      if (oracleError || remoteFailure) {
        return JSON.stringify({
          success: false,
          action: 'explain',
          error: oracleError ?? remoteFailure ?? 'Lỗi thực thi SQLcl không xác định.',
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

    const res = await runSqlclScriptOverSsh(config, script, db, callId);
    const executionTimeMs = Date.now() - startTime;
    const oracleError = extractOracleError(res.stdout, res.stderr);
    const remoteFailure = detectRemoteFailure(res, config);

    if (oracleError || remoteFailure) {
      return JSON.stringify({
        success: false,
        action: 'query',
        error: oracleError ?? remoteFailure ?? 'Lỗi thực thi SQLcl không xác định.',
        executionTimeMs,
        executedSql: limitedSql,
      } satisfies OracleToolExecutionResult);
    }

    const parsedJson = extractJsonFromSqlclOutput(res.stdout);
    const isArray = Array.isArray(parsedJson);
    const rowCount = isArray
      ? (parsedJson as unknown[]).length
      : parsedJson && typeof parsedJson === 'object' && 'results' in parsedJson
        ? (parsedJson as any).results?.reduce(
            (sum: number, group: any) => sum + (Array.isArray(group?.items) ? group.items.length : 0),
            0
          ) ?? 0
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
  db: TaskPlannerDatabase = defaultDb,
  callId?: string
): Promise<string> {
  const startTime = Date.now();

  // Quick cz2: enable/disable lives on the aiTeams row, not the shared connection config.
  const profiles = await getOracleConnectionProfiles(db);
  if (!profiles.length) {
    return JSON.stringify({
      success: false,
      error: 'Oracle AI Tool chưa được cấu hình. Vui lòng chọn máy chủ SSH và chuỗi kết nối trong Cài đặt hoặc Hộp công cụ AI Chat.',
    });
  }

  let config: OracleToolConfig;
  try {
    config = resolveOracleConnection(profiles, args);
  } catch (err: any) {
    return JSON.stringify({
      success: false,
      error: err?.message || 'Không tìm thấy kết nối Oracle phù hợp.',
    });
  }
  if (!config.sshConfigId || !config.connectionString) {
    return JSON.stringify({
      success: false,
      error: 'Kết nối Oracle đã chọn chưa được cấu hình đầy đủ (SSH hoặc connection string).',
    });
  }

  try {
    const action = args.action;

    if (action === 'list_tables') {
      // WR-03: schema is an identifier (strict validation); search is free text embedded in a
      // LIKE literal (quote-escaped). An invalid identifier is thrown and caught below, which
      // returns the JSON { success:false, error } path before any SSH script is built or sent.
      const schema = args.schema?.trim() ? safeOracleIdentifier(args.schema, 'Tên schema') : '';
      const search = args.search?.trim()
        ? escapeOracleLikeFilter(args.search.trim().toUpperCase())
        : '';

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

      const res = await runSqlclScriptOverSsh(config, script, db, callId);
      const executionTimeMs = Date.now() - startTime;
      const oracleError = extractOracleError(res.stdout, res.stderr);
      const remoteFailure = detectRemoteFailure(res, config);
      if (oracleError || remoteFailure) {
        return JSON.stringify({ success: false, action, error: oracleError ?? remoteFailure ?? 'Lỗi thực thi SQLcl không xác định.', executionTimeMs });
      }

      return JSON.stringify({
        success: true,
        action,
        data: extractJsonFromSqlclOutput(res.stdout),
        executionTimeMs,
      });
    }

    if (action === 'describe_table') {
      if (!args.tableOrView?.trim()) {
        return JSON.stringify({ success: false, error: 'Cần cung cấp tên bảng tableOrView.' });
      }
      // WR-03: validate both identifiers before interpolation; a throw is caught below and
      // returned via the JSON { success:false, error } path, never reaching the SSH script.
      const tableName = safeOracleIdentifier(args.tableOrView, 'Tên bảng');
      const schema = args.schema?.trim() ? safeOracleIdentifier(args.schema, 'Tên schema') : '';
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

      const res = await runSqlclScriptOverSsh(config, script, db, callId);
      const executionTimeMs = Date.now() - startTime;
      const oracleError = extractOracleError(res.stdout, res.stderr);
      const remoteFailure = detectRemoteFailure(res, config);
      if (oracleError || remoteFailure) {
        return JSON.stringify({ success: false, action, error: oracleError ?? remoteFailure ?? 'Lỗi thực thi SQLcl không xác định.', executionTimeMs });
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
      if (!args.tableOrView?.trim()) {
        return JSON.stringify({ success: false, error: 'Cần cung cấp tên bảng tableOrView.' });
      }
      // WR-03: validate both identifiers before interpolation; a throw is caught below and
      // returned via the JSON { success:false, error } path, never reaching the SSH script.
      const tableName = safeOracleIdentifier(args.tableOrView, 'Tên bảng');
      const schema = args.schema?.trim() ? safeOracleIdentifier(args.schema, 'Tên schema') : '';
      const schemaExpr = schema ? `'${schema}'` : 'USER';

      const script = `
SET LONG 200000;
SET PAGESIZE 0;
SET FEEDBACK OFF;
SET LINESIZE 32767;
SET HEADING OFF;
SET TRANSACTION READ ONLY;
SELECT DBMS_METADATA.GET_DDL('TABLE', '${tableName}', ${schemaExpr}) FROM DUAL;
EXIT;
      `.trim();

      const res = await runSqlclScriptOverSsh(config, script, db, callId);
      const executionTimeMs = Date.now() - startTime;
      const oracleError = extractOracleError(res.stdout, res.stderr);
      const remoteFailure = detectRemoteFailure(res, config);
      if (oracleError || remoteFailure) {
        return JSON.stringify({ success: false, action, error: oracleError ?? remoteFailure ?? 'Lỗi thực thi SQLcl không xác định.', executionTimeMs });
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
