import { describe, it, expect } from 'vitest';
import { executeKnowledgeRetrievalTool } from '../../src/services/ai/knowledgeRetrievalTool';

function dbWithSettings(entries: Record<string, unknown>) {
  return {
    settings: {
      get: async (key: string) =>
        key in entries ? { key, value: entries[key] } : undefined,
    },
  } as any;
}

describe('executeKnowledgeRetrievalTool', () => {
  it('requires a query string', async () => {
    const res = JSON.parse(await executeKnowledgeRetrievalTool({}, dbWithSettings({})));
    expect(res.error).toMatch(/query/i);
  });

  it('reports unconfigured knowledge server instead of calling it', async () => {
    const db = dbWithSettings({ knowledge_server_enabled: false });
    const res = JSON.parse(await executeKnowledgeRetrievalTool({ query: 'EVT_EVENT' }, db));
    expect(res.error).toMatch(/Knowledge server/i);
  });
});
