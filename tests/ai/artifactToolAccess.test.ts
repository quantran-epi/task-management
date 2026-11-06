import { afterEach, describe, expect, it, vi } from 'vitest';
import { getToolsForTurn } from '../../src/services/ai/chatTurnTools';
import { normalizeToolName } from '../../src/services/ai/aiTools';
import { TaskPlannerDatabase } from '../../src/db';
import { createOrGetThread } from '../../src/db/repositories/chatRepo';
import { createChatTurnRuntime, createDefaultChatTurnDeps } from '../../src/components/ai/runtime/chatTurnRuntime';
import { createSdlcWorkflowCoordinator } from '../../src/services/wizard/workflowCoordinator';
import type { ArtifactToolContext } from '../../src/services/ai/sdlcArtifactTools';

const { stream } = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('../../src/services/ai/nineRouterClient', async (original) => ({
  ...await original<typeof import('../../src/services/ai/nineRouterClient')>(),
  streamChatEvents: (input: unknown) => stream(input),
}));

const names = (analysis: boolean, allowed?: readonly string[]) =>
  getToolsForTurn(analysis, [], allowed).map((tool) => normalizeToolName(tool.function.name));
const ARTIFACTS = ['get_artifact', 'patch_artifact_section'];
let db: TaskPlannerDatabase | undefined;
afterEach(async () => { await db?.delete(); db = undefined; vi.restoreAllMocks(); });

describe('artifact tool advertisement and runtime boundaries', () => {
  it.each([false, true])('hides studio tools from an ordinary no-allowlist caller (analysis %s)', (analysis) => {
    const tools = names(analysis);
    expect(tools).not.toContain('get_artifact');
    expect(tools).not.toContain('patch_artifact_section');
    expect(tools).toContain('query_notes');
    expect(tools.includes('create_task')).toBe(!analysis);
  });

  it('advertises both tools only on explicit studio allowlist with Analysis Mode OFF', () => {
    expect(names(false, ARTIFACTS)).toEqual(ARTIFACTS);
    expect(names(false, [])).toEqual([]);
    expect(names(false, ['get_artifact'])).toEqual(['get_artifact']);
  });

  it('normalizes explicit allowlist wrappers and never reclassifies patch as read-only', () => {
    const allowed = [' proxy_get_artifact_cc ', 'tool_patch_artifact_section_ide'];
    expect(names(false, allowed)).toEqual(ARTIFACTS);
    expect(names(true, allowed)).toEqual(['get_artifact']);
  });

  it.each(['patch_artifact_section', 'proxy_patch_artifact_section_cc', 'tool_patch_artifact_section_ide'])(
    'cancels unsolicited %s in the real loop before any preparation or approval even with Auto-approve', async (name) => {
      db = new TaskPlannerDatabase(`artifact-runtime-access-${crypto.randomUUID()}`);
      const thread = await createOrGetThread({ scopeType: 'global' }, db);
      const preparePatch = vi.fn();
      const onAwaitingApproval = vi.fn();
      const events: string[] = [];
      let round = 0;
      stream.mockImplementation(async function* () {
        if (round++ === 0) {
          yield { type: 'tool_calls', calls: [{ id: 'unsolicited', type: 'function',
            function: { name, arguments: '{}' } }] };
        } else yield { type: 'text', delta: 'Chỉ đọc.' };
      });
      const runtime = createChatTurnRuntime({ ...createDefaultChatTurnDeps(db), preparePatch, onAwaitingApproval,
        onToolEvent: (event) => { if (event.result) events.push(event.result); } });
      const outcome = await runtime.start({ threadId: thread.id, scopeKey: 'global', text: 'Xem dữ liệu',
        analysisMode: true, autoApprove: true, model: 'test', endpoint: 'http://localhost', apiKey: '',
        systemMessages: [], history: [], tools: getToolsForTurn(true, [], ARTIFACTS) });
      expect(outcome.phase).toBe('complete');
      expect(preparePatch).not.toHaveBeenCalled();
      expect(onAwaitingApproval).not.toHaveBeenCalled();
      expect(events).toHaveLength(1);
      expect(JSON.parse(events[0]!)).toEqual({ cancelled: true, message: 'Analysis Mode chỉ đọc; không có dữ liệu nào bị thay đổi.' });
      expect(await db.settings.count()).toBe(0);
    }
  );

  it('active Analysis OFF control prepares a real proposal and waits despite Auto-approve', async () => {
    db = new TaskPlannerDatabase(`artifact-runtime-positive-${crypto.randomUUID()}`);
    const thread = await createOrGetThread({ scopeType: 'global' }, db);
    const coordinator = createSdlcWorkflowCoordinator({ projectId: crypto.randomUUID(), threadId: thread.id });
    await coordinator.startOrUpdateIntake({ cr: 'CR', featureName: 'Test', author: 'T', requestingUnit: 'IT', date: '2026-11-05' }, 'PL01', 'PL02');
    const markdown = '# SOLUTION\n## Mục tiêu\nNội dung gốc.';
    const state = await coordinator.commitSolution(markdown);
    const context: ArtifactToolContext = { scopeKey: 'sdlc:test:cr:SOLUTION', projectId: state.projectId,
      crId: 'cr', stepId: 'SOLUTION', getDraft: () => markdown, getWorkflowState: () => state,
      getAccess: () => ({ readOnly: false, scopeValid: true, crActive: true }) };
    const onAwaitingApproval = vi.fn(() => runtime.resolveApproval(false));
    let round = 0;
    stream.mockImplementation(async function* () {
      if (round++ === 0) yield { type: 'tool_calls', calls: [{ id: 'proposal', type: 'function',
        function: { name: 'patch_artifact_section', arguments: JSON.stringify({ kind: 'SOLUTION', sectionId: '1.1',
          expectedHeading: 'Mục tiêu', baseHash: state.artifacts.solution!.hash, operation: 'append', newContent: 'Dòng mới.' }) } }] };
      else yield { type: 'text', delta: 'Đã từ chối đề xuất.' };
    });
    const runtime = createChatTurnRuntime({ ...createDefaultChatTurnDeps(db), onAwaitingApproval });
    const outcome = await runtime.start({ threadId: thread.id, scopeKey: context.scopeKey, text: 'Đề xuất', analysisMode: false,
      autoApprove: true, model: 'test', endpoint: 'http://localhost', apiKey: '', systemMessages: [], history: [],
      tools: getToolsForTurn(false, [], ARTIFACTS), artifactContext: context });
    expect(outcome.phase).toBe('complete');
    expect(onAwaitingApproval).toHaveBeenCalledOnce();
    expect(onAwaitingApproval.mock.calls[0]).toBeDefined();
    expect(markdown).toBe('# SOLUTION\n## Mục tiêu\nNội dung gốc.');
    expect(await db.settings.count()).toBe(0);
  });
});
