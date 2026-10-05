import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeGraphitiMcpTool,
  getGraphitiMcpToolDefinitions,
  isGraphitiMcpTool,
  resetGraphitiMcpClientForTests,
} from '../../src/services/ai/graphitiMcpClient';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

function response(result: unknown, headers: Record<string, string> = {}) {
  return { status: 200, headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result }) };
}

function queueDiscovery(tools: unknown[]) {
  invokeMock
    .mockResolvedValueOnce(response({ protocolVersion: '2025-03-26' }, { 'Mcp-Session-Id': 'session-1' }))
    .mockResolvedValueOnce({ status: 202, headers: {}, body: '' })
    .mockResolvedValueOnce(response({ tools }));
}

const allowedTool = {
  name: 'search_nodes',
  description: 'Search graph nodes',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
};

describe('graphitiMcpClient', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    resetGraphitiMcpClientForTests();
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('returns no tools outside Tauri without invoking native transport', async () => {
    expect(await getGraphitiMcpToolDefinitions()).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('initializes in order, propagates session, filters tools, and caches schemas', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    queueDiscovery([
      allowedTool,
      { name: 'delete_episode', description: 'Delete data', inputSchema: { type: 'object', properties: {} } },
    ]);

    const first = await getGraphitiMcpToolDefinitions();
    const second = await getGraphitiMcpToolDefinitions();

    expect(first).toEqual([
      {
        type: 'function',
        function: {
          name: 'search_nodes',
          description: 'Search graph nodes',
          parameters: allowedTool.inputSchema,
        },
      },
    ]);
    expect(second).toBe(first);
    expect(invokeMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(invokeMock.mock.calls[0][1].body).method).toBe('initialize');
    expect(JSON.parse(invokeMock.mock.calls[1][1].body).method).toBe('notifications/initialized');
    expect(invokeMock.mock.calls[1][1].sessionId).toBe('session-1');
    expect(JSON.parse(invokeMock.mock.calls[2][1].body).method).toBe('tools/list');
    expect(invokeMock.mock.calls[2][1].sessionId).toBe('session-1');
  });

  it('parses SSE JSON-RPC responses', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    invokeMock
      .mockResolvedValueOnce({
        status: 200,
        headers: { 'mcp-session-id': 'session-sse' },
        body: 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26"}}\n\n',
      })
      .mockResolvedValueOnce({ status: 202, headers: {}, body: '' })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: `data: ${JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [allowedTool] } })}\n\n`,
      });

    expect((await getGraphitiMcpToolDefinitions())[0]?.function.name).toBe('search_nodes');
  });

  it('retries discovery after a failed attempt', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    invokeMock.mockRejectedValueOnce(new Error('offline'));
    await expect(getGraphitiMcpToolDefinitions()).rejects.toThrow('offline');

    queueDiscovery([allowedTool]);
    await expect(getGraphitiMcpToolDefinitions()).resolves.toHaveLength(1);
  });

  it('caches successful group calls while keeping search calls live', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    invokeMock
      .mockResolvedValueOnce(response({ content: [{ type: 'text', text: 'groups' }] }))
      .mockResolvedValueOnce(response({ structuredContent: { nodes: [1] } }))
      .mockResolvedValueOnce(response({ structuredContent: { nodes: [2] } }));

    expect(await executeGraphitiMcpTool('list_advertised_groups', { scope: 'all' })).toBe('groups');
    expect(await executeGraphitiMcpTool('list_advertised_groups', { scope: 'all' })).toBe('groups');
    expect(await executeGraphitiMcpTool('search_nodes', { query: 'one' })).toBe('{"nodes":[1]}');
    expect(await executeGraphitiMcpTool('search_nodes', { query: 'one' })).toBe('{"nodes":[2]}');
    expect(invokeMock).toHaveBeenCalledTimes(3);
  });

  it('rejects unlisted names locally before invoke', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    expect(isGraphitiMcpTool('search_nodes')).toBe(true);
    expect(isGraphitiMcpTool('delete_episode')).toBe(false);
    await expect(executeGraphitiMcpTool('delete_episode', {})).rejects.toThrow('not allowed');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
