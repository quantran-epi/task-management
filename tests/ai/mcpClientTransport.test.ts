import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import {
  executeDynamicMcpTool,
  fetchServerTools,
  resetMcpClientForTests,
  saveMcpServers,
  type McpServerConfig,
} from '../../src/services/ai/mcpClient';

const SERVER: McpServerConfig = {
  id: 'graphiti-banking',
  name: 'Graphiti Banking MCP',
  url: 'http://localhost:9100/mcp',
  enabled: true,
  instruction: '',
};

interface RpcCall {
  method: string;
  params?: Record<string, unknown>;
}

function jsonRpc(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const calls: RpcCall[] = [];

function mockFetch(handler: (call: RpcCall) => unknown) {
  calls.length = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const payload = JSON.parse(String((init as RequestInit).body)) as RpcCall & { id?: number };
    calls.push(payload);
    return jsonRpc(handler(payload));
  });
}

const readTool = {
  name: 'search_nodes',
  description: 'Search graph nodes',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
};

describe('mcpClient transport hardening', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    resetMcpClientForTests();
    vi.restoreAllMocks();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    db = new TaskPlannerDatabase(`TestMcpTransport_${Date.now()}_${Math.random()}`);
    await db.open();
    await saveMcpServers([SERVER], db);
  });

  it('follows tools/list pagination so no tool is missed', async () => {
    mockFetch((call) => {
      if (call.method === 'initialize') return {};
      if (call.method === 'notifications/initialized') return {};
      if (call.method === 'tools/list') {
        return call.params?.cursor
          ? { tools: [{ ...readTool, name: 'get_catalog_object_context' }] }
          : { tools: [readTool], nextCursor: 'page-2' };
      }
      return {};
    });

    const tools = await fetchServerTools(SERVER);
    expect(tools.map((tool) => tool.function.name)).toEqual([
      'search_nodes',
      'get_catalog_object_context',
    ]);
    expect(calls.filter((call) => call.method === 'tools/list')).toHaveLength(2);
  });

  it('refuses a non-read-only tool before any tools/call', async () => {
    mockFetch((call) => {
      if (call.method === 'tools/list') {
        return {
          tools: [
            { ...readTool, name: 'delete_episode', annotations: { readOnlyHint: false } },
          ],
        };
      }
      return {};
    });

    await expect(
      executeDynamicMcpTool('delete_episode', {}, db, { serverId: SERVER.id })
    ).rejects.toThrow(/chỉ cho phép thao tác đọc/);
    expect(calls.some((call) => call.method === 'tools/call')).toBe(false);
  });

  it('allows an explicitly confirmed mutation path outside retrieval', async () => {
    mockFetch((call) => {
      if (call.method === 'tools/list') {
        return { tools: [{ ...readTool, name: 'delete_episode', annotations: { readOnlyHint: false } }] };
      }
      if (call.method === 'tools/call') {
        return { content: [{ type: 'text', text: '{"deleted":true}' }] };
      }
      return {};
    });

    const result = await executeDynamicMcpTool('delete_episode', { query: 'ep-1' }, db, {
      serverId: SERVER.id,
      allowMutation: true,
    });
    expect(result).toBe('{"deleted":true}');
  });

  it('requires an explicit server instead of scanning every enabled server', async () => {
    mockFetch(() => ({}));
    await expect(executeDynamicMcpTool('search_nodes', { query: 'x' }, db)).rejects.toThrow(
      /Không rõ máy chủ MCP/
    );
  });

  it('rejects arguments that violate the tool JSON schema before calling the server', async () => {
    mockFetch((call) => {
      if (call.method === 'tools/list') return { tools: [readTool] };
      return { content: [{ type: 'text', text: 'ok' }] };
    });

    await expect(
      executeDynamicMcpTool('search_nodes', { query: 42 }, db, { serverId: SERVER.id })
    ).rejects.toThrow(/Tham số cho công cụ MCP "search_nodes" không hợp lệ/);
    expect(calls.some((call) => call.method === 'tools/call')).toBe(false);
  });

  it('returns the full tool result without a character cap', async () => {
    const longText = 'x'.repeat(150_000);
    mockFetch((call) => {
      if (call.method === 'tools/list') return { tools: [readTool] };
      if (call.method === 'tools/call') return { content: [{ type: 'text', text: longText }] };
      return {};
    });

    const result = await executeDynamicMcpTool('search_nodes', { query: 'x' }, db, {
      serverId: SERVER.id,
    });
    expect(result).toHaveLength(150_000);
  });
});
