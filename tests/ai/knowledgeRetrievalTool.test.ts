import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeKnowledgeRetrievalTool } from '../../src/services/ai/knowledgeRetrievalTool';

const mocks = vi.hoisted(() => ({ retrieveFederated: vi.fn() }));

vi.mock('../../src/services/knowledge/knowledgeClient', () => ({
  createKnowledgeClient: () => ({ retrieveFederated: mocks.retrieveFederated }),
}));

function dbWithSettings(entries: Record<string, unknown>) {
  return {
    settings: {
      get: async (key: string) =>
        key in entries ? { key, value: entries[key] } : undefined,
    },
  } as any;
}

const enabledDb = () =>
  dbWithSettings({
    knowledge_server_enabled: true,
    knowledge_server_base_url: 'http://127.0.0.1:3001',
    knowledge_server_token: 'token',
  });

describe('executeKnowledgeRetrievalTool', () => {
  beforeEach(() => {
    mocks.retrieveFederated.mockReset();
  });

  it('requires a query string', async () => {
    const res = JSON.parse(await executeKnowledgeRetrievalTool({}, dbWithSettings({})));
    expect(res.error).toMatch(/query/i);
  });

  it('reports unconfigured knowledge server instead of calling it', async () => {
    const db = dbWithSettings({ knowledge_server_enabled: false });
    const res = JSON.parse(await executeKnowledgeRetrievalTool({ query: 'EVT_EVENT' }, db));
    expect(res.error).toMatch(/Knowledge server/i);
  });

  it('forwards the abort signal to retrieveFederated', async () => {
    mocks.retrieveFederated.mockResolvedValue({
      outcome: 'OK',
      items: [],
      paths: [],
      conflictGroups: [],
    });
    const controller = new AbortController();

    await executeKnowledgeRetrievalTool(
      { query: 'EVT_EVENT', setIds: ['set-1'] },
      enabledDb(),
      controller.signal
    );

    expect(mocks.retrieveFederated).toHaveBeenCalledTimes(1);
    expect(mocks.retrieveFederated.mock.calls[0]![1]).toBe(controller.signal);
  });

  it('rejects with AbortError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      executeKnowledgeRetrievalTool(
        { query: 'EVT_EVENT', setIds: ['set-1'] },
        enabledDb(),
        controller.signal
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.retrieveFederated).not.toHaveBeenCalled();
  });

  it('rethrows AbortError raised during retrieval instead of returning an error payload', async () => {
    mocks.retrieveFederated.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await expect(
      executeKnowledgeRetrievalTool(
        { query: 'EVT_EVENT', setIds: ['set-1'] },
        enabledDb(),
        new AbortController().signal
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('keeps non-abort failures as a JSON error payload', async () => {
    mocks.retrieveFederated.mockRejectedValue(new Error('server down'));

    const res = JSON.parse(
      await executeKnowledgeRetrievalTool(
        { query: 'EVT_EVENT', setIds: ['set-1'] },
        enabledDb(),
        new AbortController().signal
      )
    );
    expect(res.error).toMatch(/server down/);
  });
});
