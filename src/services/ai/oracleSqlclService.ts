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
  type OracleQueryResult,
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
 * SQLcl directive tokens that must never appear at the start of a command line. SQLcl reads
 * these even after a semicolon, so `SELECT 1; HOST rm -rf ...` is not a harmless suffix.
 * The check runs on comment/string-stripped text so a directive hidden in a comment or
 * literal cannot smuggle a second command past the guard.
 */
const SQLCL_DIRECTIVE_PATTERN =
  /^\s*(SET|EXIT|HOST|SPOOL|PROMPT|DEFINE|CONNECT|CONN|CONNECT\/|@|@@|\/|!|COLUMN|COL|BREAK|COMPUTE|TTITLE|BTITLE|REPHEADER|REPFOOTER|ACCEPT|PAUSE|WHENEVER|SHOW|DESCRIBE|DESC|LIST|APPEND|CHANGE|DEL|INPUT|RUN|EXECUTE|EXEC|PASSWORD|PASSWD|DISCONNECT|STORE|GET|SAVE|START|SCRIPT|VARIABLE|VAR|PRINT|UNDEFINE|EDIT|ED|HELP)\b|^\s*(?:@|@@|\/|!)/i;

/** Allowed OBJECT_TYPE values for the Database Explorer, mapped to DBMS_METADATA.GET_DDL. */
export const ORACLE_OBJECT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  TABLE: 'TABLE',
  VIEW: 'VIEW',
  'MATERIALIZED VIEW': 'MATERIALIZED_VIEW',
  PACKAGE: 'PACKAGE',
  'PACKAGE BODY': 'PACKAGE_BODY',
  PROCEDURE: 'PROCEDURE',
  FUNCTION: 'FUNCTION',
  TRIGGER: 'TRIGGER',
  SEQUENCE: 'SEQUENCE',
  SYNONYM: 'SYNONYM',
  TYPE: 'TYPE',
  'TYPE BODY': 'TYPE_BODY',
  INDEX: 'INDEX',
});

/** Object types whose source lives in ALL_SOURCE (the rest expose DDL via DBMS_METADATA). */
const SOURCE_OBJECT_TYPES = new Set([
  'PACKAGE',
  'PACKAGE BODY',
  'PROCEDURE',
  'FUNCTION',
  'TRIGGER',
  'TYPE',
  'TYPE BODY',
]);

/** Whitelist an Oracle OBJECT_TYPE before it reaches a SQL literal or GET_DDL call. */
export function assertOracleObjectType(value: string | undefined, label = 'Loại đối tượng'): string {
  const normalized = (value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!ORACLE_OBJECT_TYPES[normalized]) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return normalized;
}

/**
 * Guardrail: exactly one SQL statement, with at most one optional trailing semicolon.
 * Rejects SQLcl client directives (including ones after `;`) and any extra statement text.
 * Call before assertReadOnlyQuery / applyQueryLimit so a second statement can never be built
 * into the script sent over SSH.
 */
export function assertSqlclSingleStatement(sql: string): string {
  const stripped = stripCommentsAndLiterals(sql);
  if (!stripped) throw new Error('Câu lệnh SQL rỗng.');

  for (const line of stripped.split(/\r?\n/)) {
    if (SQLCL_DIRECTIVE_PATTERN.test(line)) {
      const token = line.trim().split(/\s+/)[0] ?? '?';
      throw new Error(`Bị từ chối: directive SQLcl '${token}' không được phép trong truy vấn.`);
    }
  }

  // Strip a single trailing semicolon; any semicolon left belongs to a second statement.
  const withoutTrailing = stripped.replace(/;\s*$/, '').trim();
  if (withoutTrailing.includes(';')) {
    throw new Error('Bị từ chối: chỉ cho phép một câu lệnh SQL duy nhất.');
  }

  return withoutTrailing;
}

/**
 * Accepts a plain unquoted identifier or a strictly quoted one. Never allows an escaped quote
 * inside the quoted form — `HR."X" UNION...` and `HR."A""B"` are both rejected. The returned
 * value is a single normalized token safe for literal interpolation, never a SQL fragment.
 */
export function safeOracleObjectIdentifier(value: string | undefined, label: string): string {
  const raw = (value ?? '').trim();
  if (!raw || raw.includes("'") || raw.includes(';') || raw.includes('--')) {
    throw new Error(`${label} không hợp lệ.`);
  }
  const parts = raw.split('.');
  if (parts.length > 2) throw new Error(`${label} không hợp lệ.`);
  const normalized = parts.map((part) => {
    const token = part.trim();
    if (/^"[A-Za-z][A-Za-z0-9_$#]*"$/.test(token)) return token;
    if (token.includes('"')) throw new Error(`${label} không hợp lệ.`);
    return safeOracleIdentifier(token, label);
  });
  return normalized.join('.');
}

/** True when the object type stores its body in ALL_SOURCE rather than DBMS_METADATA. */
export function isOracleSourceObjectType(objectType: string): boolean {
  return SOURCE_OBJECT_TYPES.has(assertOracleObjectType(objectType));
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

/** SQLcl JSON comes as an array of row objects, or as `{ results: [{ items: [...] }] }`. */
export function extractGridRows(parsed: unknown): Record<string, unknown>[] {
  const asItems = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value)
      ? value.filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object')
      : [];
  if (Array.isArray(parsed)) return asItems(parsed);
  if (parsed && typeof parsed === 'object' && 'results' in parsed) {
    const groups = (parsed as { results?: unknown }).results;
    return Array.isArray(groups)
      ? groups.flatMap((group: any) => asItems(group?.items))
      : [];
  }
  return [];
}

/** Derive stable column names from the first row, falling back to a finite key union. */
function gridColumns(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const row of rows.slice(0, 50)) for (const key of Object.keys(row)) keys.add(key);
  return [...keys];
}

/** Ceiling applied to both the AI JSON envelope and the UI grid to bound memory. */
const MAX_QUERY_ROWS = 1000;
const MAX_CELL_CHARS = 2000;
const MAX_UI_PAYLOAD_CHARS = 500_000;

function capCell(value: unknown): unknown {
  if (typeof value === 'string' && value.length > MAX_CELL_CHARS) {
    return `${value.slice(0, MAX_CELL_CHARS)}…`;
  }
  if (value && typeof value === 'object') {
    // Objects stringify beyond the cell cap; keep a bounded representation.
    const text = JSON.stringify(value);
    return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}…` : value;
  }
  return value;
}

/** Build a typed, capped `{columns, rows}` grid from SQLcl's JSON payload. */
export function buildOracleGrid(parsed: unknown): {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
} {
  const sourceRows = extractGridRows(parsed);
  const columns = gridColumns(sourceRows);
  const kept = sourceRows.slice(0, MAX_QUERY_ROWS);
  const rows = kept.map((row) => columns.map((col) => capCell(row[col])));
  let truncated = sourceRows.length > kept.length;
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    const size = rows[i]!.reduce<number>((sum, cell) => sum + String(cell ?? '').length, 0);
    if (total + size > MAX_UI_PAYLOAD_CHARS) {
      rows.length = i;
      truncated = true;
      break;
    }
    total += size;
  }
  return { columns, rows, rowCount: sourceRows.length, truncated };
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
export function redactOracleText(message: string, config: OracleToolConfig): string {
  let out = message || '';
  const cs = config.connectionString?.trim();
  if (!cs) return out;

  // Full string first (covers `user/pass@host:1521/service` and any connect descriptor),
  // then the bare password component, which shells/errors often echo on its own.
  out = out.split(cs).join('***');
  const atIdx = cs.indexOf('@');
  const beforeAt = atIdx >= 0 ? cs.slice(0, atIdx) : cs;
  const slashIdx = beforeAt.indexOf('/');
  const password = slashIdx >= 0 ? beforeAt.slice(slashIdx + 1) : '';
  if (password) {
    out = out.split(password).join('***');
    // Even when only a fragment like `pass@host` is echoed, mask the token after `/`.
    out = out.replace(/(\/)[^/@\s'"]+(?=@)/g, '$1***');
  }
  return out;
}

const redactConnectionSecrets = redactOracleText;

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
  const emptyGrid = { columns: [], rows: [] };

  const profiles = await getOracleConnectionProfiles(db);
  if (!profiles.length) {
    return JSON.stringify({
      success: false,
      error:
        'Oracle AI Tool chưa được cấu hình. Vui lòng chọn máy chủ SSH và chuỗi kết nối trong Cài đặt hoặc Hộp công cụ AI Chat.',
      ...emptyGrid,
    } satisfies OracleQueryResult);
  }

  let config: OracleToolConfig = DEFAULT_ORACLE_CONFIG;
  try {
    config = resolveOracleConnection(profiles, args);
  } catch (err: any) {
    return JSON.stringify({
      success: false,
      error: redactOracleText(err?.message || 'Không tìm thấy kết nối Oracle phù hợp.', config),
      ...emptyGrid,
    } satisfies OracleQueryResult);
  }
  if (!config.sshConfigId || !config.connectionString) {
    return JSON.stringify({
      success: false,
      error: 'Kết nối Oracle đã chọn chưa được cấu hình đầy đủ (SSH hoặc connection string).',
      ...emptyGrid,
    } satisfies OracleQueryResult);
  }

  try {
    const query = args.query?.trim();
    if (!query) {
      return JSON.stringify({
        success: false,
        error: 'Vui lòng cung cấp câu truy vấn query.',
        ...emptyGrid,
      } satisfies OracleQueryResult);
    }

    // Single-statement first: a directive or second statement must fail before any script
    // is built, never after the read-only check has blessed only the first statement.
    const singleSql = assertSqlclSingleStatement(query);
    assertReadOnlyQuery(singleSql);

    const limit = args.limit || config.maxRows || 100;

    if (args.explain) {
      const script = `
SET PAGESIZE 0;
SET FEEDBACK OFF;
SET LINESIZE 200;
SET TRANSACTION READ ONLY;
EXPLAIN PLAN FOR ${singleSql};
SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY());
EXIT;
      `.trim();

      const res = await runSqlclScriptOverSsh(config, script, db, callId);
      const executionTimeMs = Date.now() - startTime;
      const oracleError = extractOracleError(
        redactOracleText(res.stdout, config),
        redactOracleText(res.stderr, config)
      );
      const remoteFailure = detectRemoteFailure(res, config);

      if (oracleError || remoteFailure) {
        return JSON.stringify({
          success: false,
          action: 'explain',
          error: oracleError ?? remoteFailure ?? 'Lỗi thực thi SQLcl không xác định.',
          executionTimeMs,
          ...emptyGrid,
        } satisfies OracleQueryResult);
      }

      return JSON.stringify({
        success: true,
        action: 'explain',
        data: redactOracleText(res.stdout.trim(), config),
        executionTimeMs,
        executedSql: singleSql,
        ...emptyGrid,
      } satisfies OracleQueryResult);
    }

    const limitedSql = applyQueryLimit(singleSql, limit);
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
    const stdout = redactOracleText(res.stdout, config);
    const oracleError = extractOracleError(stdout, redactOracleText(res.stderr, config));
    const remoteFailure = detectRemoteFailure(res, config);

    if (oracleError || remoteFailure) {
      return JSON.stringify({
        success: false,
        action: 'query',
        error: oracleError ?? remoteFailure ?? 'Lỗi thực thi SQLcl không xác định.',
        executionTimeMs,
        executedSql: limitedSql,
        ...emptyGrid,
      } satisfies OracleQueryResult);
    }

    const parsedJson = extractJsonFromSqlclOutput(stdout);
    const grid = buildOracleGrid(parsedJson);

    // Keep the legacy AI envelope shape: SQLcl normally emits a row array; for the
    // `{results:[{items:[]}]}` variant preserve that shape after a string cap.
    const capEnvelope = (value: unknown): unknown => {
      const text = JSON.stringify(value) ?? '';
      if (text.length <= 60000) return value;
      if (Array.isArray(value)) return value.slice(0, Math.max(1, Math.floor(limit / 2)));
      return text.slice(0, 60000);
    };
    const cappedData = Array.isArray(parsedJson)
      ? grid.rows.map((cells) =>
          Object.fromEntries(grid.columns.map((col, idx) => [col, cells[idx]]))
        )
      : capEnvelope(parsedJson);

    return JSON.stringify({
      success: true,
      action: 'query',
      rowCount: grid.rowCount,
      data: cappedData,
      columns: grid.columns,
      rows: grid.rows,
      truncated: grid.truncated,
      executionTimeMs,
      executedSql: limitedSql,
    } satisfies OracleQueryResult);
  } catch (err: any) {
    const executionTimeMs = Date.now() - startTime;
    return JSON.stringify({
      success: false,
      action: 'query',
      error: redactOracleText(err?.message || 'Lỗi thực thi Oracle SQLcl', config),
      executionTimeMs,
      ...emptyGrid,
    } satisfies OracleQueryResult);
  }
}

/**
 * Inspects database metadata (list tables, describe columns, constraints, or get DDL).
 */
/** Standard read-only/format preamble for every metadata script. */
const METADATA_PREAMBLE = `
SET SQLFORMAT JSON;
SET FEEDBACK OFF;
SET PAGESIZE 0;
SET LINESIZE 32767;
SET TRIMSPOOL ON;
SET LONG 200000;
SET TRANSACTION READ ONLY;`.trim();

const SYSTEM_SCHEMAS = `('SYS', 'SYSTEM', 'MDSYS', 'CTXSYS', 'XDB', 'WMSYS', 'LBACSYS', 'DVSYS', 'GSMADMIN_INTERNAL', 'AUDSYS', 'OUTLN', 'ORDSYS', 'ORDDATA', 'WMSYS', 'APPQOSSYS', 'DBSNMP', 'ORACLE_OCM', 'XS$NULL')`;

/** Numeric clamp for metadata pagination — UI never supplies an arbitrary OFFSET/FETCH. */
function clampMetadataPage(args: OracleDescribeArgs): { offset: number; pageSize: number } {
  const offset = Number.isFinite(args.pageOffset) ? Math.max(0, Math.floor(args.pageOffset!)) : 0;
  const pageSize = Number.isFinite(args.pageSize)
    ? Math.min(200, Math.max(1, Math.floor(args.pageSize!)))
    : 200;
  return { offset, pageSize };
}

/** Build a read-only metadata SELECT with a validated, numerically-clamped page window. */
function buildMetadataQuery(select: string, args: OracleDescribeArgs): string {
  const { offset, pageSize } = clampMetadataPage(args);
  // +1 row tells the UI whether a "load more" is available; the extra row never leaves the DB.
  return `${select}\nOFFSET ${offset} ROWS FETCH NEXT ${pageSize + 1} ROWS ONLY;`;
}

const MAX_METADATA_TEXT = 200_000;

/**
 * Inspects database metadata (list tables, describe columns, get DDL, plus the
 * Database Explorer actions). Every identifier/type is whitelisted before a script is built.
 */
export async function executeOracleDescribe(
  args: OracleDescribeArgs,
  db: TaskPlannerDatabase = defaultDb,
  callId?: string
): Promise<string> {
  const startTime = Date.now();

  const profiles = await getOracleConnectionProfiles(db);
  if (!profiles.length) {
    return JSON.stringify({
      success: false,
      error:
        'Oracle AI Tool chưa được cấu hình. Vui lòng chọn máy chủ SSH và chuỗi kết nối trong Cài đặt hoặc Hộp công cụ AI Chat.',
    } satisfies OracleToolExecutionResult);
  }

  let config: OracleToolConfig = DEFAULT_ORACLE_CONFIG;
  try {
    config = resolveOracleConnection(profiles, args);
  } catch (err: any) {
    return JSON.stringify({
      success: false,
      error: redactOracleText(err?.message || 'Không tìm thấy kết nối Oracle phù hợp.', DEFAULT_ORACLE_CONFIG),
    } satisfies OracleToolExecutionResult);
  }
  if (!config.sshConfigId || !config.connectionString) {
    return JSON.stringify({
      success: false,
      error: 'Kết nối Oracle đã chọn chưa được cấu hình đầy đủ (SSH hoặc connection string).',
    } satisfies OracleToolExecutionResult);
  }

  /** Shared script runner: redaction, ORA-/SP2- detection and remote failure in one place. */
  const run = async (script: string): Promise<{ stdout: string; error: string | null }> => {
    const res = await runSqlclScriptOverSsh(config, script, db, callId);
    const stdout = redactOracleText(res.stdout, config);
    const oracleError = extractOracleError(stdout, redactOracleText(res.stderr, config));
    const remoteFailure = detectRemoteFailure(res, config);
    return { stdout, error: oracleError ?? remoteFailure ?? null };
  };

  const fail = (action: string, error: string): string =>
    JSON.stringify({ success: false, action: (action || 'describe_table') as NonNullable<OracleToolExecutionResult['action']>, error, executionTimeMs: Date.now() - startTime } satisfies OracleToolExecutionResult);

  try {
    const action = args.action;

    // --- Legacy actions: output shape kept byte-compatible for existing AI/tool tests. ---
    if (action === 'list_tables') {
      const schema = args.schema?.trim() ? safeOracleIdentifier(args.schema, 'Tên schema') : '';
      const search = args.search?.trim()
        ? escapeOracleLikeFilter(args.search.trim().toUpperCase())
        : '';
      const schemaFilter = schema ? `AND OWNER = '${schema}'` : '';
      const searchFilter = search
        ? `AND (UPPER(TABLE_NAME) LIKE '%${search}%' OR UPPER(COMMENTS) LIKE '%${search}%')`
        : '';
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
WHERE t.OWNER NOT IN ${SYSTEM_SCHEMAS}
  ${schemaFilter}
  ${searchFilter}
ORDER BY t.OWNER, t.TABLE_NAME
FETCH FIRST 100 ROWS ONLY;
EXIT;
      `.trim();

      const { stdout, error } = await run(script);
      if (error) return fail(action, error);
      return JSON.stringify({
        success: true,
        action,
        data: extractJsonFromSqlclOutput(stdout),
        executionTimeMs: Date.now() - startTime,
      } satisfies OracleToolExecutionResult);
    }

    if (action === 'describe_table' || action === 'describe_object') {
      const rawName = action === 'describe_table' ? args.tableOrView : args.objectName ?? args.tableOrView;
      if (!rawName?.trim()) return fail(action, 'Cần cung cấp tên đối tượng.');
      const name = safeOracleObjectIdentifier(rawName, 'Tên đối tượng');
      const schema = args.schema?.trim() ? safeOracleObjectIdentifier(args.schema, 'Tên schema') : '';
      const objectType = action === 'describe_object'
        ? assertOracleObjectType(args.objectType)
        : undefined;
      const schemaFilter = schema ? `AND c.OWNER = '${schema}'` : '';
      const nameLiteral = name.includes('.') ? name.split('.').at(-1)! : name;
      const ownerLiteral = name.includes('.') ? name.split('.')[0]! : schema;

      // Non-tabular PL/SQL objects expose arguments via ALL_ARGUMENTS instead of ALL_TAB_COLS.
      const isCodeObject = objectType ? !['TABLE', 'VIEW', 'MATERIALIZED VIEW'].includes(objectType) : false;
      const ownerArgFilter = ownerLiteral ? `AND a.OWNER = '${ownerLiteral}'` : '';
      const select = isCodeObject
        ? `SELECT a.OBJECT_NAME, a.PACKAGE_NAME, a.ARGUMENT_NAME, a.DATA_TYPE, a.IN_OUT, a.POSITION, a.DEFAULT_VALUE
FROM ALL_ARGUMENTS a
WHERE a.OBJECT_NAME = '${nameLiteral}'
  ${ownerArgFilter}
  AND NVL(a.PACKAGE_NAME, ' ') = ' '
ORDER BY a.OVERLOAD, a.POSITION`
        : `SELECT
    c.OWNER,
    c.TABLE_NAME AS OBJECT_NAME,
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
WHERE c.TABLE_NAME = '${nameLiteral}'
  ${schemaFilter}
ORDER BY c.COLUMN_ID`;

      const script = `${METADATA_PREAMBLE}\n${buildMetadataQuery(select, args)}\nEXIT;`.trim();
      const { stdout, error } = await run(script);
      if (error) return fail(action, error);
      const parsed = extractJsonFromSqlclOutput(stdout);
      const items = extractGridRows(parsed).slice(0, 200);
      return JSON.stringify({
        success: true,
        action,
        table: nameLiteral,
        schema: ownerLiteral,
        ...(objectType ? { objectType } : {}),
        columns: items,
        rowCount: items.length,
        executionTimeMs: Date.now() - startTime,
      } satisfies OracleToolExecutionResult);
    }

    if (action === 'get_ddl' || action === 'list_objects' || action === 'get_object_source') {
      const rawName = args.objectName ?? args.tableOrView;
      if (action !== 'list_objects' && !rawName?.trim()) {
        return fail(action, 'Cần cung cấp tên đối tượng.');
      }
      // list_objects filters by schema only; a name is optional and never a SQL fragment.
      if (action === 'list_objects' && args.schema?.trim() && /[^A-Za-z0-9_$#]/.test(args.schema.trim())) {
        return fail(action, 'Tên schema không hợp lệ.');
      }
      const name = rawName?.trim() ? safeOracleObjectIdentifier(rawName, 'Tên đối tượng') : '';
      const nameLiteral = name.includes('.') ? name.split('.').at(-1)! : name;
      const ownerLiteral = name.includes('.') ? name.split('.')[0]! : args.schema?.trim()
        ? safeOracleObjectIdentifier(args.schema, 'Tên schema')
        : undefined;
      const schemaExpr = ownerLiteral ? `'${ownerLiteral}'` : 'USER';

      if (action === 'get_object_source') {
        const objectType = assertOracleObjectType(args.objectType);
        if (!isOracleSourceObjectType(objectType)) {
          return fail(action, 'Loại đối tượng này không có source trong ALL_SOURCE.');
        }
        const select = `SELECT LINE, TEXT
FROM ALL_SOURCE
WHERE OWNER = ${schemaExpr} AND NAME = '${nameLiteral}' AND TYPE = '${ORACLE_OBJECT_TYPES[objectType]}'
ORDER BY LINE`;
        const script = `${METADATA_PREAMBLE}\n${select}\nFETCH FIRST 5000 ROWS ONLY;\nEXIT;`.trim();
        const { stdout, error } = await run(script);
        if (error) return fail(action, error);
        const items = extractGridRows(extractJsonFromSqlclOutput(stdout)).slice(0, 5000);
        const full = items.map((row) => String(row.TEXT ?? '')).join('\n');
        const truncated = full.length > MAX_METADATA_TEXT;
        return JSON.stringify({
          success: true,
          action,
          source: truncated ? full.slice(0, MAX_METADATA_TEXT) : full,
          rowCount: items.length,
          truncated,
          executionTimeMs: Date.now() - startTime,
        } satisfies OracleToolExecutionResult);
      }

      if (action === 'list_objects') {
        const objectType = assertOracleObjectType(args.objectType);
        const search = args.search?.trim()
          ? escapeOracleLikeFilter(args.search.trim().toUpperCase())
          : '';
        const ownerFilter = ownerLiteral ? `AND OWNER = '${ownerLiteral}'` : '';
        const searchFilter = search ? `AND UPPER(OBJECT_NAME) LIKE '%${search}%'` : '';
        const select = `SELECT OWNER, OBJECT_NAME, OBJECT_TYPE, STATUS, CREATED, LAST_DDL_TIME
FROM ALL_OBJECTS
WHERE OWNER NOT IN ${SYSTEM_SCHEMAS}
  AND OBJECT_TYPE = '${objectType}'
  ${ownerFilter}
  ${searchFilter}
ORDER BY OWNER, OBJECT_NAME`;
        const script = `${METADATA_PREAMBLE}\n${buildMetadataQuery(select, args)}\nEXIT;`.trim();
        const { stdout, error } = await run(script);
        if (error) return fail(action, error);
        const { offset, pageSize } = clampMetadataPage(args);
        const all = extractGridRows(extractJsonFromSqlclOutput(stdout));
        const hasMore = all.length > pageSize;
        return JSON.stringify({
          success: true,
          action,
          data: all.slice(0, pageSize),
          hasMore,
          offset: offset + Math.min(pageSize, all.length),
          executionTimeMs: Date.now() - startTime,
        } satisfies OracleToolExecutionResult);
      }

      // get_ddl — legacy TABLE/VIEW calls stay on the exact previous payload fields.
      const objectType = args.objectType
        ? assertOracleObjectType(args.objectType)
        : 'TABLE';
      const mapped = ORACLE_OBJECT_TYPES[objectType]!;
      const script = `${METADATA_PREAMBLE}
SELECT DBMS_METADATA.GET_DDL('${mapped}', '${nameLiteral}', ${schemaExpr}) AS DDL FROM DUAL;
EXIT;`.trim();
      const { stdout, error } = await run(script);
      if (error) return fail(action, error);
      const ddlText = redactOracleText(stdout.trim(), config);
      const truncated = ddlText.length > MAX_METADATA_TEXT;
      const payload: OracleToolExecutionResult = {
        success: true,
        action,
        table: nameLiteral,
        ddl: truncated ? ddlText.slice(0, MAX_METADATA_TEXT) : ddlText,
        truncated,
        executionTimeMs: Date.now() - startTime,
      };
      if (action !== 'get_ddl') {
        payload.objectType = objectType;
      }
      return JSON.stringify(payload);
    }

    if (action === 'list_schemas') {
      const search = args.search?.trim()
        ? escapeOracleLikeFilter(args.search.trim().toUpperCase())
        : '';
      const searchFilter = search ? `AND USERNAME LIKE '%${search}%'` : '';
      const select = `SELECT USERNAME, CREATED
FROM ALL_USERS
WHERE USERNAME NOT IN ${SYSTEM_SCHEMAS}
  ${searchFilter}
ORDER BY USERNAME`;
      const script = `${METADATA_PREAMBLE}\n${buildMetadataQuery(select, args)}\nEXIT;`.trim();
      const { stdout, error } = await run(script);
      if (error) return fail(action, error);
      const all = extractGridRows(extractJsonFromSqlclOutput(stdout));
      const { pageSize } = clampMetadataPage(args);
      return JSON.stringify({
        success: true,
        action,
        data: all.slice(0, pageSize),
        hasMore: all.length > pageSize,
        executionTimeMs: Date.now() - startTime,
      } satisfies OracleToolExecutionResult);
    }

    return fail(action, `Hành động không hỗ trợ: ${action}`);
  } catch (err: any) {
    return fail(args.action, redactOracleText(err?.message || 'Lỗi khi kiểm tra metadata Oracle', config));
  }
}
