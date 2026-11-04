import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { clearThreadMessages, createOrGetThread, saveMessage, getMessagesByThreadId } from '../../src/db/repositories/chatRepo';
import type { ChatMessage, ChatTokenUsage } from '../../src/types/models';
import {
  createChatTurnRuntime,
  type ChatTurnApprovalInfo,
  type ChatTurnRequest,
  type ChatTurnRuntimeDeps,
  type ChatTurnStatus,
} from '../../src/components/ai/runtime/chatTurnRuntime';
import type { AiOrchestratorLoopOptions } from '../../src/services/ai/aiOrchestratorLoop';
import type { ArtifactToolContext } from '../../src/services/ai/sdlcArtifactTools';

const SCOPE_KEY = 'project:11111111-1111-4111-8111-111111111111';

const ARTIFACT_CONTEXT: ArtifactToolContext = {
  scopeKey: 'sdlc:project:cr:SOLUTION',
  projectId: 'p-1',
  crId: 'cr-active',
  stepId: 'SOLUTION',
  getAccess: () => ({ readOnly: false, crActive: true, scopeValid: true }),
  getDraft: () => '# SOLUTION',
};

function makeRequest(overrides: Partial<ChatTurnRequest> = {}): ChatTurnRequest {
  return {
    threadId: '',
    scopeKey: SCOPE_KEY,
    text: 'Xin chào',
    analysisMode: false,
    autoApprove: false,
    model: 'model-x',
    endpoint: 'https://example.invalid/v1',
    apiKey: 'sk-secret-key',
    systemMessages: [{ role: 'system', content: 'Bạn là trợ lý.' }],
    history: [],
    tools: [],
    ...overrides,
  };
}

interface LoopScript {
  (options: AiOrchestratorLoopOptions): Promise<{
    fullResponse: string;
    tokenUsage: ChatTokenUsage;
    truncated?: boolean;
    loopLimitReached?: boolean;
  }>;
}

describe('chatTurnRuntime lifecycle (D-19, D-21, D-22)', () => {
  let db: TaskPlannerDatabase;
  let threadId: string;
  let statuses: ChatTurnStatus[];
  let deltas: string[];
  let errors: { code: string; message: string }[];
  let approvals: ChatTurnApprovalInfo[];
  let completed: { content: string; tokenUsage: ChatTokenUsage }[];

  const runtimeWith = (
    runLoop: LoopScript,
    extra: Partial<ChatTurnRuntimeDeps> = {}
  ) => {
    const deps = {
      runLoop: runLoop as unknown as ChatTurnRuntimeDeps['runLoop'],
      saveMessage,
      describeMutation: async () => 'Cập nhật tác vụ "A"',
      db,
      onStatus: (s: ChatTurnStatus) => statuses.push(s),
      onDelta: (t: string) => deltas.push(t),
      onError: (e: { code: string; message: string }) => errors.push(e),
      onAwaitingApproval: (i: ChatTurnApprovalInfo) => approvals.push(i),
      onCompleted: (m: { content: string; tokenUsage: ChatTokenUsage }) => completed.push(m),
      ...extra,
    } as ChatTurnRuntimeDeps;
    return createChatTurnRuntime(deps);
  };

  const messageRows = async () => getMessagesByThreadId(threadId, db);
  const assistantRows = async (): Promise<ChatMessage[]> =>
    (await messageRows()).filter((m) => m.role === 'assistant');
  const userRows = async (): Promise<ChatMessage[]> =>
    (await messageRows()).filter((m) => m.role === 'user');

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-turn-${Date.now()}-${Math.random()}`);
    const thread = await createOrGetThread({ scopeType: 'project', entityId: 'p-1' }, db);
    threadId = thread.id;
    statuses = [];
    deltas = [];
    errors = [];
    approvals = [];
    completed = [];
  });

  afterEach(async () => {
    await db.delete();
  });

  it.each([undefined, 3, 0, NaN, Infinity, 3.9, 0.5])(
    'keeps tool-limit runtime-only, retains audit, and retries (override %s)', async (maxToolRounds) => {
      const events: unknown[] = [];
      let calls = 0;
      const rounds = maxToolRounds !== undefined && Number.isFinite(maxToolRounds) && maxToolRounds > 0
        ? Math.max(1, Math.floor(maxToolRounds)) : 50;
      const runtime = runtimeWith(async (options) => {
        expect(options.maxLoops).toBe(rounds);
        calls++;
        if (calls > 1) return { fullResponse: 'Complete', tokenUsage: {} };
        options.onTextChunk?.('partial secret-provider-detail');
        options.onToolCall?.({ id: 'audit', name: 'query_notes', args: {} });
        options.onToolResult?.('audit', '{"found":true}', 4);
        return { fullResponse: 'partial secret-provider-detail', tokenUsage: {}, loopLimitReached: true };
      }, { onToolEvent: (event) => events.push(event) });
      expect(runtime.getToolLimitRounds()).toBeNull();
      const first = await runtime.start(makeRequest({ threadId,
        ...(maxToolRounds !== undefined ? { maxToolRounds } : {}) }));
      expect(first.phase).toBe('tool-limit');
      expect(first.error?.code).toBe('tool_limit');
      expect(first.error?.message).toContain(`sau ${rounds} vòng`);
      expect(first.error?.message).not.toContain('secret-provider-detail');
      expect(first.content).toBeUndefined();
      expect(runtime.getStatus()).toBe('tool-limit');
      expect(runtime.getToolLimitRounds()).toBe(rounds);
      expect(runtime.isRunning()).toBe(false);
      expect(events).toHaveLength(2);
      expect(errors).toEqual([]);
      expect(completed).toEqual([]);
      expect(await assistantRows()).toHaveLength(0);
      expect(await userRows()).toHaveLength(1);
      const second = await runtime.retry();
      expect(second.phase).toBe('complete');
      expect(second.userMessageId).toBe(first.userMessageId);
      expect(runtime.getToolLimitRounds()).toBeNull();
      expect(await userRows()).toHaveLength(1);
      expect(await assistantRows()).toHaveLength(1);
    },
  );

  it('publishes preparing before the injected saveMessage resolves', async () => {
    let resolveUserRow: ((message: ChatMessage) => void) | undefined;
    let calls = 0;
    const blockedSave = ((input: Parameters<ChatTurnRuntimeDeps['saveMessage']>[0], target: TaskPlannerDatabase) => {
      calls += 1;
      if (calls > 1) return saveMessage(input, target);
      return new Promise<ChatMessage>((resolve) => {
        resolveUserRow = resolve;
      });
    }) as unknown as ChatTurnRuntimeDeps['saveMessage'];

    const runtime = runtimeWith(
      async () => ({ fullResponse: 'ok', tokenUsage: {} }),
      { saveMessage: blockedSave }
    );

    const pending = runtime.start(makeRequest({ threadId }));
    expect(statuses).toEqual(['preparing']);
    expect(runtime.getStatus()).toBe('preparing');

    resolveUserRow?.({
      id: 'user-row-1',
      threadId,
      role: 'user',
      content: 'Xin chào',
      createdAt: new Date().toISOString(),
    });
    await pending;
    expect(statuses).toEqual(['preparing', 'complete']);
  });

  it('moves through preparing, streaming, tool, synthesizing, complete', async () => {
    const runtime = runtimeWith(async (options) => {
      options.onTextChunk?.('hello');
      options.onToolCall?.({ id: 'call-1', name: 'query_tasks', args: {} });
      options.onToolResult?.('call-1', '{"items":[]}', 12);
      options.onStatusChange?.('Đang tổng hợp câu trả lời hoàn chỉnh...');
      return { fullResponse: 'hello', tokenUsage: { totalTokens: 3 } };
    });

    const outcome = await runtime.start(makeRequest({ threadId }));

    expect(outcome.phase).toBe('complete');
    expect(statuses).toEqual(['preparing', 'streaming', 'tool', 'synthesizing', 'complete']);
  });

  it('cancels mutations in Analysis Mode without consulting autoApprove or awaiting approval', async () => {
    let checkedResult: { proceed: boolean; cancellationResult?: string } | undefined;
    const runtime = runtimeWith(async (options) => {
      checkedResult = await options.onMutationCheck?.('update_task', { id: 't-1' });
      return { fullResponse: 'cancelled turn', tokenUsage: {} };
    });

    await runtime.start(makeRequest({ threadId, analysisMode: true, autoApprove: false }));

    expect(checkedResult?.proceed).toBe(false);
    expect(checkedResult?.cancellationResult).toContain('Analysis Mode');
    expect(statuses).not.toContain('awaiting-approval');
    expect(approvals).toHaveLength(0);
  });

  it('proceeds with autoApprove and never publishes awaiting-approval', async () => {
    let checkedResult: { proceed: boolean } | undefined;
    const runtime = runtimeWith(async (options) => {
      checkedResult = await options.onMutationCheck?.('update_task', { id: 't-1' });
      return { fullResponse: 'updated', tokenUsage: {} };
    });

    await runtime.start(makeRequest({ threadId, autoApprove: true }));

    expect(checkedResult?.proceed).toBe(true);
    expect(statuses).not.toContain('awaiting-approval');
  });

  it('waits on explicit approval, resumes on approve, and persists nothing on reject', async () => {
    let checkedResult: { proceed: boolean; cancellationResult?: string } | undefined;

    const approveRuntime = runtimeWith(async (options) => {
      checkedResult = await options.onMutationCheck?.('update_task', { id: 't-1' });
      return { fullResponse: 'đã cập nhật', tokenUsage: {} };
    });
    const approveTurn = approveRuntime.start(makeRequest({ threadId }));
    await waitForStatus(() => statuses.includes('awaiting-approval'));
    expect(approvals[0]).toEqual({ toolName: 'update_task', summary: 'Cập nhật tác vụ "A"' });
    approveRuntime.resolveApproval(true);
    await approveTurn;
    expect(checkedResult?.proceed).toBe(true);
    expect(await assistantRows()).toHaveLength(1);

    statuses = [];
    deltas = [];
    const rejectRuntime = runtimeWith(async (options) => {
      checkedResult = await options.onMutationCheck?.('update_task', { id: 't-1' });
      return { fullResponse: 'đã cập nhật', tokenUsage: {} };
    });
    const rejectTurn = rejectRuntime.start(makeRequest({ threadId, text: 'Lần hai' }));
    await waitForStatus(() => statuses.includes('awaiting-approval'));
    rejectRuntime.resolveApproval(false);
    const outcome = await rejectTurn;
    expect(outcome.phase).toBe('cancelled');
    expect(outcome.cancellationResult).toContain('từ chối');
    expect(checkedResult?.proceed).toBe(false);
    expect(await assistantRows()).toHaveLength(1);
  });

  it('aborting mid-stream persists no assistant message and leaves existing messages untouched', async () => {
    const existing = await saveMessage(
      { threadId, role: 'user', content: 'tin nhắn cũ' },
      db
    );
    const before = await messageRows();

    const runtime = runtimeWith(async (options) => {
      options.onTextChunk?.('partial ');
      return await new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }) as never;
    });

    const turn = runtime.start(makeRequest({ threadId }));
    await waitForStatus(() => statuses.includes('streaming'));
    runtime.abort();
    const outcome = await turn;

    expect(outcome.phase).toBe('aborted');
    expect(await assistantRows()).toHaveLength(0);
    const after = await messageRows();
    expect(after.find((m) => m.id === existing.id)?.content).toBe('tin nhắn cũ');
    expect(after).toHaveLength(before.length + 1); // only the new user row
  });

  it.each(['user', 'assistant'] as const)('clear chờ save %s đang chạy trước khi xóa', async (role) => {
    let release!: () => void;
    let started = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const runtime = runtimeWith(async () => ({ fullResponse: 'Cũ', tokenUsage: {} }), {
      saveMessage: async (input, target) => {
        if (input.role === role) { started = true; await gate; }
        return saveMessage(input, target);
      },
    });
    const pending = runtime.start(makeRequest({ threadId }));
    await waitForStatus(() => started);
    runtime.abort();
    let cleared = false;
    const clear = runtime.drainPersistence().then(async () => {
      await clearThreadMessages(threadId, db);
      cleared = true;
    });
    await Promise.resolve();
    expect(cleared).toBe(false);
    release();
    await clear;
    expect((await pending).phase).toBe('aborted');
    expect(await messageRows()).toEqual([]);
    expect(completed).toEqual([]);
  });

  it('clear không chờ provider và bỏ reply đến muộn', async () => {
    let release!: () => void;
    let started = false;
    const runtime = runtimeWith(async (options) => {
      started = true;
      await new Promise<void>((resolve) => { release = resolve; });
      options.onTextChunk?.('Muộn');
      return { fullResponse: 'Muộn', tokenUsage: {} };
    });
    const pending = runtime.start(makeRequest({ threadId }));
    await waitForStatus(() => started);
    runtime.abort();
    await runtime.drainPersistence();
    await clearThreadMessages(threadId, db);
    release();
    expect((await pending).phase).toBe('aborted');
    expect(await messageRows()).toEqual([]);
    expect(deltas).toEqual([]);
  });

  it('sanitizes provider errors into a fixed message with no key, auth header or stack', async () => {
    const runtime = runtimeWith(async (options) => {
      void options;
      const err = new Error(
        'Authorization: Bearer sk-secret-key apiKey=sk-secret-key\n    at streamChatEvents (x.ts:1:1)'
      );
      throw err;
    });

    const outcome = await runtime.start(makeRequest({ threadId }));

    expect(outcome.phase).toBe('error');
    expect(runtime.getStatus()).toBe('error');
    expect(errors).toHaveLength(1);
    const message = errors[0]?.message ?? '';
    expect(message).not.toContain('sk-secret-key');
    expect(message).not.toContain('Authorization');
    expect(message).not.toContain('at streamChatEvents');
    expect(message).toContain('Thử lại');
  });

  it('retry after an error reuses the original user message id', async () => {
    let call = 0;
    const runtime = runtimeWith(async () => {
      call += 1;
      if (call === 1) throw new Error('boom');
      return { fullResponse: 'thành công', tokenUsage: {} };
    });

    const first = await runtime.start(makeRequest({ threadId }));
    expect(first.phase).toBe('error');
    expect(await userRows()).toHaveLength(1);

    const second = await runtime.retry();
    expect(second.phase).toBe('complete');
    expect(second.userMessageId).toBe(first.userMessageId);
    expect(await userRows()).toHaveLength(1);
  });

  it('forwards maxTokens unchanged through start and retry', async () => {
    const limits: number[] = [];
    const runtime = runtimeWith(async (options) => {
      limits.push(options.maxTokens!);
      return { fullResponse: 'partial', tokenUsage: {}, truncated: true };
    });
    const first = await runtime.start(makeRequest({ threadId, maxTokens: 2048 }));
    const retry = await runtime.retry();
    expect(limits).toEqual([2048, 2048]);
    expect(retry.userMessageId).toBe(first.userMessageId);
    expect(await userRows()).toHaveLength(1);
    expect(await assistantRows()).toHaveLength(0);
  });

  it('omits own maxTokens key when unset on start and retry', async () => {
    const seen: AiOrchestratorLoopOptions[] = [];
    const runtime = runtimeWith(async (options) => {
      seen.push(options);
      return { fullResponse: 'partial', tokenUsage: {}, truncated: true };
    });
    await runtime.start(makeRequest({ threadId }));
    await runtime.retry();
    expect(seen).toHaveLength(2);
    for (const options of seen) expect(Object.hasOwn(options, 'maxTokens')).toBe(false);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('does not forward invalid maxTokens %s', async (maxTokens) => {
    const runtime = runtimeWith(async (options) => {
      expect(Object.hasOwn(options, 'maxTokens')).toBe(false);
      return { fullResponse: 'ok', tokenUsage: {} };
    });
    expect((await runtime.start(makeRequest({ threadId, maxTokens }))).phase).toBe('complete');
  });

  it('rejects truncated output before persistence and retries original user identity', async () => {
    const existing = await saveMessage({ threadId, role: 'assistant', content: 'Approved content' }, db);
    let calls = 0;
    const runtime = runtimeWith(async (options) => {
      calls += 1;
      if (calls === 1) {
        options.onTextChunk?.('partial Authorization: Bearer sk-secret-key');
        return {
          fullResponse: 'partial Authorization: Bearer sk-secret-key\n    at provider.ts:1',
          tokenUsage: { totalTokens: 12 },
          truncated: true,
        };
      }
      return { fullResponse: 'Complete answer', tokenUsage: {}, truncated: false };
    });

    const first = await runtime.start(makeRequest({ threadId }));
    expect(first.phase).toBe('error');
    expect(first.content).toBeUndefined();
    expect(first.error?.code).toBe('truncated');
    expect(runtime.getStatus()).toBe('error');
    expect(runtime.isRunning()).toBe(false);
    expect(errors).toEqual([first.error]);
    expect(first.error?.message).toContain('giới hạn độ dài');
    expect(first.error?.message).toContain('không được lưu');
    expect(first.error?.message).toContain('Thử lại');
    expect(first.error?.message).not.toMatch(/sk-secret-key|Authorization|provider\.ts/);
    expect(await assistantRows()).toEqual([existing]);
    expect(completed).toHaveLength(0);

    const retry = await runtime.retry();
    expect(retry.phase).toBe('complete');
    expect(retry.userMessageId).toBe(first.userMessageId);
    expect(await userRows()).toHaveLength(1);
    expect((await assistantRows()).map((row) => row.content)).toEqual(['Approved content', 'Complete answer']);
    expect(completed).toHaveLength(1);
  });

  it('keeps abort precedence over a truncated result', async () => {
    const runtime = runtimeWith(async () => {
      runtime.abort();
      return { fullResponse: 'partial', tokenUsage: {}, truncated: true };
    });
    expect((await runtime.start(makeRequest({ threadId }))).phase).toBe('aborted');
    expect(errors).toHaveLength(0);
    expect(await assistantRows()).toHaveLength(0);
  });

  it('keeps mutation-decline precedence over a truncated result', async () => {
    const runtime = runtimeWith(async (options) => {
      await options.onMutationCheck?.('update_task', { id: 't-1' });
      return { fullResponse: 'partial', tokenUsage: {}, truncated: true };
    });
    const pending = runtime.start(makeRequest({ threadId }));
    await waitForStatus(() => statuses.includes('awaiting-approval'));
    runtime.resolveApproval(false);
    expect((await pending).phase).toBe('cancelled');
    expect(errors).toHaveLength(0);
    expect(await assistantRows()).toHaveLength(0);
  });

  it('prepares the artifact patch before awaiting approval and forwards the real diff payload', async () => {
    const proposal = {
      proposalId: 'proposal-1',
      scopeKey: SCOPE_KEY,
      projectId: 'p-1',
      crId: 'cr-active',
      kind: 'SOLUTION' as const,
      version: 3,
      sectionId: '1.2',
      sectionTitle: 'Ki\xe1\xba\xbfn tr\xc3\xbac',
      baseHash: 'a'.repeat(64),
      baseMarkdown: '# SOLUTION',
      diffText: '@@ -1,1 +1,2 @@\n N\xe1\xbb\x99i dung\n+D\xc3\xb2ng m\xe1\xbb\x9bi',
      addedLines: 1,
      removedLines: 0,
      patchedMarkdown: '# SOLUTION\nD\xc3\xb2ng m\xe1\xbb\x9bi',
    };
    const preparePatch = vi.fn().mockResolvedValue(proposal);
    const approveRuntime = runtimeWith(
      async (options) => {
        await options.onMutationCheck?.('patch_artifact_section', { sectionId: '1.2' });
        return { fullResponse: 'ok', tokenUsage: {} };
      },
      { preparePatch }
    );
    const turn = approveRuntime.start(makeRequest({ artifactContext: ARTIFACT_CONTEXT, threadId }));
    await waitForStatus(() => statuses.includes('awaiting-approval'));
    expect(preparePatch).toHaveBeenCalledTimes(1);
    expect(approvals[0]?.patch).toEqual(proposal);
    approveRuntime.resolveApproval(true);
    expect((await turn).phase).toBe('complete');
  });

  it('never lets autoApprove bypass an artifact patch decision', async () => {
    const preparePatch = vi.fn().mockResolvedValue({
      proposalId: 'proposal-2',
      scopeKey: SCOPE_KEY,
      projectId: 'p-1',
      crId: 'cr-active',
      kind: 'SOLUTION' as const,
      version: 1,
      sectionId: '1',
      sectionTitle: 'SOLUTION',
      baseHash: 'b'.repeat(64),
      baseMarkdown: '# SOLUTION',
      diffText: '@@ -1,1 +1,2 @@\n # SOLUTION\n+x',
      addedLines: 1,
      removedLines: 0,
      patchedMarkdown: '# SOLUTION\nx',
    });
    const runtime = runtimeWith(
      async (options) => {
        await options.onMutationCheck?.('patch_artifact_section', { sectionId: '1' });
        return { fullResponse: 'ok', tokenUsage: {} };
      },
      { preparePatch }
    );
    const turn = runtime.start(makeRequest({ artifactContext: ARTIFACT_CONTEXT, threadId, autoApprove: true }));
    await waitForStatus(() => statuses.includes('awaiting-approval'));
    runtime.resolveApproval(true);
    expect((await turn).phase).toBe('complete');
  });

  it('keeps ordinary mutation auto-approve unchanged while artifact patches still wait', async () => {
    let checked: { proceed: boolean } | undefined;
    const runtime = runtimeWith(
      async (options) => {
        checked = await options.onMutationCheck?.('update_task', { id: 't-1' });
        return { fullResponse: 'ok', tokenUsage: {} };
      },
      { preparePatch: vi.fn() }
    );
    await runtime.start(makeRequest({ threadId, autoApprove: true }));
    expect(checked?.proceed).toBe(true);
    expect(statuses).not.toContain('awaiting-approval');
  });

  it('returns a prepared refusal immediately as the tool result without parking', async () => {
    const refusal = { refused: true as const, code: 'SECTION_DRIFT' as const, message: 'da thay doi' };
    let checked: { proceed: boolean; cancellationResult?: string } | undefined;
    const runtime = runtimeWith(
      async (options) => {
        checked = await options.onMutationCheck?.('patch_artifact_section', { sectionId: '1.2' });
        return { fullResponse: 'ok', tokenUsage: {} };
      },
      { preparePatch: vi.fn().mockResolvedValue(refusal) }
    );
    await runtime.start(makeRequest({ threadId, artifactContext: ARTIFACT_CONTEXT }));
    expect(checked?.proceed).toBe(false);
    expect(JSON.parse(checked?.cancellationResult ?? '{}')).toEqual(refusal);
    expect(statuses).not.toContain('awaiting-approval');
  });

  it('parks two patch calls in order and keeps a rejected patch from cancelling later artifacts', async () => {
    const proposals = [1, 2].map((index) => ({
      proposalId: `proposal-${index}`,
      scopeKey: SCOPE_KEY,
      projectId: 'p-1',
      crId: 'cr-active',
      kind: 'SOLUTION' as const,
      version: 1,
      sectionId: `1.${index}`,
      sectionTitle: `Muc ${index}`,
      baseHash: String(index).repeat(64),
      baseMarkdown: '# SOLUTION',
      diffText: `@@ -1,1 +1,2 @@\n # SOLUTION\n+x${index}`,
      addedLines: 1,
      removedLines: 0,
      patchedMarkdown: `# SOLUTION\nx${index}`,
    }));
    const preparePatch = vi.fn()
      .mockResolvedValueOnce(proposals[0])
      .mockResolvedValueOnce(proposals[1]);
    const seen: string[] = [];
    const runtime = runtimeWith(
      async (options) => {
        for (const sectionId of ['1.1', '1.2']) {
          const result = await options.onMutationCheck?.('patch_artifact_section', { sectionId });
          seen.push(result?.proceed ? 'proceed' : 'cancel');
        }
        return { fullResponse: 'sau khi xu ly', tokenUsage: {} };
      },
      {
        preparePatch,
        onAwaitingApproval: (info: ChatTurnApprovalInfo) => approvals.push(info),
      }
    );
    const turn = runtime.start(makeRequest({ threadId, artifactContext: ARTIFACT_CONTEXT }));
    await waitForStatus(() => approvals.length === 1);
    runtime.resolveApproval(false);
    await waitForStatus(() => approvals.length === 2);
    runtime.resolveApproval(true);
    const outcome = await turn;

    expect(seen).toEqual(['cancel', 'proceed']);
    expect(approvals.map((entry) => entry.patch?.proposalId)).toEqual(['proposal-1', 'proposal-2']);
    expect(outcome.phase).toBe('complete');
    expect(await assistantRows()).toHaveLength(1);
  });

  it('abort releases a parked patch turn', async () => {
    const runtime = runtimeWith(
      async (options) => {
        await options.onMutationCheck?.('patch_artifact_section', { sectionId: '1.2' });
        return { fullResponse: 'never', tokenUsage: {} };
      },
      {
        preparePatch: vi.fn().mockResolvedValue({
          proposalId: 'proposal-abort',
          scopeKey: SCOPE_KEY,
          projectId: 'p-1',
          crId: 'cr-active',
          kind: 'SOLUTION' as const,
          version: 1,
          sectionId: '1.2',
          sectionTitle: 'Muc',
          baseHash: 'c'.repeat(64),
          baseMarkdown: '# SOLUTION',
          diffText: '@@ -1,1 +1,2 @@\n # SOLUTION\n+x',
          addedLines: 1,
          removedLines: 0,
          patchedMarkdown: '# SOLUTION\nx',
        }),
      }
    );
    const turn = runtime.start(makeRequest({ threadId, artifactContext: ARTIFACT_CONTEXT }));
    await waitForStatus(() => statuses.includes('awaiting-approval'));
    runtime.abort();
    expect((await turn).phase).toBe('aborted');
    expect(await assistantRows()).toHaveLength(0);
  });

  it('describes an approved patch and returns the cached proposal instead of recomputing', async () => {
    const proposal = {
      proposalId: 'proposal-cached',
      scopeKey: SCOPE_KEY,
      projectId: 'p-1',
      crId: 'cr-active',
      kind: 'SOLUTION' as const,
      version: 2,
      sectionId: '1.1',
      sectionTitle: 'Muc tieu',
      baseHash: 'd'.repeat(64),
      baseMarkdown: '# SOLUTION',
      diffText: '@@ -1,1 +1,2 @@\n # SOLUTION\n+x',
      addedLines: 1,
      removedLines: 0,
      patchedMarkdown: '# SOLUTION\nx',
    };
    const returned: string[] = [];
    const runtime = runtimeWith(
      async (options) => {
        options.onToolCall?.({ id: 'call-patch-1', name: 'patch_artifact_section', args: { sectionId: '1.1' } });
        const check = await options.onMutationCheck?.('patch_artifact_section', { sectionId: '1.1' });
        expect(check?.proceed).toBe(true);
        const raw = await options.executeToolFn?.('patch_artifact_section', { sectionId: '1.1' }, db, undefined, undefined);
        returned.push(raw ?? '');
        return { fullResponse: 'done', tokenUsage: {} };
      },
      { preparePatch: vi.fn().mockResolvedValue(proposal) }
    );
    const turn = runtime.start(makeRequest({ threadId, artifactContext: ARTIFACT_CONTEXT }));
    await waitForStatus(() => statuses.includes('awaiting-approval'));
    runtime.resolveApproval(true);
    await turn;
    expect(returned).toHaveLength(1);
    expect(JSON.parse(returned[0]!)).toEqual(proposal);
  });

  it('still cancels unsolicited patch calls in Analysis Mode with the existing read-only result', async () => {
    let checked: { proceed: boolean; cancellationResult?: string } | undefined;
    const preparePatch = vi.fn();
    const runtime = runtimeWith(
      async (options) => {
        checked = await options.onMutationCheck?.('patch_artifact_section', { sectionId: '1.1' });
        return { fullResponse: 'read only', tokenUsage: {} };
      },
      { preparePatch }
    );
    await runtime.start(makeRequest({ threadId, analysisMode: true, artifactContext: ARTIFACT_CONTEXT }));
    expect(checked?.proceed).toBe(false);
    expect(checked?.cancellationResult).toContain('Analysis Mode');
    expect(preparePatch).not.toHaveBeenCalled();
    expect(statuses).not.toContain('awaiting-approval');
  });

  it('rejects a second concurrent start with TURN_IN_PROGRESS and writes no message', async () => {
    const gate: { release?: () => void } = {};
    const runtime = runtimeWith(async (options) => {
      options.onTextChunk?.('x');
      await new Promise<void>((resolve) => {
        gate.release = resolve;
      });
      return { fullResponse: 'x', tokenUsage: {} };
    });

    const first = runtime.start(makeRequest({ threadId }));
    await waitForStatus(() => statuses.includes('streaming'));
    const rowsBeforeSecond = await messageRows();

    await expect(runtime.start(makeRequest({ threadId, text: 'lần hai' }))).rejects.toThrow(
      'TURN_IN_PROGRESS'
    );
    expect(await messageRows()).toHaveLength(rowsBeforeSecond.length);

    gate.release?.();
    await first;
  });

  it('persists exactly one assistant message with stripped content and accumulated usage', async () => {
    const runtime = runtimeWith(async (options) => {
      const usage: ChatTokenUsage = {};
      options.onUsage?.({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
      options.onUsage?.({ promptTokens: 2, completionTokens: 3, totalTokens: 5 });
      usage.promptTokens = 12;
      usage.completionTokens = 8;
      usage.totalTokens = 20;
      options.onTextChunk?.('Câu trả lời');
      return {
        fullResponse: '<thinking>suy luận nội bộ</thinking>Câu trả lời',
        tokenUsage: usage,
      };
    });

    const outcome = await runtime.start(makeRequest({ threadId }));
    expect(outcome.phase).toBe('complete');

    const assistants = await assistantRows();
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.content).toBe('Câu trả lời');
    expect(assistants[0]?.content).not.toContain('suy luận nội bộ');
    expect(assistants[0]?.tokenUsage).toEqual({
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
    });
    expect(completed).toHaveLength(1);
    expect(deltas.join('')).toContain('Câu trả lời');
  });
});

async function waitForStatus(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitForStatus timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
