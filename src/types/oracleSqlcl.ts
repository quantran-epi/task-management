export interface OracleToolConfig {
  /** Fixed SSH configuration ID to execute sqlcl on the remote jump host */
  sshConfigId: string;
  /** Oracle connection identifier, e.g. 'user/password@host:port/service' or 'user/pass@TNS_ALIAS' */
  connectionString: string;
  /** Executable path or command on remote machine (default: 'sql') */
  sqlclPath?: string;
  /** Optional shell environment exports prior to invoking sqlcl (e.g. 'export TNS_ADMIN=/opt/oracle/network/admin') */
  envVars?: string;
  /** Max rows returned by query (default: 100, max: 1000) */
  maxRows?: number;
  /** Last tested timestamp ISO string */
  lastTestedAt?: string;
  /** Last test status message */
  lastTestStatus?: string;
}

export const ORACLE_TOOL_CONFIG_KEY = 'oracle_ai_tool_config';

/**
 * A named Oracle SQLcl connection profile. Each profile keeps every legacy connection
 * field plus a stable id, a display name, an environment label and an active flag.
 */
export interface OracleConnectionProfile extends OracleToolConfig {
  /** Stable client-generated UUID — never changes when the profile is renamed or reordered */
  id: string;
  /** Human-readable name used by the model as a selector */
  name: string;
  /** Environment label (SIT, UAT, PROD, ...) used by the model as a selector */
  environment: string;
  /** Exactly one non-empty profile list has this flag set; the active default for tool calls */
  isActive: boolean;
}

/** Single settings row holding the profile list (secrets stay client-side via backup denylist). */
export interface OracleToolConfigList {
  profiles: OracleConnectionProfile[];
}

export const ORACLE_TOOL_CONFIG_LIST_KEY = 'oracle_ai_tool_config_list';

/** Optional selector accepted by both read tools. Resolution: id -> name/env -> active. */
export interface OracleConnectionSelector {
  connectionId?: string;
  name?: string;
  environment?: string;
}

/** Safe metadata advertised by oracle_list_connections — never a connection string. */
export interface OracleConnectionSummary {
  id: string;
  name: string;
  environment: string;
  isActive: boolean;
}

export interface OracleQueryArgs extends OracleConnectionSelector {
  /** The SQL query (must be SELECT or WITH ... SELECT) */
  query: string;
  /** Max rows to return (default: config.maxRows or 100, max: 1000) */
  limit?: number;
  /** If true, returns the EXPLAIN PLAN rather than query execution */
  explain?: boolean;
}

export type OracleDescribeAction = 'list_tables' | 'describe_table' | 'get_ddl';

export interface OracleDescribeArgs extends OracleConnectionSelector {
  /** Action: list_tables (summary of tables), describe_table (columns, types, constraints), get_ddl (full DDL) */
  action: OracleDescribeAction;
  /** Table or view name (required for describe_table and get_ddl) */
  tableOrView?: string;
  /** Optional schema/owner name */
  schema?: string;
  /** Optional search filter for list_tables */
  search?: string;
}

export interface OracleToolExecutionResult {
  success: boolean;
  action: 'query' | 'explain' | 'list_tables' | 'describe_table' | 'get_ddl';
  data?: unknown;
  rowCount?: number;
  executionTimeMs?: number;
  truncated?: boolean;
  error?: string;
  executedSql?: string;
}
