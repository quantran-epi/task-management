export interface OracleToolConfig {
  enabled: boolean;
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
  /** Command timeout in seconds (default: 30) */
  timeoutSeconds?: number;
  /** Last tested timestamp ISO string */
  lastTestedAt?: string;
  /** Last test status message */
  lastTestStatus?: string;
}

export const ORACLE_TOOL_CONFIG_KEY = 'oracle_ai_tool_config';

export interface OracleQueryArgs {
  /** The SQL query (must be SELECT or WITH ... SELECT) */
  query: string;
  /** Max rows to return (default: config.maxRows or 100, max: 1000) */
  limit?: number;
  /** If true, returns the EXPLAIN PLAN rather than query execution */
  explain?: boolean;
}

export type OracleDescribeAction = 'list_tables' | 'describe_table' | 'get_ddl';

export interface OracleDescribeArgs {
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
