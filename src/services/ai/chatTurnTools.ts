import {
  AI_DATABASE_TOOLS,
  type AiToolDefinition,
  isMutationTool,
  normalizeToolName,
} from './aiTools';
import { isReadOnlyMcpTool } from './mcpClient';

/**
 * Tool set for a single chat turn. Analysis Mode keeps only non-mutation DB tools
 * plus read-only MCP tools; every other turn gets the full set.
 */
export function getToolsForTurn(
  effectiveAnalysisMode: boolean,
  dynamicMcpTools: AiToolDefinition[] = []
): AiToolDefinition[] {
  if (effectiveAnalysisMode) {
    return [
      ...AI_DATABASE_TOOLS.filter((tool) => !isMutationTool(normalizeToolName(tool.function.name))),
      ...dynamicMcpTools.filter((tool) => isReadOnlyMcpTool(normalizeToolName(tool.function.name))),
    ];
  }
  return [...AI_DATABASE_TOOLS, ...dynamicMcpTools];
}
