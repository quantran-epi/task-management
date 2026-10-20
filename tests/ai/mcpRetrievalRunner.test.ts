import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMcpRetrieval } from '../../src/services/ai/mcpRetrievalRunner';
import * as mcpClient from '../../src/services/ai/mcpClient';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';

describe('mcpRetrievalRunner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('runs tool discovery for target_mcp_servers and invokes selected tools via executeDynamicMcpTool', async () => {
    const mockServers: mcpClient.McpServerConfig[] = [
      {
        id: 'graphiti-banking',
        name: 'Graphiti Banking MCP',
        url: 'http://localhost:3000/mcp',
        enabled: true,
        instruction: 'Banking schema test',
      },
    ];

    vi.spyOn(mcpClient, 'getMcpServers').mockResolvedValue(mockServers);
    vi.spyOn(mcpClient, 'fetchServerTools').mockResolvedValue([
      {
        type: 'function',
        function: {
          name: 'search_nodes',
          description: 'Search entities in graph',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      },
    ]);
    vi.spyOn(mcpClient, 'executeDynamicMcpTool').mockResolvedValue(
      JSON.stringify([{ name: 'SVFE_SHB.ACCOUNTS', type: 'Table' }])
    );

    let planTurn = 0;
    vi.spyOn(nineRouterClient, 'completeJson').mockImplementation(async () => {
      planTurn++;
      if (planTurn === 1) {
        return {
          done: false,
          toolCalls: [
            {
              toolName: 'search_nodes',
              args: { query: 'ACCOUNTS' },
            },
          ],
        };
      }
      return { done: true, toolCalls: [] };
    });

    const result = await runMcpRetrieval({
      query: 'Tìm bảng tài khoản',
      serverIds: ['graphiti-banking'],
      modelConfig: {
        endpoint: 'http://test-endpoint',
        apiKey: 'key',
        model: 'test-model',
      },
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      serverId: 'graphiti-banking',
      serverName: 'Graphiti Banking MCP',
      toolName: 'search_nodes',
      args: { query: 'ACCOUNTS' },
    });
    expect(result.items[0]!.rawResult).toContain('SVFE_SHB.ACCOUNTS');
    expect(mcpClient.executeDynamicMcpTool).toHaveBeenCalledWith(
      'search_nodes',
      { query: 'ACCOUNTS' },
      expect.anything()
    );
  });

  it('bounded loop halts after max 3 turns or when model signals completion', async () => {
    const mockServers: mcpClient.McpServerConfig[] = [
      {
        id: 'srv-1',
        name: 'Server 1',
        url: 'http://localhost:3000/mcp',
        enabled: true,
        instruction: 'Test',
      },
    ];

    vi.spyOn(mcpClient, 'getMcpServers').mockResolvedValue(mockServers);
    vi.spyOn(mcpClient, 'fetchServerTools').mockResolvedValue([
      {
        type: 'function',
        function: {
          name: 'step_tool',
          description: 'Step tool',
          parameters: { type: 'object', properties: { step: { type: 'number' } } },
        },
      },
    ]);
    vi.spyOn(mcpClient, 'executeDynamicMcpTool').mockResolvedValue('ok');

    let callsCount = 0;
    vi.spyOn(nineRouterClient, 'completeJson').mockImplementation(async () => {
      callsCount++;
      return {
        done: false,
        toolCalls: [{ toolName: 'step_tool', args: { step: callsCount } }],
      };
    });

    const result = await runMcpRetrieval({
      query: 'Infinite loop query',
      serverIds: ['srv-1'],
      modelConfig: {
        endpoint: 'http://test-endpoint',
        apiKey: 'key',
        model: 'test-model',
      },
    });

    // Should halt after 3 turns
    expect(callsCount).toBe(3);
    expect(result.items).toHaveLength(3);
    expect(result.warnings).toHaveLength(0);
  });

  it('respects 15-second AbortSignal timeout and returns partial results/warnings instead of throwing', async () => {
    const mockServers: mcpClient.McpServerConfig[] = [
      {
        id: 'srv-slow',
        name: 'Slow Server',
        url: 'http://localhost:3000/mcp',
        enabled: true,
        instruction: 'Slow',
      },
    ];

    vi.spyOn(mcpClient, 'getMcpServers').mockResolvedValue(mockServers);
    vi.spyOn(mcpClient, 'fetchServerTools').mockResolvedValue([
      {
        type: 'function',
        function: {
          name: 'slow_tool',
          description: 'Slow tool',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);

    const callerController = new AbortController();

    vi.spyOn(nineRouterClient, 'completeJson').mockImplementation(async () => {
      callerController.abort(new Error('Parent timeout'));
      const abortError = new Error('Parent timeout');
      abortError.name = 'AbortError';
      throw abortError;
    });

    const result = await runMcpRetrieval({
      query: 'Slow query',
      serverIds: ['srv-slow'],
      signal: callerController.signal,
      modelConfig: {
        endpoint: 'http://test-endpoint',
        apiKey: 'key',
        model: 'test-model',
      },
    });

    expect(result.items).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    // Should not throw
  });
});
