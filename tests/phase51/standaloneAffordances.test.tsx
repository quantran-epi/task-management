// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { ScopeChipsBar } from '../../src/components/ai/grounded/ScopeChipsBar';
import { TaskPlannerDatabase } from '../../src/db';
import { generateId } from '../../src/utils/uuid';
import { setGroundedTurnTestHooks, clearGroundedTurnTestHooks } from '../../src/services/ai/groundedTurnDeps';
import { aiDebugService } from '../../src/services/ai/aiDebugService';

const calls = vi.hoisted(() => ({
  buildGlobalContextPrompt: vi.fn(async () => '<global_context>LEAK</global_context>'),
  buildItemContextPrompt: vi.fn(async (_options?: { entityType?: string | undefined }) => '<item_context>TASK-LEAK</item_context>'),
  extractMentionedEntityIds: vi.fn((_text: string) => ({
    taskIds: [] as string[],
    crIds: [] as string[],
    systemIds: [] as string[],
    filePaths: [] as string[],
    docIds: [] as string[],
  })),
  getGlobalConventions: vi.fn(async () => ''),
  buildConventionsSegment: vi.fn((_input?: { global?: string | undefined; repos?: unknown[] | undefined }) => ''),
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
  clearThreadMessages: vi.fn(async () => undefined),
  startTurn: vi.fn((_params?: { systemPrompt?: string | undefined }) => `turn_${Date.now()}`),
  runGroundedTurn: vi.fn(async (input: { query: string }) => {
    calls.captured.push(input.query);
    return { kind: 'operational' as const, routedQuery: input.query };
  }),
  captured: [] as string[],
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
vi.mock('../../src/db/repositories/chatRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db/repositories/chatRepo')>();
  return { ...actual, clearThreadMessages: calls.clearThreadMessages };
});

const lastGroundedQuery = (): string | undefined => calls.captured.at(-1);

async function sendTurn(db: TaskPlannerDatabase, text: string, standalone: boolean): Promise<void> {
  render(
    <AIChatDrawer
      open
      onClose={vi.fn()}
      db={db}
      activeScope={{ type: 'global' }}
      isStandaloneChat={standalone}
    />
  );
  const composer = await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
  fireEvent.change(composer, { target: { value: ` ${text} ` } });
  fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
  await waitFor(() => expect(calls.runGroundedTurn).toHaveBeenCalled(), { timeout: 10000 });
  await waitFor(() => {
    expect(screen.queryByLabelText('Dừng sinh phản hồi')).not.toBeInTheDocument();
  }, { timeout: 10000 });
}

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const LEGACY_ALIASES: Array<[string, string]> = [
  ['/plan', 'Lập kế hoạch công việc hôm nay'],
  ['/status', 'Báo cáo tiến độ hiện tại'],
  ['/overdue', 'Kiểm tra các tác vụ quá hạn'],
  ['/help', 'Hướng dẫn sử dụng trợ lý AI và các lệnh'],
];

describe('phase 51 standalone affordances (WR-02, WR-04)', () => {
  let dbName: string;
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    calls.captured.length = 0;
    localStorage.clear();
    clearGroundedTurnTestHooks();
    vi.spyOn(aiDebugService, 'startTurn').mockImplementation(calls.startTurn);
    setGroundedTurnTestHooks({ runGroundedTurn: calls.runGroundedTurn });
    dbName = `standaloneAffordances_${generateId()}`;
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    cleanup();
    clearGroundedTurnTestHooks();
    vi.restoreAllMocks();
    db.close();
    await Dexie.delete(dbName);
  });

  it('standalone gửi nguyên văn slash alias, legacy vẫn rewrite đúng chuỗi cũ', async () => {
    for (const [alias] of LEGACY_ALIASES) {
      await sendTurn(db, alias, true);
      expect(lastGroundedQuery()).toBe(alias);
      cleanup();
      vi.clearAllMocks();
    }

    for (const [alias, rewritten] of LEGACY_ALIASES) {
      await sendTurn(db, alias, false);
      expect(lastGroundedQuery()).toBe(rewritten);
      cleanup();
      vi.clearAllMocks();
    }
  });

  it('standalone /clear vẫn xóa context, không tạo grounded turn hay debug turn', async () => {
    render(
      <AIChatDrawer
        open
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
        isStandaloneChat
      />
    );
    const composer = await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(composer, { target: { value: '/clear' } });
    await waitFor(() => expect(screen.getByLabelText('Gửi tin nhắn')).toBeEnabled());
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => expect(calls.clearThreadMessages).toHaveBeenCalled());
    expect(calls.runGroundedTurn).not.toHaveBeenCalled();
    expect(calls.startTurn).not.toHaveBeenCalled();
  });

  it('ScopeChipsBar readOnly=false giữ chip tương tác và edit icon', async () => {
    const onEditScope = vi.fn();
    render(
      <ScopeChipsBar
        routedScope={{ domain: 'Khoa học dữ liệu', environment: 'production' }}
        onEditScope={onEditScope}
      />
    );

    const chip = screen.getByText('Khoa học dữ liệu').closest('.ant-tag');
    expect(chip).toHaveAttribute('role', 'button');
    expect(chip).toHaveAttribute('tabindex', '0');
    expect((chip as HTMLElement).style.cursor).toBe('pointer');
    expect(screen.getByLabelText('Chỉnh sửa phạm vi tra cứu')).toBeInTheDocument();

    fireEvent.click(chip!);
    expect(onEditScope).toHaveBeenCalledTimes(1);
  });

  it('ScopeChipsBar readOnly=true render chip thụ động, không edit icon', () => {
    const onEditScope = vi.fn();
    const { container } = render(
      <ScopeChipsBar
        routedScope={{ domain: 'Khoa học dữ liệu', environment: 'production' }}
        onEditScope={onEditScope}
        readOnly
      />
    );

    const chips = container.querySelectorAll('.ant-tag');
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of Array.from(chips)) {
      expect(chip.getAttribute('role')).toBeNull();
      expect(chip.getAttribute('tabindex')).toBeNull();
      expect((chip as HTMLElement).style.cursor).toBe('default');
    }
    expect(screen.queryByLabelText('Chỉnh sửa phạm vi tra cứu')).not.toBeInTheDocument();

    fireEvent.click(chips[0]!);
    expect(onEditScope).not.toHaveBeenCalled();
  });

  it('AIChatDrawer gate ScopePickerModal theo standalone', () => {
    const source = readSource('src/components/ai/AIChatDrawer.tsx');
    expect(source).toMatch(/\{!isStandaloneChat && \(\s*<ScopePickerModal/);
    expect(source).toMatch(/readOnly=\{isStandaloneChat\}/);
  });
});
