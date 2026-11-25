// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen } from '@testing-library/react';
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

const LEGACY_TASK_QUICK_PROMPTS = [
  'Lập kế hoạch hôm nay',
  'Báo cáo tiến độ',
  'Tác vụ quá hạn',
  'Hướng dẫn sử dụng',
];
const LEGACY_EMPTY_HEADING = 'Trợ lý AI TaskMate';
const LEGACY_EMPTY_BODY =
  'Đặt câu hỏi về tác vụ hiện tại, phân tích tiến độ, gợi ý checklist hoặc tra cứu tài liệu đính kèm. Nhập câu hỏi bên dưới để bắt đầu.';

function renderDrawer(db: TaskPlannerDatabase, standalone: boolean): void {
  render(
    <AIChatDrawer
      open
      onClose={vi.fn()}
      db={db}
      activeScope={{ type: 'global' }}
      isStandaloneChat={standalone}
    />
  );
}

describe('phase 51 standalone copy', () => {
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
    dbName = `standaloneCopy_${generateId()}`;
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

  it('Test 1: standalone dùng copy trung tính UI-SPEC, không quick prompt TaskMate', async () => {
    renderDrawer(db, true);

    expect(await screen.findByText('Chưa có hội thoại')).toBeInTheDocument();
    expect(
      screen.getByText('Nhập tin nhắn bên dưới để bắt đầu. Enter để gửi, Shift+Enter để xuống dòng.')
    ).toBeInTheDocument();

    for (const label of LEGACY_TASK_QUICK_PROMPTS) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.queryByText(LEGACY_EMPTY_HEADING)).toBeNull();
    expect(screen.queryByText(LEGACY_EMPTY_BODY)).toBeNull();

    expect(screen.getByText('Giải thích mã')).toBeInTheDocument();
    expect(screen.getByText('Tra cứu tài liệu')).toBeInTheDocument();
  });

  it('Test 2: legacy isStandaloneChat=false giữ nguyên copy và 4 quick prompt gốc', async () => {
    renderDrawer(db, false);

    expect(await screen.findByText(LEGACY_EMPTY_HEADING)).toBeInTheDocument();
    expect(screen.getByText(LEGACY_EMPTY_BODY)).toBeInTheDocument();

    for (const label of LEGACY_TASK_QUICK_PROMPTS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText('Chưa có hội thoại')).toBeNull();
    expect(screen.queryByText('Giải thích mã')).toBeNull();
    expect(screen.queryByText('Tra cứu tài liệu')).toBeNull();
  });
});
