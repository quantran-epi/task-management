import {
  AI_DATABASE_TOOLS,
  type AiToolDefinition,
  isMutationTool,
  normalizeToolName,
} from './aiTools';
import { isReadOnlyMcpTool } from './mcpClient';

/**
 * D-12: the DB read tools an employee may call. Team-scoped tools
 * (`search_team_history`, `read_team_turn`, `read_skill`) are appended by the
 * coordinator from `TEAM_TOOL_DEFINITIONS` — they are not `AI_DATABASE_TOOLS`
 * members. `delegate_batch` is lead-only (Pitfall 10: no nested batches).
 */
export const EMPLOYEE_READ_ONLY_ALLOWLIST: readonly string[] = [
  'query_tasks',
  'query_change_requests',
  'query_systems',
  'query_notes',
  'query_worklogs',
  'get_item_details',
  'get_active_timer',
  'get_daily_schedule',
  'check_capacity_feasibility',
  'get_day_insight',
  'get_analytics_summary',
  'query_attention_items',
  'query_recurring_tasks',
  'get_system_status',
  'search_knowledge_base',
  'read_file',
];

/**
 * D-27: the lead's DB read set plus the linked-item tools and `delegate_batch`.
 *
 * WR-03: `get_item_details` is deliberately excluded. It returns raw task `description` /
 * `notes` / `checklist[].text` and raw sticky-note bodies, so advertising it to the lead let
 * the one agent holding mutation tools reach unwrapped user text directly and made the two
 * read paths disagree. `get_linked_context` is the lead's item read — it applies the
 * untrusted-data boundary once.
 */
export const LEAD_TOOL_ALLOWLIST: readonly string[] = [
  ...EMPLOYEE_READ_ONLY_ALLOWLIST.filter((name) => name !== 'get_item_details'),
  'list_linked_items',
  'get_linked_context',
  'delegate_batch',
];

/** Single guard so a payload assertion lives in one place. */
export function payloadHasMutationTool(tools: readonly AiToolDefinition[]): boolean {
  return tools.some((tool) => isMutationTool(tool.function.name));
}

/**
 * Tool set for a single chat turn. In ordinary chat Analysis Mode no longer strips
 * mutation DB tools: the runtime parks every mutation for explicit user approval, so
 * read-only is a prompt preference rather than a hard block. Dynamic MCP tools stay
 * read-only in Analysis Mode (their approval path is not wired). An explicit allowlist
 * (an explicit allowlist) keeps its read-only payload. Studio artifact tools require an explicit
 * allowlist; other omitted-list behavior stays unchanged.
 */
export function getToolsForTurn(
  effectiveAnalysisMode: boolean,
  dynamicMcpTools: AiToolDefinition[] = [],
  allowedToolNames?: readonly string[]
): AiToolDefinition[] {
  const allowed = allowedToolNames === undefined
    ? undefined
    : new Set(allowedToolNames.map(normalizeToolName));
  return [
    ...AI_DATABASE_TOOLS.filter((tool) =>
      (!allowed || allowed.has(normalizeToolName(tool.function.name))) &&
      (allowed !== undefined || !['get_artifact', 'patch_artifact_section'].includes(normalizeToolName(tool.function.name))) &&
      // ponytail: mutation tools stay in the ordinary-chat payload (approval card guards them);
      // an explicit allowlist keeps its read-only-by-default contract.
      (!effectiveAnalysisMode || allowed === undefined || !isMutationTool(normalizeToolName(tool.function.name)))),
    ...dynamicMcpTools.filter((tool) =>
      (!allowed || allowed.has(normalizeToolName(tool.function.name))) &&
      (!(effectiveAnalysisMode || allowed) || isReadOnlyMcpTool(normalizeToolName(tool.function.name)))),
  ];
}
