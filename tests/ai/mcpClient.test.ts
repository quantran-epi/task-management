import { beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import {
  getEnabledMcpCapabilitySummaries,
  saveMcpServers,
  resetMcpClientForTests,
  isReadOnlyMcpTool,
  fetchServerTools,
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
