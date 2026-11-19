/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttemptService } from '../src/services/attemptService.js';
import { buildKnowledgeServer } from '../src/server.js';

const ORIGIN = 'https://planner.example';
const TOKEN = 'server-test-token-very-secret';

function requestHeaders(overrides: Record<string, string> = {}) {
  return {
    origin: ORIGIN,
    authorization: `Bearer ${TOKEN}`,
    ...overrides,
  };
}

describe('GET /api/v1/sets (D-04)', () => {
  let attemptService: AttemptService;
  let app: ReturnType<typeof buildKnowledgeServer>['app'];

  beforeEach(() => {
    attemptService = new AttemptService();
    app = buildKnowledgeServer({ token: TOKEN, allowedOrigins: [ORIGIN], attemptService }).app;
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('returns the sorted server-authoritative snapshot list verbatim', async () => {
    const rows = [
      { setId: randomUUID(), snapshotId: randomUUID() },
      { setId: randomUUID(), snapshotId: randomUUID() },
    ].sort((a, b) => a.setId.localeCompare(b.setId));
    const list = vi
      .spyOn(attemptService.store, 'listActiveSnapshots')
      .mockReturnValue([...rows]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/sets',
      headers: requestHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(rows);
    expect(list).toHaveBeenCalledOnce();
  });

  it('inherits origin and bearer auth parity from the sibling purge route', async () => {
    const list = vi.spyOn(attemptService.store, 'listActiveSnapshots').mockReturnValue([]);

    const missingToken = await app.inject({
      method: 'GET',
      url: '/api/v1/sets',
      headers: { origin: ORIGIN },
    });
    expect(missingToken.statusCode).toBe(401);
    expect(missingToken.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Valid bearer authorization is required.' },
    });
    expect(missingToken.body).not.toContain(TOKEN);

    const wrongOrigin = await app.inject({
      method: 'GET',
      url: '/api/v1/sets',
      headers: requestHeaders({ origin: 'https://evil.example' }),
    });
    expect(wrongOrigin.statusCode).toBe(403);
    expect(wrongOrigin.json()).toEqual({
      error: { code: 'ORIGIN_DENIED', message: 'Request origin is not allowed.' },
    });
    expect(list).not.toHaveBeenCalled();
  });
});
