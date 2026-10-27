import { z } from 'zod';
import type { TaskPlannerDatabase } from '../../db';
import { db as defaultDb } from '../../db';
import {
  getMcpServers,
  fetchServerTools,
  executeDynamicMcpTool,
  type McpServerConfig,
} from './mcpClient';
import { completeJson } from './nineRouterClient';
import {
  applyPaginationArg,
  extractPaginationHint,
  formatRecordsForPlanner,
  normalizeMcpEvidence,
  type McpEvidenceRecord,
  type McpNormalizationStats,
} from './mcpEvidence';

export interface McpRetrievedItem {
  serverId: string;
  serverName: string;
  toolName: string;
  args: Record<string, unknown>;
  rawResult: string;
  timestamp: string;
  /** Page index for this call (0 = first), used for diagnostics only. */
  page?: number;
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
  /** Normalized atomic evidence built from every full tool result. */
  records: McpEvidenceRecord[];
  normalization: McpNormalizationStats;
  /** complete = every requested page was fetched; partial = a safety cap was hit. */
  completeness: 'complete' | 'partial';
  pagesFetched: number;
  pagesCapped: boolean;
}

const MCP_RETRIEVAL_TIMEOUT_MS = 300_000; // 5-minute safety watchdog
/** Safety valve only: the loop normally ends when a turn adds no new evidence. */
const MAX_RETRIEVAL_TURNS_SAFETY_VALVE = 12;
const MAX_SERVER_INSTRUCTION_CHARS = 4000;
/** Safety valve only: pagination stops here and completeness becomes 'partial'. */
const MAX_PAGES_PER_CALL = 20;

const ToolSelectionPlanSchema = z.looseObject({
  done: z.boolean(),
  toolCalls: z
    .array(
      z.looseObject({
        toolName: z.string().min(1),
        args: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .optional(),
});

type ToolSelectionPlan = z.infer<typeof ToolSelectionPlanSchema>;

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
 * Runs a dynamic tool-calling retrieval loop that stops when it stops learning:
 * two consecutive turns with no new evidence end it, with a 12-turn safety valve
 * and a 5m watchdog, targeting the specified MCP server IDs.
 */
export async function runMcpRetrieval(
  input: RunMcpRetrievalInput
): Promise<McpRetrievalResult> {
  const items: McpRetrievedItem[] = [];
  const warnings: string[] = [];
  const database = input.db ?? defaultDb;
  let pagesFetched = 0;
  let pagesCapped = false;
  let stopReason:
    | 'final'
    | 'turn_cap'
    | 'watchdog'
    | 'abort'
    | 'error'
    | 'novelty_exhausted'
    | null = null;
  const knownRecordIds = new Set<string>();
  let consecutiveZeroNoveltyTurns = 0;

  const finish = (): McpRetrievalResult => {
    const { records, stats } = normalizeMcpEvidence(
      items,
      items.map((item) => item.page ?? 0)
    );
    return {
      items,
      warnings,
      records,
      normalization: stats,
      completeness:
        pagesCapped || stopReason === 'turn_cap' || stopReason === 'watchdog'
          ? 'partial'
          : 'complete',
      pagesFetched,
      pagesCapped,
    };
  };

  if (!input.serverIds || input.serverIds.length === 0) {
    return finish();
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
    warnings.push('Thao tác MCP bị hủy');
    return finish();
  }

  input.signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    const servers: McpServerConfig[] = await getMcpServers(database);
    const targetServers = servers.filter(
      (s) => s.enabled && input.serverIds.includes(s.id)
    );

    if (targetServers.length === 0) {
      warnings.push(`Không tìm thấy máy chủ MCP nào đang bật trong danh sách: ${input.serverIds.join(', ')}`);
      return finish();
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
      return finish();
    }

    // If modelConfig is not provided, cannot plan calls dynamically
    if (!input.modelConfig) {
      warnings.push('Chưa cấu hình mô hình AI để điều phối gọi công cụ MCP');
      return finish();
    }

    // Dynamic tool loop: novelty-terminated, with a turn safety valve.
    const executedToolKeys = new Set<string>();
    const conversationHistory: string[] = [
      `User query: "${input.query}"`,
      `Target MCP servers: ${targetServers.map((s) => s.name).join(', ')}`,
    ];

    for (let turn = 1; turn <= MAX_RETRIEVAL_TURNS_SAFETY_VALVE; turn++) {
      if (input.signal?.aborted) {
        stopReason = 'abort';
        warnings.push('Thao tác MCP bị hủy');
        break;
      }
      if (watchdogFired) {
        stopReason = 'watchdog';
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

      // Full descriptions and schemas: the planner — not static code — decides the
      // tool and its structured filters, so it must see exact parameter contracts.
      const toolsSummary = availableTools
        .map(
          (t) =>
            `- [${t.serverName}] ${t.name}: ${t.description} (schema: ${JSON.stringify(t.parameters)})`
        )
        .join('\n');

      const systemPrompt = `You are an intelligent, domain-agnostic dynamic tool-calling retriever. Select relevant read-only tools to fetch live data answering the user query.
Turn ${turn} of max ${MAX_RETRIEVAL_TURNS_SAFETY_VALVE}.

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
4. REVERSE LOOKUP (Where-Is-It-Stored Rule):
   - When the user asks WHERE some data lives (e.g. "which field/table stores X", "where is X kept"), the answer is the owning container, not the detail objects that merely resemble the wording.
   - Detail entities (columns/fields/attributes) far outnumber containers and dominate any mixed-type search, so a mixed search hides the owning container.
   - If results so far are only detail entities, you MUST run one more search scoped to the container entity types ONLY (e.g. entity_types: ["Table"]). Reuse the user's own phrasing or the natural-language question words — do NOT shorten it to a bare keyword, which favours detail names.
   - DO NOT set "done": true while no container entity has been retrieved.
5. COMPLETION CRITERIA:
   - Set "done": true ONLY when:
     a) The specific attribute/field answering the query has been found in the tool results, OR
     b) All available detail/inspection tools for the relevant entity have been exhausted, AND
     c) If the query asks where data is stored, at least one container entity has been retrieved.

Return STRICT JSON adhering to this schema:
{
  "done": boolean, // set to true ONLY when the criteria in rule 5 are met
  "toolCalls": [
    {
      "toolName": string,
      "args": object
    }
  ]
}`;

      let plan: ToolSelectionPlan | null = null;
      try {
        // Planner is validated before any tool executes; malformed plans end the turn.
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

        const parsedPlan = ToolSelectionPlanSchema.safeParse(rawPlan);
        plan = parsedPlan.success ? parsedPlan.data : null;
      } catch (err: any) {
        if (input.signal?.aborted) {
          stopReason = 'abort';
          warnings.push('Thao tác MCP bị hủy');
          break;
        }
        if (watchdogFired) {
          stopReason = 'watchdog';
          warnings.push('Quá thời gian chờ phản hồi MCP (5m safety watchdog)');
          break;
        }
        stopReason = 'error';
        warnings.push(`Lỗi lập lịch công cụ MCP (turn ${turn}): ${err?.message || String(err)}`);
        break;
      }

      if (!plan || !plan.toolCalls || plan.toolCalls.length === 0) {
        // Model signaled completion with no calls
        stopReason = 'final';
        break;
      }

      // Execute planned tools (up to 2 calls per turn)
      let attemptedAnyInTurn = false;
      for (const call of plan.toolCalls.slice(0, 2)) {
        if (input.signal?.aborted) {
          stopReason = 'abort';
          warnings.push('Thao tác MCP bị hủy');
          break;
        }

        const toolMeta = availableTools.find((t) => t.name === call.toolName);
        if (!toolMeta) {
          // Unknown tool is never executed; the planner sees the rejection next turn.
          const rejected = `Unknown tool "${call.toolName}" is not available; pick one from the tool list.`;
          warnings.push(rejected);
          conversationHistory.push(`Called ${call.toolName} rejected: ${rejected}`);
          continue;
        }

        const callKey = `${toolMeta.serverId}:${call.toolName}:${JSON.stringify(call.args ?? {})}`;
        if (executedToolKeys.has(callKey)) {
          // Avoid duplicate call loop
          continue;
        }
        executedToolKeys.add(callKey);
        attemptedAnyInTurn = true;

        const effectiveArgs = adaptToolArguments(toolMeta.parameters, call.args ?? {});
        const { serverId, serverName } = toolMeta;
        const callItems: McpRetrievedItem[] = [];

        // Deterministic pagination: follow the tool's own continuation without an LLM turn.
        let pageArgs = effectiveArgs;
        let lastApplied: string | number | undefined;
        for (let page = 0; page < MAX_PAGES_PER_CALL; page++) {
          // A batch already planned is still executed; the watchdog only stops extra pages.
          if (input.signal?.aborted || (watchdogFired && page > 0)) break;
          try {
            const rawResult = await executeDynamicMcpTool(
              call.toolName,
              pageArgs,
              database,
              { serverId }
            );
            const item: McpRetrievedItem = {
              serverId,
              serverName,
              toolName: call.toolName,
              args: pageArgs,
              rawResult,
              timestamp: new Date().toISOString(),
              page,
            };
            items.push(item);
            callItems.push(item);
            pagesFetched += 1;

            let parsed: unknown;
            try {
              parsed = JSON.parse(rawResult);
            } catch {
              break; // Non-JSON payload cannot expose a continuation.
            }
            const hint = extractPaginationHint(parsed);
            if (!hint) break;
            if (page + 1 >= MAX_PAGES_PER_CALL) {
              pagesCapped = true;
              warnings.push(
                `Công cụ "${call.toolName}" còn trang chưa lấy (đã đạt giới hạn ${MAX_PAGES_PER_CALL} trang)`
              );
              break;
            }
            const next = hint.nextCursor ?? hint.nextOffset;
            if (next === undefined) break;
            if (next === lastApplied) break; // did not advance — stop instead of looping
            lastApplied = next;
            pageArgs = applyPaginationArg(pageArgs, hint.offsetField, next);
          } catch (err: any) {
            warnings.push(`Lỗi thực thi công cụ "${call.toolName}": ${err?.message || String(err)}`);
            conversationHistory.push(`Called ${call.toolName} failed: ${err?.message || String(err)}`);
            break;
          }
        }

        conversationHistory.push(
          `Called ${call.toolName}(${JSON.stringify(effectiveArgs)}):\n${formatRecordsForPlanner(
            normalizeMcpEvidence(callItems).records
          )}`
        );
      }

      // Novelty once per turn: only evidence never seen before counts as learning.
      const turnRecords = normalizeMcpEvidence(items).records;
      let novelThisTurn = 0;
      for (const record of turnRecords) {
        if (!knownRecordIds.has(record.recordId)) novelThisTurn += 1;
        knownRecordIds.add(record.recordId);
      }
      consecutiveZeroNoveltyTurns =
        novelThisTurn === 0 ? consecutiveZeroNoveltyTurns + 1 : 0;

      if (plan.done || !attemptedAnyInTurn) {
        stopReason = 'final';
        break;
      }

      if (consecutiveZeroNoveltyTurns >= 2) {
        stopReason = 'novelty_exhausted';
        break;
      }
    }

    if (stopReason === null) {
      stopReason = 'turn_cap';
      warnings.push(
        `Đã đạt giới hạn an toàn ${MAX_RETRIEVAL_TURNS_SAFETY_VALVE} lượt truy hồi MCP; bằng chứng có thể chưa đầy đủ`
      );
    }
  } catch (err: any) {
    warnings.push(`Lỗi quy trình MCP retrieval: ${err?.message || String(err)}`);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onParentAbort);
  }

  return finish();
}
