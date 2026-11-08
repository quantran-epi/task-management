import {
  AI_DATABASE_TOOLS,
  type AiToolDefinition,
  isMutationTool,
  normalizeToolName,
} from './aiTools';
import { isReadOnlyMcpTool } from './mcpClient';

/**
 * Tool set for a single chat turn. In ordinary chat Analysis Mode no longer strips
 * mutation DB tools: the runtime parks every mutation for explicit user approval, so
 * read-only is a prompt preference rather than a hard block. Dynamic MCP tools stay
 * read-only in Analysis Mode (their approval path is not wired). An explicit allowlist
 * (SDLC step chat) keeps its read-only payload. Studio artifact tools require an explicit
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
      (allowed !== undefined || !['get_artifact', 'patch_artifact_section', 'propose_subsystems', 'propose_research'].includes(normalizeToolName(tool.function.name))) &&
      // ponytail: mutation tools stay in the ordinary-chat payload (approval card guards them);
      // an explicit allowlist (SDLC step chat) keeps its read-only-by-default contract.
      (!effectiveAnalysisMode || allowed === undefined || !isMutationTool(normalizeToolName(tool.function.name)))),
    ...dynamicMcpTools.filter((tool) =>
      (!allowed || allowed.has(normalizeToolName(tool.function.name))) &&
      (!(effectiveAnalysisMode || allowed) || isReadOnlyMcpTool(normalizeToolName(tool.function.name)))),
  ];
}
