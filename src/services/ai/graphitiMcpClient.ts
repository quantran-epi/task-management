import { isTauriApp } from '../../utils/timerPopout';
import type { AiToolDefinition } from './aiTools';

const GRAPHITI_TOOL_NAMES = [
  'list_advertised_groups',
  'search_nodes',
  'search_memory_facts',
  'get_catalog_object_context',
] as const;
const GRAPHITI_TOOL_NAME_SET = new Set<string>(GRAPHITI_TOOL_NAMES);
const MAX_TOOL_RESULT_CHARS = 20_000;

interface TauriProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: any;
  error?: { code?: number; message?: string; data?: unknown };
}

let sessionId: string | undefined;
let requestId = 0;
let discoveryPromise: Promise<AiToolDefinition[]> | undefined;
const groupResultCache = new Map<string, Promise<string>>();

export function isGraphitiMcpTool(name: string): boolean {
  return GRAPHITI_TOOL_NAME_SET.has(name);
}

function clearSession(): void {
  sessionId = undefined;
  discoveryPromise = undefined;
  groupResultCache.clear();
}

function extractSessionId(headers: Record<string, string>): string | undefined {
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'mcp-session-id');
  return entry?.[1];
}

function parseResponseBody(body: string): JsonRpcResponse | undefined {
  const trimmed = body.trim();
  if (!trimmed) return undefined;
  const candidates = trimmed.startsWith('{')
    ? [trimmed]
    : trimmed
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter((line) => line && line !== '[DONE]');

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(candidates[index]!) as JsonRpcResponse;
    } catch {
      // Ignore non-JSON SSE events and inspect previous data event.
    }
  }
  throw new Error('Graphiti MCP returned invalid JSON-RPC data');
}

async function invokeGraphiti(
  method: string,
  params?: Record<string, unknown>,
  notification = false
): Promise<any> {
  const api = await import('@tauri-apps/api/core');
  const payload: Record<string, unknown> = { jsonrpc: '2.0', method };
  if (!notification) payload.id = ++requestId;
  if (params !== undefined) payload.params = params;

  let response: TauriProxyResponse;
  try {
    response = await api.invoke<TauriProxyResponse>('graphiti_mcp_request', {
      body: JSON.stringify(payload),
      sessionId,
    });
  } catch (error) {
    clearSession();
    throw error;
  }

  if (response.status < 200 || response.status >= 300) {
    clearSession();
    throw new Error(`Graphiti MCP HTTP ${response.status}: ${response.body.slice(0, 500)}`);
  }
  sessionId = extractSessionId(response.headers) ?? sessionId;
  const message = parseResponseBody(response.body);
  if (message?.error) {
    clearSession();
    throw new Error(message.error.message || `Graphiti MCP error ${message.error.code ?? 'unknown'}`);
  }
  return message?.result;
}

async function initializeSession(): Promise<void> {
  if (sessionId) return;
  await invokeGraphiti('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'PlannerMate', version: '1.0' },
  });
  await invokeGraphiti('notifications/initialized', undefined, true);
}

function isInputSchema(value: unknown): value is AiToolDefinition['function']['parameters'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const schema = value as Record<string, unknown>;
  return schema.type === 'object' && typeof schema.properties === 'object' && schema.properties !== null;
}

async function discoverTools(): Promise<AiToolDefinition[]> {
  await initializeSession();
  const result = await invokeGraphiti('tools/list');
  if (!Array.isArray(result?.tools)) return [];

  return result.tools.flatMap((tool: any) => {
    if (
      !tool ||
      typeof tool.name !== 'string' ||
      !isGraphitiMcpTool(tool.name) ||
      typeof tool.description !== 'string' ||
      !isInputSchema(tool.inputSchema)
    ) {
      return [];
    }
    return [
      {
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      },
    ];
  });
}

export function getGraphitiMcpToolDefinitions(): Promise<AiToolDefinition[]> {
  if (!isTauriApp()) return Promise.resolve([]);
  if (!discoveryPromise) {
    discoveryPromise = discoverTools().catch((error) => {
      clearSession();
      throw error;
    });
  }
  return discoveryPromise;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableSerialize(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function serializeToolResult(result: any): string {
  const textParts = Array.isArray(result?.content)
    ? result.content
        .filter((item: any) => item?.type === 'text' && typeof item.text === 'string')
        .map((item: any) => item.text)
    : [];
  const serialized =
    textParts.length > 0
      ? textParts.join('\n')
      : result?.structuredContent !== undefined
        ? JSON.stringify(result.structuredContent)
        : JSON.stringify(result ?? null);
  return serialized.length <= MAX_TOOL_RESULT_CHARS
    ? serialized
    : `${serialized.slice(0, MAX_TOOL_RESULT_CHARS)}…`;
}

async function executeAllowedTool(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await invokeGraphiti('tools/call', { name, arguments: args });
  return serializeToolResult(result);
}

export async function executeGraphitiMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  if (!isGraphitiMcpTool(name)) {
    throw new Error(`Graphiti MCP tool is not allowed: ${name}`);
  }
  if (!isTauriApp()) {
    throw new Error('Graphiti MCP is available only in Tauri');
  }

  if (name !== 'list_advertised_groups') return executeAllowedTool(name, args);
  const key = stableSerialize(args);
  let promise = groupResultCache.get(key);
  if (!promise) {
    promise = executeAllowedTool(name, args).catch((error) => {
      groupResultCache.delete(key);
      throw error;
    });
    groupResultCache.set(key, promise);
  }
  return promise;
}

export function resetGraphitiMcpClientForTests(): void {
  sessionId = undefined;
  requestId = 0;
  discoveryPromise = undefined;
  groupResultCache.clear();
}
