import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import {
  DEFAULT_GRAPHITI_MCP_ENDPOINT,
  executeGraphitiMcpTool,
  getGraphitiMcpEndpoint,
  getGraphitiMcpToolDefinitions,
  isGraphitiMcpEnabled,
  isGraphitiMcpTool,
  resetGraphitiMcpClientForTests,
  setGraphitiMcpEnabled,
  setGraphitiMcpEndpoint,
  testGraphitiMcpConnection,
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
    const firstCall = invokeMock.mock.calls[0];
    const secondCall = invokeMock.mock.calls[1];
    const thirdCall = invokeMock.mock.calls[2];
    expect(firstCall).toBeDefined();
    expect(secondCall).toBeDefined();
    expect(thirdCall).toBeDefined();
    if (!firstCall || !secondCall || !thirdCall) {
      throw new Error('Expected three mock calls');
    }
    expect(JSON.parse(firstCall[1].body).method).toBe('initialize');
    expect(JSON.parse(secondCall[1].body).method).toBe('notifications/initialized');
    expect(secondCall[1].sessionId).toBe('session-1');
    expect(JSON.parse(thirdCall[1].body).method).toBe('tools/list');
    expect(thirdCall[1].sessionId).toBe('session-1');
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

  describe('configurable endpoint', () => {
    let db: TaskPlannerDatabase;

    beforeEach(() => {
      db = new TaskPlannerDatabase(`test-graphiti-endpoint-${Date.now()}-${Math.random()}`);
    });

    it('defaults to DEFAULT_GRAPHITI_MCP_ENDPOINT when not set in settings', async () => {
      expect(DEFAULT_GRAPHITI_MCP_ENDPOINT).toBe('http://10.4.97.70:30456/mcp');
      const endpoint = await getGraphitiMcpEndpoint(db);
      expect(endpoint).toBe('http://10.4.97.70:30456/mcp');
    });

    it('persists and retrieves custom endpoint in Dexie settings', async () => {
      await setGraphitiMcpEndpoint('http://192.168.1.100:30456/mcp', db);
      const endpoint = await getGraphitiMcpEndpoint(db);
      expect(endpoint).toBe('http://192.168.1.100:30456/mcp');
    });

    it('passes configured endpoint to graphiti_mcp_request invoke calls', async () => {
      (window as any).__TAURI_INTERNALS__ = {};
      await setGraphitiMcpEndpoint('http://127.0.0.1:30456/mcp', db);
      queueDiscovery([allowedTool]);

      await getGraphitiMcpToolDefinitions(db);

      expect(invokeMock).toHaveBeenCalledTimes(3);
      const firstCall = invokeMock.mock.calls[0];
      expect(firstCall?.[0]).toBe('graphiti_mcp_request');
      expect(firstCall?.[1]).toMatchObject({
        endpoint: 'http://127.0.0.1:30456/mcp',
      });
    });

    it('tests connection and reports discovered tools count', async () => {
      (window as any).__TAURI_INTERNALS__ = {};
      queueDiscovery([allowedTool]);

      const result = await testGraphitiMcpConnection('http://10.4.97.70:30456/mcp', db);
      expect(result.ok).toBe(true);
      expect(result.toolsCount).toBe(1);
      expect(result.message).toContain('1 công cụ');
    });

    it('testGraphitiMcpConnection returns failure when invoke rejects', async () => {
      (window as any).__TAURI_INTERNALS__ = {};
      invokeMock.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await testGraphitiMcpConnection('http://10.4.97.70:30456/mcp', db);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Connection refused');
    });
  });

  describe('enabled/disabled toggle persistence', () => {
    let db: TaskPlannerDatabase;

    beforeEach(() => {
      db = new TaskPlannerDatabase(`test-graphiti-enabled-${Date.now()}-${Math.random()}`);
    });

    it('isGraphitiMcpEnabled returns true by default when no setting exists', async () => {
      const enabled = await isGraphitiMcpEnabled(db);
      expect(enabled).toBe(true);
    });

    it('setGraphitiMcpEnabled(false, db) sets setting and isGraphitiMcpEnabled returns false', async () => {
      await setGraphitiMcpEnabled(false, db);
      const enabled = await isGraphitiMcpEnabled(db);
      expect(enabled).toBe(false);

      const rec = await db.settings.get('graphiti_mcp_enabled');
      expect(rec?.value).toBe(false);
    });

    it('setGraphitiMcpEnabled(true, db) sets setting and isGraphitiMcpEnabled returns true', async () => {
      await setGraphitiMcpEnabled(false, db);
      expect(await isGraphitiMcpEnabled(db)).toBe(false);

      await setGraphitiMcpEnabled(true, db);
      expect(await isGraphitiMcpEnabled(db)).toBe(true);

      const rec = await db.settings.get('graphiti_mcp_enabled');
      expect(rec?.value).toBe(true);
    });
  });
});
