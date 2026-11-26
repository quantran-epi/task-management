import type { TaskPlannerDatabase } from '../../db';
import {
  AI_DATABASE_TOOLS,
  SSH_READ_TOOLS,
  ORACLE_READ_TOOLS,
  type AiToolDefinition,
  isMutationTool,
  normalizeToolName,
} from '../ai/aiTools';
import { getGatedAddenda } from '../ai/chatTurnTools';
import { CHAT_HISTORY_TOOL_NAMES, CHAT_HISTORY_TOOL_DEFINITIONS } from '../ai/chatHistoryTools';
import {
  discoverAllMcpTools,
  discoverGatedMcpTools,
  discoverGraphitiSqlMcpTools,
  invalidateMcpDiscovery,
} from '../ai/mcpClient';
import { getOracleToolConfig } from '../ai/oracleSqlclService';
import { getSshFsToolConfig } from '../ai/sshFsToolService';
import type { TelegramDataScope } from './telegramTypes';

const ARTIFACT_TOOL_NAMES = new Set(['generate_image', 'generate_pptx']);

/**
 * Telegram-only tool set for the shared `runAiOrchestratorLoop`.
 *
 * Purity note: every capability read is passed in by the worker so unit tests can pin the
 * exact advertised payload without a live MCP server. The DB read is only for connection
 * settings and MCP server rows; no tool is executed here.
 */
export interface TelegramTurnToolOptions {
  db: TaskPlannerDatabase;
  dataScope: TelegramDataScope;
  sshConfigReady: boolean;
  oracleConfigReady: boolean;
  discoverTools?: (db: TaskPlannerDatabase) => Promise<AiToolDefinition[]>;
}

function dedupeByName(tools: AiToolDefinition[]): AiToolDefinition[] {
  const seen = new Set<string>();
  return tools.filter((tool) => {
    const name = normalizeToolName(tool.function.name);
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

export async function buildTelegramTurnTools(
  options: TelegramTurnToolOptions
): Promise<AiToolDefinition[]> {
  const {
    db,
    dataScope,
    sshConfigReady,
    oracleConfigReady,
    discoverTools = discoverAllMcpTools,
  } = options;

  if (dataScope === 'pure_llm') return [];

  const gatedAddenda = getGatedAddenda({ sshConfigReady, oracleConfigReady });
  const enabledNames = new Set(gatedAddenda.map((t) => normalizeToolName(t.function.name)));
  const disabledNames = new Set(
    [...SSH_READ_TOOLS, ...ORACLE_READ_TOOLS]
      .map((t) => normalizeToolName(t.function.name))
      .filter((name) => !enabledNames.has(name))
  );

  let tools = AI_DATABASE_TOOLS.filter((tool) => {
    const name = normalizeToolName(tool.function.name);
    // Artifact generation is part of the panel's Analysis Mode contract. `generate_file` is
    // classified as a mutation (it runs model-authored JavaScript) and stays blocked on a
    // headless Telegram turn; `generate_pptx` and `generate_image` are safe to advertise.
    const artifactAllowed = ARTIFACT_TOOL_NAMES.has(name);
    if (!artifactAllowed && isMutationTool(tool.function.name)) return false;
    return !disabledNames.has(name);
  });

  if (dataScope === 'tasks_only') {
    tools = tools.filter(
      (t) =>
        t.function.name !== 'query_notes' &&
        t.function.name !== 'search_knowledge_base' &&
        t.function.name !== 'get_document_details' &&
        t.function.name !== 'get_document_backlinks'
    );
  }

  if (dataScope === 'full' || dataScope === 'knowledge_only') {
    invalidateMcpDiscovery();
    let dynamicTools: AiToolDefinition[] = [];
    try {
      dynamicTools = await discoverGraphitiSqlMcpTools(db);
    } catch (err) {
      console.warn('[telegramChatTurnTools] Graphiti discovery unavailable:', err);
    }
    try {
      dynamicTools = [...dynamicTools, ...(await discoverGatedMcpTools(db)), ...(await discoverTools(db))];
    } catch (err) {
      console.warn('[telegramChatTurnTools] MCP discovery unavailable:', err);
    }
    // A headless turn never has an approval UI; execution still enforces the read-only gate
    // inside `executeDynamicMcpTool`. Keep the advertised set aligned with the panel/Phoenix
    // parity contract — every discovered tool is visible to the model even when a particular
    // server marks it write-capable, and the refusal is returned as a tool result.
    tools = [...tools, ...dynamicTools];
  }

  // Telegram keeps its own durable transcript in `telegramSessionLogs`. The chat-history tool
  // family is only advertised once the worker has bound a per-chat thread and installed the
  // Telegram-backed executor; otherwise the shared dispatcher would read an empty thread.
  return dedupeByName(tools).filter((tool) => !CHAT_HISTORY_TOOL_NAMES.has(normalizeToolName(tool.function.name)));
}

export function withTelegramTranscriptTools(tools: AiToolDefinition[]): AiToolDefinition[] {
  return dedupeByName([...tools, ...CHAT_HISTORY_TOOL_DEFINITIONS]);
}

export async function readTelegramToolConfig(
  db: TaskPlannerDatabase
): Promise<{ sshConfigReady: boolean; oracleConfigReady: boolean }> {
  const [oracleCfg, sshCfg] = await Promise.all([
    getOracleToolConfig(db).catch(() => null),
    getSshFsToolConfig(db).catch(() => null),
  ]);
  return {
    sshConfigReady: Boolean(sshCfg?.sshConfigId),
    oracleConfigReady: Boolean(oracleCfg?.sshConfigId && oracleCfg?.connectionString),
  };
}
