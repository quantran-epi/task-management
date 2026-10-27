import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMcpRetrieval, adaptToolArguments } from '../../src/services/ai/mcpRetrievalRunner';
import * as mcpClient from '../../src/services/ai/mcpClient';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';

describe('mcpRetrievalRunner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalized evidence', () => {
    it('keeps the full JSON payload, never a mid-JSON slice', async () => {
      const records = Array.from({ length: 500 }, (_, i) => ({
        type: 'edge',
        edge_type: 'JoinsWith',
        fact: `Fact ${i} ${'x'.repeat(80)}`,
      }));
      records.push({ type: 'edge', edge_type: 'WritesTo', fact: 'TRIGGER MAIN1.EVT_EVENT_TRG WritesTo MAIN1.EVT_EVENT' } as any);
      const raw = JSON.stringify({ edges: records });
      expect(raw.length).toBeGreaterThan(20_000);

      const { normalizeMcpEvidence } = await import('../../src/services/ai/mcpEvidence');
      const { records: normalized } = normalizeMcpEvidence([
        {
          serverId: 'graphiti-banking',
          serverName: 'Graphiti Banking MCP',
          toolName: 'search_memory_facts',
          args: { query: 'writer' },
          rawResult: raw,
          timestamp: '2026-10-26T00:00:00.000Z',
        },
      ]);

      expect(normalized.some((record) => record.text.includes('WritesTo MAIN1.EVT_EVENT'))).toBe(true);
      expect(normalized.length).toBe(records.length);
    });
  });

  describe('adaptToolArguments', () => {
    it('wraps flat arguments when tool schema expects a single root request object', () => {
      const schema = {
        type: 'object',
        properties: {
          request: {
            type: 'object',
            properties: {
              system_key: { type: 'string' },
              graph_key: { type: 'string' },
            },
            required: ['system_key', 'graph_key'],
          },
        },
        required: ['request'],
      };

      const flatArgs = { system_key: 'BO', graph_key: 'COLUMN::BO::FOO' };
      const adapted = adaptToolArguments(schema, flatArgs);
      expect(adapted).toEqual({
        request: { system_key: 'BO', graph_key: 'COLUMN::BO::FOO' },
      });
    });

    it('does not re-wrap if request wrapper is already provided', () => {
      const schema = {
        type: 'object',
        properties: {
          request: { type: 'object' },
        },
      };

      const wrappedArgs = { request: { system_key: 'BO' } };
      const adapted = adaptToolArguments(schema, wrappedArgs);
      expect(adapted).toEqual(wrappedArgs);
    });

    it('leaves flat schema unchanged', () => {
      const schema = {
        type: 'object',
        properties: {
          query: { type: 'string' },
          max_nodes: { type: 'number' },
        },
      };

      const args = { query: 'card' };
      const adapted = adaptToolArguments(schema, args);
      expect(adapted).toEqual({ query: 'card' });
    });
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
      expect.anything(),
      { serverId: 'graphiti-banking' }
    );
  });

  it('stops after 2 consecutive turns that add no new evidence', async () => {
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

    // Turn 1 adds evidence; turns 2 and 3 add none -> stop, no cap warning.
    expect(callsCount).toBe(3);
    expect(result.items).toHaveLength(3);
    expect(result.warnings).toHaveLength(0);
    expect(result.completeness).toBe('complete');
  });

  it('runs up to the 12-turn safety valve while every turn adds new evidence', async () => {
    const mockServers: mcpClient.McpServerConfig[] = [
      {
        id: 'srv-fresh',
        name: 'Fresh Server',
        url: 'http://localhost:3000/mcp',
        enabled: true,
        instruction: 'Always fresh',
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

    let callsCount = 0;
    vi.spyOn(mcpClient, 'executeDynamicMcpTool').mockImplementation(async (_toolName, args) =>
      JSON.stringify({ nodes: [{ name: `Entity${(args as { step: number }).step}` }] })
    );
    vi.spyOn(nineRouterClient, 'completeJson').mockImplementation(async () => {
      callsCount++;
      return {
        done: false,
        toolCalls: [{ toolName: 'step_tool', args: { step: callsCount } }],
      };
    });

    const result = await runMcpRetrieval({
      query: 'Fresh query',
      serverIds: ['srv-fresh'],
      modelConfig: {
        endpoint: 'http://test-endpoint',
        apiKey: 'key',
        model: 'test-model',
      },
    });

    expect(callsCount).toBe(12);
    expect(result.items).toHaveLength(12);
    expect(result.warnings.some((w) => w.includes('giới hạn an toàn 12 lượt'))).toBe(true);
    expect(result.completeness).toBe('partial');
    expect(result.pagesCapped).toBe(false);
  });

  it('injects bounded instructions of target enabled servers without truncating ordinary instructions', async () => {
    const ordinaryInstruction = `Must query list_containers before inspection. ${'workflow '.repeat(200)}MANDATORY_WORKFLOW_END`;
    const oversizedInstruction = `BOUND_START_${'x'.repeat(4100)}BOUND_END`;
    const mockServers: mcpClient.McpServerConfig[] = [
      {
        id: 'srv-target',
        name: 'Target Service',
        url: 'http://localhost:3000/mcp',
        enabled: true,
        instruction: ordinaryInstruction,
      },
      {
        id: 'srv-bounded',
        name: 'Bounded Service',
        url: 'http://localhost:3000/mcp',
        enabled: true,
        instruction: oversizedInstruction,
      },
      {
        id: 'srv-disabled',
        name: 'Disabled Service',
        url: 'http://localhost:3000/mcp',
        enabled: false,
        instruction: 'Disabled instruction should not appear',
      },
      {
        id: 'srv-untargeted',
        name: 'Untargeted Service',
        url: 'http://localhost:3000/mcp',
        enabled: true,
        instruction: 'Untargeted instruction should not appear',
      },
    ];

    vi.spyOn(mcpClient, 'getMcpServers').mockResolvedValue(mockServers);
    vi.spyOn(mcpClient, 'fetchServerTools').mockResolvedValue([
      {
        type: 'function',
        function: {
          name: 'inspect_tool',
          description: 'Inspect item',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);

    let capturedSystemPrompt = '';
    vi.spyOn(nineRouterClient, 'completeJson').mockImplementation(async (opts: any) => {
      capturedSystemPrompt = opts.messages[0].content;
      return { done: true, toolCalls: [] };
    });

    await runMcpRetrieval({
      query: 'Check status',
      serverIds: ['srv-target', 'srv-bounded'],
      modelConfig: {
        endpoint: 'http://test-endpoint',
        apiKey: 'key',
        model: 'test-model',
      },
    });

    expect(capturedSystemPrompt).toContain('Target Server Instructions:');
    expect(capturedSystemPrompt).toContain(ordinaryInstruction);
    expect(capturedSystemPrompt).toContain('MANDATORY_WORKFLOW_END');
    expect(capturedSystemPrompt).toContain('Target Service (id: srv-target)');
    expect(capturedSystemPrompt).toContain('Bounded Service (id: srv-bounded)');
    expect(capturedSystemPrompt).toContain(`${oversizedInstruction.slice(0, 4000)}... (truncated)`);
    expect(capturedSystemPrompt).not.toContain('BOUND_END');
    expect(capturedSystemPrompt).not.toContain('Disabled instruction should not appear');
    expect(capturedSystemPrompt).not.toContain('Untargeted instruction should not appear');
  });

  it('instructs the planner to run a container-scoped search for where-is-stored questions', async () => {
    const mockServers: mcpClient.McpServerConfig[] = [
      {
        id: 'srv-reverse',
        name: 'Reverse Server',
        url: 'http://localhost:3000/mcp',
        enabled: true,
        instruction: 'Reverse lookup test',
      },
    ];

    vi.spyOn(mcpClient, 'getMcpServers').mockResolvedValue(mockServers);
    vi.spyOn(mcpClient, 'fetchServerTools').mockResolvedValue([
      {
        type: 'function',
        function: {
          name: 'search_nodes',
          description: 'Search entities',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      },
    ]);

    let capturedSystemPrompt = '';
    vi.spyOn(nineRouterClient, 'completeJson').mockImplementation(async (opts: any) => {
      capturedSystemPrompt = opts.messages[0].content;
      return { done: true, toolCalls: [] };
    });

    await runMcpRetrieval({
      query: 'trường nào lưu số thẻ',
      serverIds: ['srv-reverse'],
      modelConfig: { endpoint: 'http://test-endpoint', apiKey: 'key', model: 'test-model' },
    });

    expect(capturedSystemPrompt).toContain('REVERSE LOOKUP');
    expect(capturedSystemPrompt).toContain('entity_types: ["Table"]');
    // Shortening the user's phrasing to a bare keyword favours detail entities.
    expect(capturedSystemPrompt).toContain('do NOT shorten it to a bare keyword');
    // Done is forbidden while only detail entities were retrieved.
    expect(capturedSystemPrompt).toContain('while no container entity has been retrieved');
  });

  it('coordinates multi-turn dependent tool execution generically', async () => {
    const mockServers: mcpClient.McpServerConfig[] = [
      {
        id: 'generic-fs',
        name: 'Generic FS',
        url: 'http://localhost:3000/mcp',
        enabled: true,
        instruction: 'First discover items, then inspect attributes using itemId.',
      },
    ];

    vi.spyOn(mcpClient, 'getMcpServers').mockResolvedValue(mockServers);
    vi.spyOn(mcpClient, 'fetchServerTools').mockResolvedValue([
      {
        type: 'function',
        function: {
          name: 'discover_items',
          description: 'List available items',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_attribute',
          description: 'Get item attribute',
          parameters: {
            type: 'object',
            properties: { itemId: { type: 'string' }, attributeName: { type: 'string' } },
            required: ['itemId', 'attributeName'],
          },
        },
      },
    ]);

    const toolExecutionSpy = vi.spyOn(mcpClient, 'executeDynamicMcpTool').mockImplementation(
      async (toolName: string, args: Record<string, unknown>) => {
        if (toolName === 'discover_items') {
          return JSON.stringify([{ itemId: 'item-101', title: 'PaymentCard' }]);
        }
        if (toolName === 'get_attribute' && args.itemId === 'item-101') {
          return JSON.stringify({ issueDate: '2026-05-12' });
        }
        throw new Error(`Unexpected tool call: ${toolName}`);
      }
    );

    let planTurn = 0;
    vi.spyOn(nineRouterClient, 'completeJson').mockImplementation(async () => {
      planTurn++;
      if (planTurn === 1) {
        return {
          done: false,
          toolCalls: [{ toolName: 'discover_items', args: {} }],
        };
      }
      if (planTurn === 2) {
        return {
          done: true,
          toolCalls: [
            { toolName: 'get_attribute', args: { itemId: 'item-101', attributeName: 'issueDate' } },
          ],
        };
      }
      return { done: true, toolCalls: [] };
    });

    const result = await runMcpRetrieval({
      query: 'When was card issued?',
      serverIds: ['generic-fs'],
      modelConfig: {
        endpoint: 'http://test-endpoint',
        apiKey: 'key',
        model: 'test-model',
      },
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.toolName).toBe('discover_items');
    expect(result.items[1]!.toolName).toBe('get_attribute');
    expect(result.items[1]!.rawResult).toContain('2026-05-12');
    expect(toolExecutionSpy).toHaveBeenCalledTimes(2);
  });

  it('feeds failed attempted calls to a repair turn', async () => {
    const mockServers: mcpClient.McpServerConfig[] = [
      {
        id: 'srv-repair',
        name: 'Repair Server',
        url: 'http://localhost:3000/mcp',
        enabled: true,
        instruction: 'Use validation errors to repair arguments on the next turn.',
      },
    ];

    vi.spyOn(mcpClient, 'getMcpServers').mockResolvedValue(mockServers);
    vi.spyOn(mcpClient, 'fetchServerTools').mockResolvedValue([
      {
        type: 'function',
        function: {
          name: 'lookup_record',
          description: 'Lookup a record',
          parameters: {
            type: 'object',
            properties: { recordId: { type: 'string' } },
            required: ['recordId'],
          },
        },
      },
    ]);

    const executeSpy = vi
      .spyOn(mcpClient, 'executeDynamicMcpTool')
      .mockRejectedValueOnce(new Error('recordId is required'))
      .mockResolvedValueOnce(JSON.stringify({ recordId: 'record-7', status: 'found' }));

    let planTurn = 0;
    let repairPrompt = '';
    vi.spyOn(nineRouterClient, 'completeJson').mockImplementation(async (opts: any) => {
      planTurn++;
      if (planTurn === 1) {
        return {
          done: false,
          toolCalls: [{ toolName: 'lookup_record', args: {} }],
        };
      }
      repairPrompt = opts.messages[1].content;
      return {
        done: true,
        toolCalls: [{ toolName: 'lookup_record', args: { recordId: 'record-7' } }],
      };
    });

    const result = await runMcpRetrieval({
      query: 'Find record',
      serverIds: ['srv-repair'],
      modelConfig: {
        endpoint: 'http://test-endpoint',
        apiKey: 'key',
        model: 'test-model',
      },
    });

    expect(planTurn).toBe(2);
    expect(repairPrompt).toContain('Called lookup_record failed: recordId is required');
    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      toolName: 'lookup_record',
      args: { recordId: 'record-7' },
    });
    expect(result.warnings).toContain('Lỗi thực thi công cụ "lookup_record": recordId is required');
  });

  it('executes valid planned batch even if safety watchdog triggers after planner response', async () => {
    vi.useFakeTimers();
    try {
      const mockServers: mcpClient.McpServerConfig[] = [
        {
          id: 'srv-delayed',
          name: 'Delayed Server',
          url: 'http://localhost:3000/mcp',
          enabled: true,
          instruction: 'Delayed server instruction',
        },
      ];

      vi.spyOn(mcpClient, 'getMcpServers').mockResolvedValue(mockServers);
      vi.spyOn(mcpClient, 'fetchServerTools').mockResolvedValue([
        {
          type: 'function',
          function: {
            name: 'action_tool',
            description: 'Action tool',
            parameters: { type: 'object', properties: {} },
          },
        },
      ]);

      const executeSpy = vi.spyOn(mcpClient, 'executeDynamicMcpTool').mockResolvedValue('executed-data');

      vi.spyOn(nineRouterClient, 'completeJson').mockImplementation(async () => {
        // Advance timer past 5m (300_000ms) safety watchdog
        await vi.advanceTimersByTimeAsync(305_000);
        return {
          done: false,
          toolCalls: [{ toolName: 'action_tool', args: { q: 1 } }],
        };
      });

      const promise = runMcpRetrieval({
        query: 'Execute after watchdog triggers',
        serverIds: ['srv-delayed'],
        modelConfig: {
          endpoint: 'http://test-endpoint',
          apiKey: 'key',
          model: 'test-model',
        },
      });

      const result = await promise;

      // Batch was preserved and executed
      expect(executeSpy).toHaveBeenCalledTimes(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.toolName).toBe('action_tool');
      // Loop stopped with clear watchdog warning
      expect(result.warnings.some((w) => w.includes('5m safety watchdog'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops immediately when user aborts without running tool calls or blaming watchdog', async () => {
    const mockServers: mcpClient.McpServerConfig[] = [
      {
        id: 'srv-user-abort',
        name: 'User Abort Server',
        url: 'http://localhost:3000/mcp',
        enabled: true,
        instruction: 'User abort test instruction',
      },
    ];

    vi.spyOn(mcpClient, 'getMcpServers').mockResolvedValue(mockServers);
    vi.spyOn(mcpClient, 'fetchServerTools').mockResolvedValue([
      {
        type: 'function',
        function: {
          name: 'user_tool',
          description: 'Tool',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);

    const executeSpy = vi.spyOn(mcpClient, 'executeDynamicMcpTool');
    const abortCtrl = new AbortController();

    vi.spyOn(nineRouterClient, 'completeJson').mockImplementation(async () => {
      // User aborts while or right after planner
      abortCtrl.abort(new Error('User clicked Stop'));
      return {
        done: false,
        toolCalls: [{ toolName: 'user_tool', args: {} }],
      };
    });

    const result = await runMcpRetrieval({
      query: 'User abort query',
      serverIds: ['srv-user-abort'],
      signal: abortCtrl.signal,
      modelConfig: {
        endpoint: 'http://test-endpoint',
        apiKey: 'key',
        model: 'test-model',
      },
    });

    expect(executeSpy).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(0);
    expect(result.warnings).toContain('Thao tác MCP bị hủy');
    expect(result.warnings.some((w) => w.includes('watchdog'))).toBe(false);
  });

  it('executes planned calls even when done is true', async () => {
    const mockServers: mcpClient.McpServerConfig[] = [
      {
        id: 'srv-done-calls',
        name: 'Done Calls Server',
        url: 'http://localhost:3000/mcp',
        enabled: true,
        instruction: 'Done calls test instruction',
      },
    ];

    vi.spyOn(mcpClient, 'getMcpServers').mockResolvedValue(mockServers);
    vi.spyOn(mcpClient, 'fetchServerTools').mockResolvedValue([
      {
        type: 'function',
        function: {
          name: 'final_tool',
          description: 'Final tool',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);
    vi.spyOn(mcpClient, 'executeDynamicMcpTool').mockResolvedValue('final-data');

    vi.spyOn(nineRouterClient, 'completeJson').mockResolvedValue({
      done: true,
      toolCalls: [{ toolName: 'final_tool', args: { final: true } }],
    });

    const result = await runMcpRetrieval({
      query: 'Done with calls',
      serverIds: ['srv-done-calls'],
      modelConfig: {
        endpoint: 'http://test-endpoint',
        apiKey: 'key',
        model: 'test-model',
      },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.toolName).toBe('final_tool');
    expect(result.warnings).toHaveLength(0);
  });

  it('respects safety watchdog timeout and returns partial results/warnings instead of throwing', async () => {
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
