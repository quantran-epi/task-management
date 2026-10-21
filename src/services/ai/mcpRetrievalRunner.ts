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

const MCP_RETRIEVAL_TIMEOUT_MS = 300_000; // 5-minute safety watchdog
const MAX_RETRIEVAL_TURNS = 4;
const MAX_SERVER_INSTRUCTION_CHARS = 4000;

interface ToolSelectionPlan {
  done: boolean;
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
  }>;
}

/**
 * Adaptively wraps flat arguments if the tool's schema expects an enclosing object
 * (such as {"request": {...}} or {"params": {...}}).
 */
export function adaptToolArguments(
  toolParameters: Record<string, unknown> | undefined,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return args;
  }
  if (!toolParameters || typeof toolParameters !== 'object') {
    return args;
  }

  const properties = (toolParameters.properties as Record<string, any>) || {};
  const propKeys = Object.keys(properties);

  // If schema expects exactly 1 top-level property of type 'object' or '$ref' (e.g. 'request' or 'params')
  // and args does not already contain this key, wrap args into that key.
  if (propKeys.length === 1) {
    const singleKey = propKeys[0]!;
    if (!(singleKey in args)) {
      const propDef = properties[singleKey];
      if (
        propDef &&
        (propDef.type === 'object' || propDef.$ref || propDef.title || propDef.description)
      ) {
        return { [singleKey]: args };
      }
    }
  }

  return args;
}

/**
 * Formats a node or entity from graph memory into a concise, readable bullet point.
 */
function formatGraphEntity(node: Record<string, any>): string {
  const name = node.name || node.title || node.id || 'Unnamed';
  const type = (Array.isArray(node.labels) ? node.labels.join('/') : null) || node.entity_type || node.type || '';
  const summary = node.summary || node.description || '';

  // Try extracting column type, table or other essential attributes if present
  let attrSummary = '';
  if (node.attributes) {
    try {
      const attrs = typeof node.attributes === 'string' ? JSON.parse(node.attributes) : node.attributes;
      const parts: string[] = [];
      if (attrs.database_qualified_name && attrs.database_qualified_name !== name) {
        parts.push(`qual: ${attrs.database_qualified_name}`);
      }
      if (attrs.description_normalized && attrs.description_normalized !== summary) {
        parts.push(attrs.description_normalized);
      }
      if (parts.length > 0) {
        attrSummary = ` [${parts.join('; ')}]`;
      }
    } catch {
      // Ignore attribute parse error
    }
  }

  const typePrefix = type ? `[${type}] ` : '';
  const descPart = summary ? `: ${summary}` : '';
  return `- ${typePrefix}${name}${descPart}${attrSummary}`;
}

/**
 * Prunes heavy and noisy fields from raw MCP tool output before saving into evidence pack or context.
 * If output contains a list of graph nodes/entities, formats them as concise Markdown lines.
 */
export function pruneMcpRawResult(raw: string, maxChars = 1200): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);

    // Check if response contains graph nodes/entities (e.g. search_nodes, list_nodes)
    const candidateList =
      (Array.isArray(parsed?.nodes) && parsed.nodes) ||
      (Array.isArray(parsed?.entities) && parsed.entities) ||
      (Array.isArray(parsed?.items) && parsed.items) ||
      (Array.isArray(parsed) && parsed) ||
      null;

    if (candidateList && candidateList.length > 0 && typeof candidateList[0] === 'object' && candidateList[0] !== null) {
      const formattedLines = candidateList
        .slice(0, 25)
        .map((item: any) => formatGraphEntity(item))
        .filter((line: string) => line.trim().length > 0);

      if (formattedLines.length > 0) {
        const header = parsed.message ? `${parsed.message}:\n` : '';
        const joined = `${header}${formattedLines.join('\n')}`;
        return joined.length > maxChars ? `${joined.slice(0, maxChars)}...\n(truncated)` : joined;
      }
    }

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
 * Runs a bounded dynamic tool-calling retrieval loop (max 4 turns, 5m safety watchdog)
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

  // 5-minute safety watchdog
  let watchdogFired = false;
  const timeoutController = new AbortController();
  const timer = setTimeout(() => {
    watchdogFired = true;
    timeoutController.abort(new Error('MCP retrieval safety watchdog expired after 5m'));
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

    // Dynamic bounded tool loop (max 4 turns)
    const executedToolKeys = new Set<string>();
    const conversationHistory: string[] = [
      `User query: "${input.query}"`,
      `Target MCP servers: ${targetServers.map((s) => s.name).join(', ')}`,
    ];

    for (let turn = 1; turn <= MAX_RETRIEVAL_TURNS; turn++) {
      if (input.signal?.aborted) {
        warnings.push('Thao tác MCP bị hủy');
        break;
      }
      if (watchdogFired) {
        warnings.push('Quá thời gian chờ phản hồi MCP (5m safety watchdog)');
        break;
      }

      const serverInstructions = targetServers
        .filter((s) => typeof s.instruction === 'string' && s.instruction.trim().length > 0)
        .map((s) => {
          const trimmed = s.instruction!.trim();
          const bounded =
            trimmed.length > MAX_SERVER_INSTRUCTION_CHARS
              ? `${trimmed.slice(0, MAX_SERVER_INSTRUCTION_CHARS)}... (truncated)`
              : trimmed;
          return `- [${s.name} (id: ${s.id})]:\n${bounded}`;
        })
        .join('\n\n');

      const toolsSummary = availableTools
        .map(
          (t) =>
            `- [${t.serverName}] ${t.name}: ${t.description.slice(0, 300)} (schema: ${JSON.stringify(t.parameters)})`
        )
        .join('\n');

      const systemPrompt = `You are an intelligent, domain-agnostic dynamic tool-calling retriever. Select relevant read-only tools to fetch live data answering the user query.
Turn ${turn} of max ${MAX_RETRIEVAL_TURNS}.

Target Server Instructions:
${serverInstructions || 'None provided.'}

Available Tools:
${toolsSummary}

DYNAMIC MCP RETRIEVAL RULES:
1. TARGET SERVER INSTRUCTIONS & SCHEMAS:
   - Adhere strictly to the instructions and JSON schemas provided above by the target servers.
   - If a tool requires arguments produced by another prerequisite tool (such as identifiers, session keys, scopes, or categories), you MUST call only the prerequisite tool in the current turn, inspect its output, and defer calling the dependent tool to a subsequent turn.
   - Do NOT invent or guess required schema arguments.
2. SCHEMA CONFORMANCE:
   - Carefully inspect each tool's schema properties. If the schema expects arguments inside a wrapper object property (such as 'request'), you MUST provide that wrapper key in 'args' (e.g. {"request": {...}}).
3. CHECK INFORMATION DEPTH (Granularity Rule):
   - If the user asks for fine-grained details (such as specific fields, columns, attributes, parameters, enum values, error codes, or formulas) but the data retrieved so far only contains high-level container objects (such as table/file/document/entity names without property-level details):
   - DO NOT set "done": true.
   - You MUST pick the next inspection/detail tool provided in the server's tool list to drill down into that container entity.
4. COMPLETION CRITERIA:
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
        if (input.signal?.aborted) {
          warnings.push('Thao tác MCP bị hủy');
          break;
        }
        if (watchdogFired) {
          warnings.push('Quá thời gian chờ phản hồi MCP (5m safety watchdog)');
          break;
        }
        warnings.push(`Lỗi lập lịch công cụ MCP (turn ${turn}): ${err?.message || String(err)}`);
        break;
      }

      if (!plan || !plan.toolCalls || plan.toolCalls.length === 0) {
        // Model signaled completion with no calls
        break;
      }

      // Execute planned tools (up to 2 calls per turn)
      let attemptedAnyInTurn = false;
      for (const call of plan.toolCalls.slice(0, 2)) {
        if (input.signal?.aborted) {
          warnings.push('Thao tác MCP bị hủy');
          break;
        }

        const callKey = `${call.toolName}:${JSON.stringify(call.args ?? {})}`;
        if (executedToolKeys.has(callKey)) {
          // Avoid duplicate call loop
          continue;
        }
        executedToolKeys.add(callKey);
        attemptedAnyInTurn = true;

        const toolMeta = availableTools.find((t) => t.name === call.toolName);
        const serverId = toolMeta?.serverId ?? targetServers[0]!.id;
        const serverName = toolMeta?.serverName ?? targetServers[0]!.name;

        const effectiveArgs = adaptToolArguments(toolMeta?.parameters, call.args ?? {});

        try {
          const rawResult = await executeDynamicMcpTool(call.toolName, effectiveArgs, database);
          const cleanResult = pruneMcpRawResult(rawResult);
          items.push({
            serverId,
            serverName,
            toolName: call.toolName,
            args: effectiveArgs,
            rawResult: cleanResult,
            timestamp: new Date().toISOString(),
          });
          conversationHistory.push(
            `Called ${call.toolName}(${JSON.stringify(effectiveArgs)}):\nResult: ${cleanResult.slice(0, 1500)}`
          );
        } catch (err: any) {
          warnings.push(`Lỗi thực thi công cụ "${call.toolName}": ${err?.message || String(err)}`);
          conversationHistory.push(`Called ${call.toolName} failed: ${err?.message || String(err)}`);
        }
      }

      if (plan.done || !attemptedAnyInTurn) {
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
