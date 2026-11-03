import {
  AI_DATABASE_TOOLS,
  type AiToolDefinition,
  isMutationTool,
  normalizeToolName,
} from './aiTools';
import { isReadOnlyMcpTool } from './mcpClient';

/**
 * Tool set for a single chat turn. Analysis Mode keeps only non-mutation DB tools
 * plus read-only MCP tools. An explicit allowlist also restricts dynamic tools to
 * read-only capabilities, even when Analysis Mode is off. Omitted list preserves legacy behavior.
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
      (!effectiveAnalysisMode || !isMutationTool(normalizeToolName(tool.function.name)))),
    ...dynamicMcpTools.filter((tool) =>
      (!allowed || allowed.has(normalizeToolName(tool.function.name))) &&
      (!(effectiveAnalysisMode || allowed) || isReadOnlyMcpTool(normalizeToolName(tool.function.name)))),
  ];
}
