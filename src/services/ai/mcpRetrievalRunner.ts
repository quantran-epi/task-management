import type { TaskPlannerDatabase } from '../../db';
import { db as defaultDb } from '../../db';
import {
  getMcpServers,
  fetchServerTools,
  executeDynamicMcpTool,
  type McpServerConfig,
} from './mcpClient';
import { completeJson } from './nineRouterClient';

export interface McpRetrievedItem {
  serverId: string;
  serverName: string;
  toolName: string;
  args: Record<string, unknown>;
  rawResult: string;
  timestamp: string;
}

export interface RunMcpRetrievalInput {
  query: string;
  serverIds: readonly string[];
  signal?: AbortSignal;
  db?: TaskPlannerDatabase;
  modelConfig?: {
    endpoint: string;
    apiKey: string;
    model: string;
  };
}

export interface McpRetrievalResult {
  items: McpRetrievedItem[];
  warnings: string[];
}

const MCP_RETRIEVAL_TIMEOUT_MS = 20_000;
const MAX_RETRIEVAL_TURNS = 4;

interface ToolSelectionPlan {
  done: boolean;
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
  }>;
}

/**
 * Prunes heavy and noisy fields from raw MCP tool output before saving into evidence pack or context.
 */
export function pruneMcpRawResult(raw: string, maxChars = 2500): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    const cleanObject = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.slice(0, 15).map(cleanObject);
      }
      if (obj !== null && typeof obj === 'object') {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(obj)) {
          // Drop embedding vectors, binary buffers, or heavy internal graph metadata
          if (
            k.includes('embedding') ||
            k.includes('vector') ||
            k === 'raw_chunks' ||
            k === 'buffer' ||
            k === 'visualCoordinates'
          ) {
            continue;
          }
          out[k] = cleanObject(v);
        }
        return out;
      }
      return obj;
    };
    const pruned = JSON.stringify(cleanObject(parsed));
    return pruned.length > maxChars ? `${pruned.slice(0, maxChars)}... (truncated)` : pruned;
  } catch {
    return raw.length > maxChars ? `${raw.slice(0, maxChars)}... (truncated)` : raw;
  }
}

/**
 * Runs a bounded dynamic tool-calling retrieval loop (max 3 turns, 15s budget)
 * targeting the specified MCP server IDs.
 */
export async function runMcpRetrieval(
  input: RunMcpRetrievalInput
): Promise<McpRetrievalResult> {
  const items: McpRetrievedItem[] = [];
  const warnings: string[] = [];
  const database = input.db ?? defaultDb;

  if (!input.serverIds || input.serverIds.length === 0) {
    return { items, warnings };
  }

  // 15-second bounded budget
  const timeoutController = new AbortController();
  const timer = setTimeout(() => {
    timeoutController.abort(new Error('MCP retrieval timed out after 15s'));
  }, MCP_RETRIEVAL_TIMEOUT_MS);

  // Combine parent signal + timeout signal
  const onParentAbort = () => {
    timeoutController.abort(input.signal?.reason ?? new Error('Aborted by caller'));
  };

  if (input.signal?.aborted) {
    clearTimeout(timer);
    return {
      items,
      warnings: ['Thao tác MCP bị hủy'],
    };
  }

  input.signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    const servers: McpServerConfig[] = await getMcpServers(database);
    const targetServers = servers.filter(
      (s) => s.enabled && input.serverIds.includes(s.id)
    );

    if (targetServers.length === 0) {
      warnings.push(`Không tìm thấy máy chủ MCP nào đang bật trong danh sách: ${input.serverIds.join(', ')}`);
      return { items, warnings };
    }

    // Discover tools available on target servers
    const availableTools: Array<{
      serverId: string;
      serverName: string;
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }> = [];

    for (const server of targetServers) {
      if (timeoutController.signal.aborted) break;
      try {
        const tools = await fetchServerTools(server);
        for (const t of tools) {
          availableTools.push({
            serverId: server.id,
            serverName: server.name,
            name: t.function.name,
            description: t.function.description,
            parameters: (t.function.parameters as Record<string, unknown>) ?? {},
          });
        }
      } catch (err: any) {
        warnings.push(`Lỗi khám phá công cụ trên "${server.name}": ${err?.message || String(err)}`);
      }
    }

    if (availableTools.length === 0) {
      return { items, warnings };
    }

    // If modelConfig is not provided, cannot plan calls dynamically
    if (!input.modelConfig) {
      warnings.push('Chưa cấu hình mô hình AI để điều phối gọi công cụ MCP');
      return { items, warnings };
    }

    // Dynamic bounded tool loop (max 3 turns)
    const executedToolKeys = new Set<string>();
    const conversationHistory: string[] = [
      `User query: "${input.query}"`,
      `Target MCP servers: ${targetServers.map((s) => s.name).join(', ')}`,
    ];

    for (let turn = 1; turn <= MAX_RETRIEVAL_TURNS; turn++) {
      if (timeoutController.signal.aborted) {
        warnings.push('Quá thời gian chờ phản hồi MCP (15s timeout)');
        break;
      }

      const toolsSummary = availableTools
        .map(
          (t) =>
            `- [${t.serverName}] ${t.name}: ${t.description.slice(0, 300)} (schema: ${JSON.stringify(t.parameters)})`
        )
        .join('\n');

      const systemPrompt = `You are an intelligent, domain-agnostic dynamic tool-calling retriever. Select relevant read-only tools to fetch live data answering the user query.
Turn ${turn} of max ${MAX_RETRIEVAL_TURNS}.

Available Tools:
${toolsSummary}

DYNAMIC MCP RETRIEVAL RULES:
1. CHECK INFORMATION DEPTH (Granularity Rule):
   - If the user asks for fine-grained details (such as specific fields, columns, attributes, parameters, enum values, error codes, or formulas) but the data retrieved so far only contains high-level container objects (such as table/file/document/entity names without property-level details):
   - DO NOT set "done": true.
   - You MUST pick the next inspection/detail tool provided in the server's tool list to drill down into that container entity.
2. COMPLETION CRITERIA:
   - Set "done": true ONLY when:
     a) The specific attribute/field answering the query has been found in the tool results, OR
     b) All available detail/inspection tools for the relevant entity have been exhausted.

Return STRICT JSON adhering to this schema:
{
  "done": boolean, // set to true ONLY if sufficient fine-grained data has been retrieved or no further relevant inspection tool exists
  "toolCalls": [
    {
      "toolName": string,
      "args": object
    }
  ]
}`;

      let plan: ToolSelectionPlan | null = null;
      try {
        const rawPlan = await completeJson({
          endpoint: input.modelConfig.endpoint,
          apiKey: input.modelConfig.apiKey,
          model: input.modelConfig.model,
          temperature: 0,
          maxTokens: 1000,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Progress so far:\n${conversationHistory.join('\n\n')}\n\nWhat tool should be called next? If enough data, set done: true.`,
            },
          ],
          signal: timeoutController.signal,
        });

        plan = rawPlan as ToolSelectionPlan;
      } catch (err: any) {
        if (timeoutController.signal.aborted) {
          warnings.push('Quá thời gian chờ phản hồi MCP (15s timeout)');
          break;
        }
        warnings.push(`Lỗi lập lịch công cụ MCP (turn ${turn}): ${err?.message || String(err)}`);
        break;
      }

      if (!plan || plan.done || !plan.toolCalls || plan.toolCalls.length === 0) {
        // Model signaled completion
        break;
      }

      // Execute planned tools (up to 2 calls per turn)
      let executedAnyInTurn = false;
      for (const call of plan.toolCalls.slice(0, 2)) {
        if (timeoutController.signal.aborted) break;

        const callKey = `${call.toolName}:${JSON.stringify(call.args ?? {})}`;
        if (executedToolKeys.has(callKey)) {
          // Avoid duplicate call loop
          continue;
        }
        executedToolKeys.add(callKey);

        const toolMeta = availableTools.find((t) => t.name === call.toolName);
        const serverId = toolMeta?.serverId ?? targetServers[0]!.id;
        const serverName = toolMeta?.serverName ?? targetServers[0]!.name;

        try {
          const rawResult = await executeDynamicMcpTool(call.toolName, call.args ?? {}, database);
          const cleanResult = pruneMcpRawResult(rawResult);
          executedAnyInTurn = true;
          items.push({
            serverId,
            serverName,
            toolName: call.toolName,
            args: call.args ?? {},
            rawResult: cleanResult,
            timestamp: new Date().toISOString(),
          });
          conversationHistory.push(
            `Called ${call.toolName}(${JSON.stringify(call.args)}):\nResult: ${cleanResult.slice(0, 1500)}`
          );
        } catch (err: any) {
          warnings.push(`Lỗi thực thi công cụ "${call.toolName}": ${err?.message || String(err)}`);
          conversationHistory.push(`Called ${call.toolName} failed: ${err?.message || String(err)}`);
        }
      }

      if (!executedAnyInTurn) {
        break;
      }
    }
  } catch (err: any) {
    warnings.push(`Lỗi quy trình MCP retrieval: ${err?.message || String(err)}`);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onParentAbort);
  }

  return { items, warnings };
}
