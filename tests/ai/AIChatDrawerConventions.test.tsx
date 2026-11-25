import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import { createChatTab, setActiveTab } from '../../src/db/repositories/chatTabRepo';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';
import * as conventionService from '../../src/services/conventionService';
import * as graphitiRules from '../../src/services/ai/graphitiRules';
import * as mcpClient from '../../src/services/ai/mcpClient';
import {
  clearGroundedTurnTestHooks,
  setGroundedTurnTestHooks,
} from '../../src/services/ai/groundedTurnDeps';

vi.mock('../../src/utils/pptxExport', () => ({
  exportPresentationAsFile: vi.fn(),
}));

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const SYSTEM_ID = '33333333-3333-4333-8333-333333333333';
const SCOPE = { type: 'cr' as const, id: PROJECT_ID, title: 'Conventions Project' };
const SCOPE_KEY = `cr:${PROJECT_ID}`;

describe('AIChatDrawer Conventions Injection', () => {
  let db: TaskPlannerDatabase;
  let capturedPayloads: any[];

  beforeEach(async () => {
    capturedPayloads = [];
    clearGroundedTurnTestHooks();
    setGroundedTurnTestHooks({
      runGroundedTurn: async (input) => ({ kind: 'operational', routedQuery: input.query }),
    });

    db = new TaskPlannerDatabase(`conventions-test-${Date.now()}-${Math.random()}`);
    await db.open();
    // The CR must carry a target subsystem: repo conventions are loaded per target.
    await db.systems.add({
      id: SYSTEM_ID,
      code: 'CORE-SVC',
      name: 'Core Service',
      parentId: null,
      type: 'SERVICE',
      createdAt: '2026-11-07T00:00:00.000Z',
      updatedAt: '2026-11-07T00:00:00.000Z',
    });
    await db.changeRequests.add({
      id: PROJECT_ID,
      code: 'CR-CONV-01',
      name: 'Conventions Project',
      status: 'Open',
      type: 'ENHANCEMENT',
      targets: [{ systemId: SYSTEM_ID }],
      createdAt: '2026-11-07T00:00:00.000Z',
      updatedAt: '2026-11-07T00:00:00.000Z',
    });

    const tab = await createChatTab(
      {
        scopeType: 'cr',
        scopeKey: SCOPE_KEY,
        entityId: PROJECT_ID,
        title: '💬 Tab Conventions',
      },
      db
    );
    await setActiveTab(SCOPE_KEY, tab.id, db);

    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });
    vi.spyOn(nineRouterTokenService, 'fetchAvailableModels').mockResolvedValue(['gpt-4o']);

    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(((options: any) => {
      capturedPayloads.push(options.payload);
      return (async function* () {
        yield { type: 'text' as const, delta: 'Hello response' };
      })();
    }) as never);
  });

  afterEach(async () => {
    cleanup();
    clearGroundedTurnTestHooks();
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    db.close();
  });

  const submit = (text: string) => {
    fireEvent.change(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), {
      target: { value: text },
    });
    const send = screen.queryByLabelText('Gửi tin nhắn');
    if (send) fireEvent.click(send);
  };

  it('injects global and repo conventions into system prompt when available', async () => {
    await conventionService.saveGlobalConventions('GLOBAL_RULE: Always write unit tests with Vitest.', db);
    vi.spyOn(conventionService, 'loadMultiRepoConventions').mockResolvedValue([
      {
        systemCode: 'CORE-SVC',
        systemName: 'Core Service',
        repoPath: '/var/repos/core-service',
        content: 'REPO_RULE: Use TypeScript strict mode.',
        foundPath: 'CONVENTIONS.md',
        loadedAt: new Date().toISOString(),
      },
    ]);

    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    submit('How should I write tests?');

    await waitFor(() => expect(capturedPayloads.length).toBeGreaterThan(0));

    const systemMsg = capturedPayloads[0]?.messages?.find((m: any) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toContain('[QUY ƯỚC TỔ CHỨC — CHỈ DẪN ĐƯỢC TIN CẬY]');
    expect(systemMsg.content).toContain('GLOBAL_RULE: Always write unit tests with Vitest.');
    expect(systemMsg.content).toContain('REPO_RULE: Use TypeScript strict mode.');
    expect(systemMsg.content).toContain(
      'DỮ LIỆU KHÔNG ĐÁNG TIN — BẮT ĐẦU — REPOSITORY CONVENTIONS - CORE-SVC (/var/repos/core-service)'
    );
  });

  it('omits conventions segment when neither global nor repo convention exists', async () => {
    vi.spyOn(conventionService, 'loadMultiRepoConventions').mockResolvedValue([]);

    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    submit('General query');

    await waitFor(() => expect(capturedPayloads.length).toBeGreaterThan(0));

    const systemMsg = capturedPayloads[0]?.messages?.find((m: any) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).not.toContain('[QUY ƯỚC TỔ CHỨC — CHỈ DẪN ĐƯỢC TIN CẬY]');
  });

  describe('dedicated Graphiti skill segment', () => {
    const SKILL_MARKER = '[KỸ NĂNG GRAPHITI / GRAPHITI-SQL]\nGRAPHITI_SKILL_TEST_MARKER';

    it('injects the segment regardless of the generic-MCP master gate', async () => {
      vi.spyOn(graphitiRules, 'getGraphitiSkillSegment').mockResolvedValue(SKILL_MARKER);

      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
      submit('Câu hỏi về catalog');

      await waitFor(() => expect(capturedPayloads.length).toBeGreaterThan(0));
      const systemMsg = capturedPayloads[0]?.messages?.find((m: any) => m.role === 'system');
      expect(systemMsg.content).toContain(SKILL_MARKER);
    });

    const SOURCE_NAMES = [
      'search_source',
      'explore_source',
      'source_callers',
      'source_callees',
      'read_source',
    ];
    const SOURCE_SEGMENT = `[KỸ NĂNG GRAPHITI / GRAPHITI-SQL]\n${SOURCE_NAMES.join(', ')}`;

    it('injects the segment with all five source tool names into the system prompt', async () => {
      vi.spyOn(graphitiRules, 'getGraphitiSkillSegment').mockResolvedValue(SOURCE_SEGMENT);

      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
      submit('Cần bằng chứng source');

      await waitFor(() => expect(capturedPayloads.length).toBeGreaterThan(0));
      const systemMsg = capturedPayloads[0]?.messages?.find((m: any) => m.role === 'system');
      expect(systemMsg.content).toContain(SOURCE_SEGMENT);
      for (const name of SOURCE_NAMES) expect(systemMsg.content).toContain(name);
    });

    it('warns when source discovery fails but keeps the turn running', async () => {
      vi.spyOn(graphitiRules, 'getGraphitiSkillSegment').mockResolvedValue(SOURCE_SEGMENT);
      vi.spyOn(mcpClient, 'discoverGraphitiSqlMcpTools').mockRejectedValue(new Error('source down'));
      vi.spyOn(mcpClient, 'getMcpServers').mockResolvedValue([
        {
          id: 'svng-source',
          name: 'SVNG Source MCP',
          url: 'http://127.0.0.1:9102/mcp',
          enabled: true,
          instruction: '',
        },
      ]);
      const warning = vi.fn();
      const ui = await import('../../src/components/ui');
      vi.spyOn(ui, 'useMessage').mockReturnValue({ warning } as never);

      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
      submit('Cần bằng chứng source');

      await waitFor(() => expect(capturedPayloads.length).toBeGreaterThan(0));
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('source tool'));
      const systemMsg = capturedPayloads[0]?.messages?.find((m: any) => m.role === 'system');
      expect(systemMsg.content).toContain(SOURCE_SEGMENT);
    });

    it('keeps the dedicated segment when the tab master MCP gate is off', async () => {
      vi.spyOn(graphitiRules, 'getGraphitiSkillSegment').mockResolvedValue(SKILL_MARKER);
      const tab = await createChatTab(
        {
          scopeType: 'cr',
          scopeKey: SCOPE_KEY,
          entityId: PROJECT_ID,
          title: '💬 Tab No MCP',
          config: { mcpEnabled: false },
        },
        db
      );
      await setActiveTab(SCOPE_KEY, tab.id, db);

      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
      submit('Câu hỏi về catalog');

      await waitFor(() => expect(capturedPayloads.length).toBeGreaterThan(0));
      const systemMsg = capturedPayloads[0]?.messages?.find((m: any) => m.role === 'system');
      // The tab gate now governs only generic MCP servers; Graphiti/SQL has its own switch.
      expect(systemMsg.content).toContain(SKILL_MARKER);
      expect(graphitiRules.getGraphitiSkillSegment).toHaveBeenCalled();
    });
  });
});
