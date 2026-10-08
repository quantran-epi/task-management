/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AttemptService } from '../src/services/attemptService.js';
import { buildKnowledgeServer } from '../src/server.js';

const ORIGIN = 'https://planner.example';
const TOKEN = 'server-test-token-very-secret';
const SET_ID = randomUUID();
const DOCUMENT_ID = randomUUID();

function requestHeaders(overrides: Record<string, string> = {}) {
  return {
    origin: ORIGIN,
    authorization: `Bearer ${TOKEN}`,
    'x-attempt-key': randomUUID(),
    ...overrides,
  };
}

function payload(body = '# Test\n\nSafe body') {
  return {
    setName: 'Pilot set',
    documents: [{ documentId: DOCUMENT_ID, title: 'Pilot', body, tags: ['safe'] }],
  };
}

describe('knowledge server boundary', () => {
  it('fails closed without auth/origin configuration and requires HTTPS for remote binding', () => {
    expect(() => buildKnowledgeServer({ token: '', allowedOrigins: [ORIGIN] })).toThrow();
    expect(() => buildKnowledgeServer({ token: TOKEN, allowedOrigins: [] })).toThrow();
    expect(() =>
      buildKnowledgeServer({ token: TOKEN, allowedOrigins: [ORIGIN], host: '0.0.0.0' })
    ).toThrow(/HTTPS/i);
    expect(
      buildKnowledgeServer({
        token: TOKEN,
        allowedOrigins: [ORIGIN],
        host: '0.0.0.0',
        httpsTerminated: true,
      }).host
    ).toBe('0.0.0.0');
  });

  it('allows only exact configured origins on content routes', async () => {
    const app = buildKnowledgeServer({ token: TOKEN, allowedOrigins: [ORIGIN] }).app;
    for (const origin of [undefined, 'https://evil.example', 'https://sub.planner.example']) {
      const headers = requestHeaders();
      if (origin) headers.origin = origin;
      else delete (headers as Partial<typeof headers>).origin;
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/attempts`,
        headers,
        payload: payload(),
      });
      expect(response.statusCode).toBe(403);
      expect(response.body).not.toContain(TOKEN);
    }

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/sets/${SET_ID}/attempts`,
      headers: requestHeaders(),
      payload: payload(),
    });
    expect(response.statusCode).toBe(202);
    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN);
    await app.close();
  });

  it('rejects missing and wrong bearer tokens without reflection', async () => {
    const app = buildKnowledgeServer({ token: TOKEN, allowedOrigins: [ORIGIN] }).app;
    for (const authorization of [undefined, 'Bearer wrong-secret']) {
      const headers = requestHeaders();
      if (authorization) headers.authorization = authorization;
      else delete (headers as Partial<typeof headers>).authorization;
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/sets/${SET_ID}/snapshot`,
        headers,
      });
      expect(response.statusCode).toBe(401);
      expect(response.body).not.toContain(authorization ?? TOKEN);
    }
    await app.close();
  });

  it('rejects malformed, unexpected, and oversized input before processing', async () => {
    let processed = 0;
    const attemptService = new AttemptService(undefined, {
      beforeDocument: () => {
        processed += 1;
      },
    });
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      bodyLimit: 512,
      attemptService,
    }).app;

    const cases = [
      { headers: requestHeaders(), payload: { ...payload(), unexpected: true } },
      { headers: requestHeaders({ 'x-attempt-key': 'not-a-uuid' }), payload: payload() },
      { headers: requestHeaders(), payload: payload('x'.repeat(1024)) },
    ];
    for (const testCase of cases) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/attempts`,
        ...testCase,
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    }
    expect(processed).toBe(0);
    await app.close();
  });

  it('returns async resources, idempotent replay, conflict, and safe manifests', async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const attemptService = new AttemptService(undefined, { beforeProject: () => blocked });
    const app = buildKnowledgeServer({ token: TOKEN, allowedOrigins: [ORIGIN], attemptService }).app;
    const attemptKey = randomUUID();
    const post = (key: string) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/attempts`,
        headers: requestHeaders({ 'x-attempt-key': key }),
        payload: payload('# Secret-free\n\nContent'),
      });

    const accepted = await post(attemptKey);
    expect(accepted.statusCode).toBe(202);
    const first = accepted.json<{ attemptId: string }>();
    expect((await post(attemptKey)).json()).toMatchObject({ attemptId: first.attemptId });

    const conflict = await post(randomUUID());
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({
      error: { code: 'SET_PUBLISH_IN_PROGRESS', message: expect.any(String) },
    });

    const pending = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${first.attemptId}`,
      headers: requestHeaders(),
    });
    expect(pending.json()).toMatchObject({ attemptId: first.attemptId, status: 'Publishing' });
    expect(pending.body).not.toContain('Content');

    release?.();
    await attemptService.waitForAttempt(first.attemptId);
    const completed = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${first.attemptId}`,
      headers: requestHeaders(),
    });
    expect(completed.json()).toMatchObject({ attemptId: first.attemptId, status: 'In sync' });

    const snapshot = await app.inject({
      method: 'GET',
      url: `/api/v1/sets/${SET_ID}/snapshot`,
      headers: requestHeaders(),
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json()).toMatchObject({
      setId: SET_ID,
      chunkingPolicyVersion: expect.any(String),
      documents: [
        {
          documentId: DOCUMENT_ID,
          contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          chunks: [
            {
              occurrenceId: expect.any(String),
              contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
              startLine: 1,
              endLine: expect.any(Number),
              startOffset: 0,
              endOffset: expect.any(Number),
            },
          ],
        },
      ],
    });
    expect(snapshot.body).not.toContain('Content');
    expect(snapshot.body).not.toContain('rawContent');
    await app.close();
  });

  it('keeps health content-free, exposes no cancel route, and redacts sensitive logs/errors', async () => {
    const logs: string[] = [];
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      logger: { stream: { write: (line: string) => logs.push(line) } },
    }).app;
    const seededSecret = 'seeded-body-secret';

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });

    const bad = await app.inject({
      method: 'POST',
      url: `/api/v1/sets/${SET_ID}/attempts`,
      headers: requestHeaders({ authorization: `Bearer ${TOKEN}` }),
      payload: { ...payload(seededSecret), unexpected: seededSecret },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).not.toContain(TOKEN);
    expect(bad.body).not.toContain(seededSecret);
    expect(bad.body).not.toContain('stack');

    const cancel = await app.inject({
      method: 'DELETE',
      url: `/api/v1/attempts/${randomUUID()}`,
      headers: requestHeaders(),
    });
    expect(cancel.statusCode).toBe(404);

    await app.close();
    const output = logs.join('');
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain(seededSecret);
    expect(output).not.toContain('authorization');
    expect(output).not.toContain('body');
    expect(output).not.toContain('payload');
    expect(output).not.toContain('stack');
  });
});
