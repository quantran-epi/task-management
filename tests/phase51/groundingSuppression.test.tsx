// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import { generateId } from '../../src/utils/uuid';
import { setGroundedTurnTestHooks, clearGroundedTurnTestHooks } from '../../src/services/ai/groundedTurnDeps';
import { aiDebugService } from '../../src/services/ai/aiDebugService';

const calls = vi.hoisted(() => ({
  buildGlobalContextPrompt: vi.fn(async () => '<global_context>LEAK</global_context>'),
  buildItemContextPrompt: vi.fn(async (_options?: { entityType?: string | undefined }) => '<item_context>TASK-LEAK</item_context>'),
  extractMentionedEntityIds: vi.fn((_text: string) => ({
    taskIds: ['11111111-1111-4111-8111-111111111111'],
    crIds: ['22222222-2222-4222-8222-222222222222'],
    systemIds: ['33333333-3333-4333-8333-333333333333'],
    filePaths: [] as string[],
    docIds: [] as string[],
  })),
  getGlobalConventions: vi.fn(async () => 'TOAN-CUC-QUY-UOC-LEAK'),
  buildConventionsSegment: vi.fn((input?: { global?: string | undefined; repos?: unknown[] | undefined }) =>
    input?.global ? `[GLOBAL CONVENTIONS - QUY ƯỚC CHUNG TỔ CHỨC]\n${input.global}` : ''
  ),
  getTask: vi.fn(async (id: string) => ({ id, name: `task-${id}` })),
  getChangeRequest: vi.fn(async (id: string) => ({ id, code: 'CR-TEST', name: `cr-${id}` })),
  getSystem: vi.fn(async (id: string) => ({ id, code: 'SYS', name: `system-${id}` })),
  fetchSetCatalog: vi.fn(async () => []),
  createDefaultGroundedTurnDeps: vi.fn(() => ({ marker: 'grounded-deps' })),
  discoverGraphitiSqlMcpTools: vi.fn(async () => []),
  discoverGatedMcpTools: vi.fn(async () => []),
  getGraphitiSkillSegment: vi.fn(async () => ''),
  getOracleToolConfig: vi.fn(async () => null),
  getSshFsToolConfig: vi.fn(async () => null),
  getMcpServers: vi.fn(async () => []),
  updateTask: vi.fn(async () => undefined),
  createNote: vi.fn(async () => undefined),
  launchClaudeTerminal: vi.fn(async () => undefined),
  getNineRouterApiKey: vi.fn(async () => 'test-key'),
  getNineRouterConfig: vi.fn(async () => ({
    endpoint: 'https://example.invalid',
    defaultModel: 'model-x',
    charLimit: 12000,
  })),
  startTurn: vi.fn((_params?: { systemPrompt?: string | undefined }) => `turn_${Date.now()}`),
}));

vi.mock('../../src/services/ai/contextGrounding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ai/contextGrounding')>();
  return {
    ...actual,
    buildGlobalContextPrompt: calls.buildGlobalContextPrompt,
    buildItemContextPrompt: calls.buildItemContextPrompt,
    extractMentionedEntityIds: calls.extractMentionedEntityIds,
  };
});
vi.mock('../../src/services/conventionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/conventionService')>();
  return { ...actual, getGlobalConventions: calls.getGlobalConventions };
});
vi.mock('../../src/services/ai/conventionsSegment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ai/conventionsSegment')>();
  return { ...actual, buildConventionsSegment: calls.buildConventionsSegment };
});
vi.mock('../../src/db/repositories/taskRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db/repositories/taskRepo')>();
  return { ...actual, getTask: calls.getTask, updateTask: calls.updateTask };
});
vi.mock('../../src/db/repositories/changeRequestRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db/repositories/changeRequestRepo')>();
  return { ...actual, getChangeRequest: calls.getChangeRequest };
});
vi.mock('../../src/db/repositories/systemRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db/repositories/systemRepo')>();
  return { ...actual, getSystem: calls.getSystem };
});
vi.mock('../../src/db/repositories/documentSetRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db/repositories/documentSetRepo')>();
  return { ...actual, fetchSetCatalog: calls.fetchSetCatalog };
});
vi.mock('../../src/services/ai/groundedTurnDeps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ai/groundedTurnDeps')>();
  return { ...actual, createDefaultGroundedTurnDeps: calls.createDefaultGroundedTurnDeps };
});
vi.mock('../../src/services/ai/mcpClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ai/mcpClient')>();
  return {
    ...actual,
    discoverGraphitiSqlMcpTools: calls.discoverGraphitiSqlMcpTools,
    discoverGatedMcpTools: calls.discoverGatedMcpTools,
    getMcpServers: calls.getMcpServers,
  };
});
vi.mock('../../src/services/ai/graphitiRules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ai/graphitiRules')>();
  return { ...actual, getGraphitiSkillSegment: calls.getGraphitiSkillSegment };
});
vi.mock('../../src/services/ai/oracleSqlclService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ai/oracleSqlclService')>();
  return { ...actual, getOracleToolConfig: calls.getOracleToolConfig };
});
vi.mock('../../src/services/ai/sshFsToolService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ai/sshFsToolService')>();
  return { ...actual, getSshFsToolConfig: calls.getSshFsToolConfig };
});
vi.mock('../../src/services/ai/nineRouterTokenService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ai/nineRouterTokenService')>();
  return {
    ...actual,
    getNineRouterApiKey: calls.getNineRouterApiKey,
    getNineRouterConfig: calls.getNineRouterConfig,
    fetchAvailableModels: vi.fn(async () => []),
  };
});
vi.mock('../../src/services/ai/aiOrchestratorLoop', () => ({
  runAiOrchestratorLoop: vi.fn(async () => ({
    fullResponse: 'phản hồi kiểm tra',
    cleanResponse: 'phản hồi kiểm tra',
    messages: [],
    tokenUsage: {},
    generatedFiles: [],
    truncated: false,
    loopLimitReached: false,
  })),
}));
vi.mock('../../src/services/ai/claudeCliService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ai/claudeCliService')>();
  return { ...actual, launchClaudeTerminal: calls.launchClaudeTerminal };
});
vi.mock('../../src/db/repositories/noteRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db/repositories/noteRepo')>();
  return { ...actual, createNote: calls.createNote };
});

type PromptCapture = {
  systemPrompt?: string | undefined;
};

const currentCapture = (): PromptCapture | undefined => {
  const last = calls.startTurn.mock.calls.at(-1)?.[0];
  return last as PromptCapture | undefined;
};

async function sendTurn(
  db: TaskPlannerDatabase,
  text: string,
  standalone: boolean,
  scope: { type: 'global'; id?: undefined; title?: undefined } | { type: 'task'; id: string; title?: string | undefined } = {
    type: 'global',
  }
): Promise<void> {
  render(
    <AIChatDrawer
      open
      onClose={vi.fn()}
      db={db}
      activeScope={scope}
      isStandaloneChat={standalone}
    />
  );
  const composer = await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
  fireEvent.change(composer, { target: { value: ` ${text} ` } });
  const sendButton = screen.getByLabelText('Gửi tin nhắn');
  expect(sendButton).toBeEnabled();
  fireEvent.click(sendButton);
  await waitFor(() => expect(calls.startTurn).toHaveBeenCalled(), { timeout: 10000 });
  await waitFor(() => {
    expect(screen.queryByLabelText('Dừng sinh phản hồi')).not.toBeInTheDocument();
  }, { timeout: 10000 });
}

describe('phase 51 standalone grounding suppression', () => {
  let dbName: string;
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    clearGroundedTurnTestHooks();
    vi.spyOn(aiDebugService, 'startTurn').mockImplementation(calls.startTurn);
    setGroundedTurnTestHooks({
      runGroundedTurn: async (input) => ({ kind: 'operational', routedQuery: input.query }),
    });
    dbName = `groundingSuppression_${generateId()}`;
    db = new TaskPlannerDatabase(dbName);
    await db.open();
    await db.settings.put({
      key: 'global_conventions',
      value: 'TOAN-CUC-QUY-UOC-LEAK',
    });
  });

  afterEach(async () => {
    cleanup();
    clearGroundedTurnTestHooks();
    vi.restoreAllMocks();
    db.close();
    await Dexie.delete(dbName);
  });

  it('Test 1: standalone global turn never calls buildGlobalContextPrompt; legacy still does', async () => {
    await sendTurn(db, 'Câu hỏi không có mention', true);
    expect(calls.buildGlobalContextPrompt).not.toHaveBeenCalled();
    expect(currentCapture()?.systemPrompt).not.toContain('<global_context>');

    cleanup();
    vi.clearAllMocks();
    await sendTurn(db, 'Câu hỏi không có mention', false);
    expect(calls.buildGlobalContextPrompt).toHaveBeenCalledTimes(1);
    expect(currentCapture()?.systemPrompt).toContain('<global_context>');
  });

  it('Test 2: standalone never reads or injects global conventions; legacy still does', async () => {
    await sendTurn(db, 'Câu hỏi không có mention', true);
    expect(calls.getGlobalConventions).not.toHaveBeenCalled();
    const globalBuilds = calls.buildConventionsSegment.mock.calls.filter(
      (call) => Boolean((call[0] as { global?: string | undefined } | undefined)?.global)
    );
    expect(globalBuilds).toHaveLength(0);
    expect(currentCapture()?.systemPrompt).not.toContain('TOAN-CUC-QUY-UOC-LEAK');

    cleanup();
    vi.clearAllMocks();
    await sendTurn(db, 'Câu hỏi không có mention', false);
    expect(calls.getGlobalConventions).toHaveBeenCalledTimes(1);
    expect(
      calls.buildConventionsSegment.mock.calls.some(
        (call) => (call[0] as { global?: string | undefined } | undefined)?.global === 'TOAN-CUC-QUY-UOC-LEAK'
      )
    ).toBe(true);
  });

  it('Test 3: standalone skips mention entity grounding and <mentioned_entities>', async () => {
    const mentioned = 'Hãy xem @task:11111111-1111-4111-8111-111111111111 #cr:22222222-2222-4222-8222-222222222222';
    await sendTurn(db, mentioned, true);
    expect(calls.extractMentionedEntityIds).not.toHaveBeenCalled();
    expect(calls.getTask).not.toHaveBeenCalled();
    expect(calls.getChangeRequest).not.toHaveBeenCalled();
    expect(calls.getSystem).not.toHaveBeenCalled();
    expect(calls.buildItemContextPrompt).not.toHaveBeenCalled();
    expect(currentCapture()?.systemPrompt).not.toContain('<mentioned_entities>');

    cleanup();
    vi.clearAllMocks();
    await sendTurn(db, mentioned, false);
    expect(calls.extractMentionedEntityIds).toHaveBeenCalledTimes(1);
    expect(calls.getTask).toHaveBeenCalledTimes(1);
    expect(calls.getChangeRequest).toHaveBeenCalledTimes(1);
    expect(calls.buildItemContextPrompt.mock.calls.filter(
      (call) => (call[0] as { entityType?: string } | undefined)?.entityType !== 'system'
    )).toHaveLength(2);
    expect(currentCapture()?.systemPrompt).toContain('<mentioned_entities>');
  });

  it('Test 4: standalone still runs knowledge/MCP/Graphiti/Oracle/SSH grounding', async () => {
    await sendTurn(db, 'Câu hỏi knowledge', true);
    expect(calls.fetchSetCatalog).toHaveBeenCalled();
    expect(calls.createDefaultGroundedTurnDeps).toHaveBeenCalled();
    expect(calls.discoverGraphitiSqlMcpTools).toHaveBeenCalled();
    expect(calls.discoverGatedMcpTools).toHaveBeenCalled();
    expect(calls.getGraphitiSkillSegment).toHaveBeenCalled();
    expect(calls.getOracleToolConfig).toHaveBeenCalled();
    expect(calls.getSshFsToolConfig).toHaveBeenCalled();
  });

  it('Test 5: standalone drops task actions and callbacks; legacy keeps them', async () => {
    const taskScope = {
      type: 'task' as const,
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Nhiệm vụ kiểm tra',
    };

    await sendTurn(db, 'Câu hỏi không có mention', true, taskScope);
    expect(screen.queryByRole('button', { name: /Lưu vào Sticky Notes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thêm vào Checklist/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chạy với Claude Code/ })).not.toBeInTheDocument();
    expect(calls.updateTask).not.toHaveBeenCalled();
    expect(calls.createNote).not.toHaveBeenCalled();
    expect(calls.launchClaudeTerminal).not.toHaveBeenCalled();

    cleanup();
    vi.clearAllMocks();
    await sendTurn(db, 'Câu hỏi không có mention', false, taskScope);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Lưu vào Sticky Notes/ }).length).toBeGreaterThan(0);
    });
  });

});
