import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { isTauriApp } from '../../utils/timerPopout';
import type { AiToolDefinition } from './aiTools';

export const DEFAULT_GRAPHITI_MCP_ENDPOINT = 'http://10.4.97.70:30456/mcp';
const GRAPHITI_ENDPOINT_SETTINGS_KEY = 'graphiti_mcp_endpoint';
export const GRAPHITI_ENABLED_SETTINGS_KEY = 'graphiti_mcp_enabled';

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

export async function getGraphitiMcpEndpoint(
  db: TaskPlannerDatabase = defaultDb
): Promise<string> {
  const rec = await db.settings.get(GRAPHITI_ENDPOINT_SETTINGS_KEY);
  if (typeof rec?.value === 'string' && rec.value.trim().length > 0) {
    return rec.value.trim();
  }
  return DEFAULT_GRAPHITI_MCP_ENDPOINT;
}

export async function setGraphitiMcpEndpoint(
  endpoint: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  const cleaned = endpoint.trim().replace(/\/+$/, '');
  await db.settings.put({
    key: GRAPHITI_ENDPOINT_SETTINGS_KEY,
    value: cleaned,
  });
  clearSession();
}

export async function isGraphitiMcpEnabled(
  db: TaskPlannerDatabase = defaultDb
): Promise<boolean> {
  const rec = await db.settings.get(GRAPHITI_ENABLED_SETTINGS_KEY);
  if (typeof rec?.value === 'boolean') {
    return rec.value;
  }
  return true;
}

export async function setGraphitiMcpEnabled(
  enabled: boolean,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.settings.put({
    key: GRAPHITI_ENABLED_SETTINGS_KEY,
    value: enabled,
  });
  if (!enabled) {
    clearSession();
  }
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
  notification = false,
  customEndpoint?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<any> {
  const api = await import('@tauri-apps/api/core');
  const payload: Record<string, unknown> = { jsonrpc: '2.0', method };
  if (!notification) payload.id = ++requestId;
  if (params !== undefined) payload.params = params;

  const endpoint = customEndpoint || (await getGraphitiMcpEndpoint(db));

  let response: TauriProxyResponse;
  try {
    response = await api.invoke<TauriProxyResponse>('graphiti_mcp_request', {
      body: JSON.stringify(payload),
      sessionId,
      endpoint,
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

async function initializeSession(
  customEndpoint?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  if (sessionId) return;
  await invokeGraphiti(
    'initialize',
    {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'PlannerMate', version: '1.0' },
    },
    false,
    customEndpoint,
    db
  );
  await invokeGraphiti('notifications/initialized', undefined, true, customEndpoint, db);
}

function isInputSchema(value: unknown): value is AiToolDefinition['function']['parameters'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const schema = value as Record<string, unknown>;
  return schema.type === 'object' && typeof schema.properties === 'object' && schema.properties !== null;
}

async function discoverTools(
  customEndpoint?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiToolDefinition[]> {
  await initializeSession(customEndpoint, db);
  const result = await invokeGraphiti('tools/list', undefined, false, customEndpoint, db);
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

export function getGraphitiMcpToolDefinitions(
  db: TaskPlannerDatabase = defaultDb
): Promise<AiToolDefinition[]> {
  if (!isTauriApp()) return Promise.resolve([]);
  if (!discoveryPromise) {
    discoveryPromise = discoverTools(undefined, db).catch((error) => {
      clearSession();
      throw error;
    });
  }
  return discoveryPromise;
}

export async function testGraphitiMcpConnection(
  customEndpoint?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<{ ok: boolean; message: string; toolsCount?: number }> {
  try {
    clearSession();
    const endpoint = customEndpoint || (await getGraphitiMcpEndpoint(db));
    const tools = await discoverTools(endpoint, db);
    clearSession();
    return {
      ok: true,
      message: `Kết nối Graphiti MCP thành công. Tìm thấy ${tools.length} công cụ được hỗ trợ.`,
      toolsCount: tools.length,
    };
  } catch (error: any) {
    clearSession();
    return {
      ok: false,
      message: error?.message || 'Không thể kết nối tới máy chủ Graphiti MCP',
    };
  }
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
