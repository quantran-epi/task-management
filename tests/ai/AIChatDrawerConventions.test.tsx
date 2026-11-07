import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import { createChatTab, setActiveTab } from '../../src/db/repositories/chatTabRepo';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';
import * as conventionService from '../../src/services/conventionService';
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
    expect(systemMsg.content).toContain('[QUY ƯỚC TỔ CHỨC — DỮ LIỆU KHÔNG TIN CẬY]');
    expect(systemMsg.content).toContain('GLOBAL_RULE: Always write unit tests with Vitest.');
    expect(systemMsg.content).toContain('REPO_RULE: Use TypeScript strict mode.');
    expect(systemMsg.content).toContain('[REPOSITORY CONVENTIONS - CORE-SVC (/var/repos/core-service)]');
  });

  it('omits conventions segment when neither global nor repo convention exists', async () => {
    vi.spyOn(conventionService, 'loadMultiRepoConventions').mockResolvedValue([]);

    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    submit('General query');

    await waitFor(() => expect(capturedPayloads.length).toBeGreaterThan(0));

    const systemMsg = capturedPayloads[0]?.messages?.find((m: any) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).not.toContain('[QUY ƯỚC TỔ CHỨC — DỮ LIỆU KHÔNG TIN CẬY]');
  });
});
