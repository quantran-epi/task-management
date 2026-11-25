import { beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import {
  getEnabledMcpCapabilitySummaries,
  saveMcpServers,
  resetMcpClientForTests,
  invalidateMcpDiscovery,
  isReadOnlyMcpTool,
  fetchServerTools,
  discoverAllMcpTools,
  executeDynamicMcpTool,
  MCP_DISCOVERY_TTL_MS,
  type McpServerConfig,
} from '../../src/services/ai/mcpClient';

describe('mcpClient - getEnabledMcpCapabilitySummaries', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    resetMcpClientForTests();
    db = new TaskPlannerDatabase(`TestMcpClient_${Date.now()}_${Math.random()}`);
    await db.open();
  });

  it('filters out disabled servers and returns only enabled servers', async () => {
    const servers: McpServerConfig[] = [
      {
        id: 'server-1',
        name: 'Server One',
        url: 'http://localhost:3001/mcp',
        enabled: true,
        instruction: 'Scope for server one',
      },
      {
        id: 'server-2',
        name: 'Server Two',
        url: 'http://localhost:3002/mcp',
        enabled: false,
        instruction: 'Scope for server two',
      },
    ];

    await saveMcpServers(servers, db);

    const summaries = await getEnabledMcpCapabilitySummaries(db);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.id).toBe('server-1');
    expect(summaries[0]!.name).toBe('Server One');
    expect(summaries[0]!.description).toBe('Scope for server one');
  });

  it('returns tools advertised after a refresh and drops tools no longer advertised', async () => {
    const server: McpServerConfig = {
      id: 'dynamic-server', name: 'Dynamic', url: 'http://localhost:9301/mcp',
      enabled: true, instruction: '',
    };
    await saveMcpServers([server], db);
    let advertised = ['brand_new_read'];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      const result = request.method === 'tools/list'
        ? {
            tools: advertised.map((name) => ({
              name,
              description: name,
              inputSchema: { type: 'object', properties: {} },
              annotations: { readOnlyHint: true },
            })),
          }
        : {};
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { status: 200 });
    }));

    const first = await discoverAllMcpTools(db);
    expect(first.map((tool) => tool.function.name)).toEqual(['brand_new_read']);

    advertised = ['replacement_read'];
    invalidateMcpDiscovery();
    const second = await discoverAllMcpTools(db);
    expect(second.map((tool) => tool.function.name)).toEqual(['replacement_read']);
    expect(isReadOnlyMcpTool('brand_new_read')).toBe(false);
    expect(isReadOnlyMcpTool('replacement_read')).toBe(true);
    vi.unstubAllGlobals();
  });

  it('refreshes discovery automatically after the short TTL expires', async () => {
    const server: McpServerConfig = {
      id: 'ttl-server', name: 'TTL', url: 'http://localhost:9302/mcp',
      enabled: true, instruction: '',
    };
    await saveMcpServers([server], db);
    let names = ['old_read'];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      const result = request.method === 'tools/list'
        ? { tools: names.map((name) => ({
            name, description: name,
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true },
          })) }
        : {};
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { status: 200 });
    }));

    expect((await discoverAllMcpTools(db)).map((tool) => tool.function.name)).toEqual(['old_read']);
    names = ['new_read'];
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + MCP_DISCOVERY_TTL_MS + 1);
    try {
      expect((await discoverAllMcpTools(db)).map((tool) => tool.function.name)).toEqual(['new_read']);
    } finally {
      nowSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('blocks a mutation tool discovered without read-only metadata', async () => {
    const server: McpServerConfig = {
      id: 'mutation-server', name: 'Mutation', url: 'http://localhost:9303/mcp',
      enabled: true, instruction: '',
    };
    await saveMcpServers([server], db);
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      const result = request.method === 'tools/list'
        ? { tools: [{ name: 'brand_new_write', description: 'write',
            inputSchema: { type: 'object', properties: {} } }] }
        : { content: [{ type: 'text', text: 'should not reach server' }] };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const discovered = await discoverAllMcpTools(db);
    expect(discovered.map((tool) => tool.function.name)).toContain('brand_new_write');
    await expect(executeDynamicMcpTool('brand_new_write', {}, db)).rejects.toThrow(/chỉ cho phép thao tác đọc/);
    expect(fetchMock.mock.calls.filter((call) => JSON.parse(String(call[1]?.body)).method === 'tools/call')).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('caps tool list to maximum 10 tools per server to avoid prompt blowup', async () => {
    const manyTools = Array.from({ length: 15 }, (_, i) => `tool_${i + 1}`);
    const servers: any[] = [
      {
        id: 'server-busy',
        name: 'Busy Server',
        url: 'http://localhost:3001/mcp',
        enabled: true,
        instruction: 'Instruction text',
        cachedTools: manyTools,
      },
    ];

    await saveMcpServers(servers, db);

    const summaries = await getEnabledMcpCapabilitySummaries(db);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.tools).toHaveLength(10);
    expect(summaries[0]!.tools).toEqual(manyTools.slice(0, 10));
  });

  it('classifies allowlisted, cached read-only, read-write, and unknown tools fail closed', async () => {
    const server: McpServerConfig = {
      id: 'server-tools', name: 'Tools', url: 'http://localhost:3001/mcp',
      enabled: true, instruction: '',
    };
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      const result = request.method === 'tools/list'
        ? {
            tools: [
              { name: 'cached_read', description: 'read', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
              { name: 'cached_write', description: 'write', inputSchema: { type: 'object', properties: {} } },
            ],
          }
        : {};
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { status: 200 });
    }));

    await fetchServerTools(server);

    expect(isReadOnlyMcpTool('search_nodes')).toBe(true);
    expect(isReadOnlyMcpTool('cached_read')).toBe(true);
    expect(isReadOnlyMcpTool('cached_write')).toBe(false);
    expect(isReadOnlyMcpTool('unknown')).toBe(false);
    vi.unstubAllGlobals();
  });

  it('works cleanly with empty server list or servers without cached tools', async () => {
    await saveMcpServers([], db);

    const emptySummaries = await getEnabledMcpCapabilitySummaries(db);
    expect(emptySummaries).toEqual([]);

    const noToolServers: McpServerConfig[] = [
      {
        id: 'server-empty',
        name: 'Empty Server',
        url: 'http://localhost:3003/mcp',
        enabled: true,
        instruction: '',
      },
    ];
    await saveMcpServers(noToolServers, db);

    const summaries = await getEnabledMcpCapabilitySummaries(db);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.tools).toEqual([]);
    expect(summaries[0]!.description).toBe('');
  });
});
