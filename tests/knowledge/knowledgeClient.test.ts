// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db';
import {
  KnowledgeConfigProvider,
  useKnowledgeConfig,
  validateKnowledgeBaseUrl,
} from '../../src/services/knowledge/knowledgeConfig';
import {
  KnowledgeClientError,
  createKnowledgeClient,
} from '../../src/services/knowledge/knowledgeClient';
import { generateId } from '../../src/utils/uuid';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    attemptId: generateId(),
    setId: generateId(),
    status: 'Publishing',
    startedAt: '2026-10-08T00:00:00.000Z',
    metrics: {
      addedCount: 1,
      changedCount: 0,
      removedCount: 0,
      unchangedCount: 0,
      warningCount: 0,
    },
    ...overrides,
  };
}

describe('knowledge server configuration', () => {
  let dbName: string;
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    dbName = `KnowledgeConfig_${generateId()}`;
    db = new TaskPlannerDatabase(dbName);
    await db.open();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(dbName);
    vi.restoreAllMocks();
  });

  it('allows HTTPS and loopback HTTP only, normalizes one base URL, and warns for loopback', () => {
    expect(validateKnowledgeBaseUrl('https://knowledge.example.com///')).toEqual({
      baseUrl: 'https://knowledge.example.com',
      loopbackHttpWarning: false,
    });
    expect(validateKnowledgeBaseUrl('http://localhost:4100/')).toEqual({
      baseUrl: 'http://localhost:4100',
      loopbackHttpWarning: true,
    });
    expect(validateKnowledgeBaseUrl('http://127.0.0.1:4100')).toMatchObject({
      loopbackHttpWarning: true,
    });
    expect(validateKnowledgeBaseUrl('http://[::1]:4100')).toMatchObject({
      loopbackHttpWarning: true,
    });
    expect(() => validateKnowledgeBaseUrl('http://knowledge.example.com')).toThrow(
      'HTTPS'
    );
    expect(() => validateKnowledgeBaseUrl('https://knowledge.example.com/api/v1')).toThrow(
      'base URL'
    );
  });

  it('persists enabled and safe base URL but clears token on remount without touching browser storage', async () => {
    const localSet = vi.spyOn(Storage.prototype, 'setItem');
    const wrapper = ({ children }: React.PropsWithChildren) =>
      React.createElement(KnowledgeConfigProvider, { db }, children);
    const first = renderHook(() => useKnowledgeConfig(), { wrapper });
    await waitFor(() => expect(first.result.current.ready).toBe(true));

    await act(async () => {
      await first.result.current.savePersistedConfig({
        enabled: true,
        baseUrl: 'https://knowledge.example.com/',
      });
      first.result.current.setToken('secret-session-token');
    });
    expect(first.result.current.token).toBe('secret-session-token');
    expect(localSet).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    expect(await db.settings.get('knowledge_server_token')).toBeUndefined();
    first.unmount();

    const second = renderHook(() => useKnowledgeConfig(), { wrapper });
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current).toMatchObject({
      enabled: true,
      baseUrl: 'https://knowledge.example.com',
      token: '',
    });
  });
});

describe('strict fixed-route knowledge client', () => {
  let dbName: string;
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    dbName = `StrictClient_${generateId()}`;
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(dbName);
    vi.restoreAllMocks();
  });

  it('derives fixed routes and redacts token from bounded errors', async () => {
    const token = 'secret-session-token';
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://knowledge.example.com/api/v1/sets/set-1/snapshot');
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token}`);
      throw new Error(`network exposed ${token}`);
    });
    const client = createKnowledgeClient({
      baseUrl: 'https://knowledge.example.com/',
      token,
      fetcher,
    });

    await expect(client.getSnapshotManifest('set-1')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: expect.not.stringContaining(token),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed remote JSON before cache reconciliation', async () => {
    const reconcile = vi.fn();
    const client = createKnowledgeClient({
      baseUrl: 'https://knowledge.example.com',
      token: 'token',
      fetcher: vi.fn(async () => jsonResponse({ attemptId: 'not-a-uuid' })),
      reconcile,
    });

    await expect(client.getAttempt(generateId())).rejects.toBeInstanceOf(
      KnowledgeClientError
    );
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('poll abort stops observation, preserves Publishing, and records uncertainty', async () => {
    const resource = attempt();
    const reconcile = vi.fn();
    const uncertain = vi.fn();
    const controller = new AbortController();
    const client = createKnowledgeClient({
      baseUrl: 'https://knowledge.example.com',
      token: 'token',
      fetcher: vi.fn(async () => jsonResponse(resource)),
      reconcile,
      markUncertain: uncertain,
      sleep: async () => controller.abort(),
    });

    const result = await client.pollAttempt(resource.attemptId, {
      signal: controller.signal,
    });
    expect(result).toMatchObject({ status: 'Publishing', uncertain: true });
    expect(uncertain).toHaveBeenCalledWith(
      resource.attemptId,
      'Mất kết nối — chưa xác định kết quả'
    );
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('network loss preserves Publishing plus uncertainty while terminal response reconciles', async () => {
    const publishing = attempt();
    const terminal = attempt({
      attemptId: publishing.attemptId,
      setId: publishing.setId,
      status: 'In sync',
      completedAt: '2026-10-08T00:00:02.000Z',
      activeSnapshotId: generateId(),
      metrics: {
        addedCount: 1,
        changedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
        warningCount: 0,
        durationMs: 2000,
      },
    });
    const uncertain = vi.fn();
    const networkClient = createKnowledgeClient({
      baseUrl: 'https://knowledge.example.com',
      token: 'token',
      fetcher: vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(publishing))
        .mockRejectedValueOnce(new Error('offline')),
      reconcile: vi.fn(),
      markUncertain: uncertain,
      sleep: async () => undefined,
    });
    await expect(networkClient.pollAttempt(publishing.attemptId)).resolves.toMatchObject({
      status: 'Publishing',
      uncertain: true,
    });
    expect(uncertain).toHaveBeenCalledOnce();

    const reconcile = vi.fn();
    const terminalClient = createKnowledgeClient({
      baseUrl: 'https://knowledge.example.com',
      token: 'token',
      fetcher: vi.fn(async () => jsonResponse(terminal)),
      reconcile,
    });
    await expect(terminalClient.pollAttempt(terminal.attemptId)).resolves.toMatchObject({
      status: 'In sync',
      uncertain: false,
    });
    expect(reconcile).toHaveBeenCalledOnce();
  });

  it('exposes validated serverCode SNAPSHOT_NOT_FOUND on authoritative 404', async () => {
    const client = createKnowledgeClient({
      baseUrl: 'https://knowledge.example.com',
      token: 'token',
      fetcher: vi.fn(async () =>
        jsonResponse(
          { error: { code: 'SNAPSHOT_NOT_FOUND', message: 'Active snapshot was not found.' } },
          404
        )
      ),
    });

    await expect(client.getSnapshotManifest('set-1')).rejects.toMatchObject({
      code: 'REMOTE_ERROR',
      status: 404,
      serverCode: 'SNAPSHOT_NOT_FOUND',
      message: 'Active snapshot was not found.',
    });
  });

  it('does not expose serverCode for malformed 404 body or arbitrary HTML/JSON', async () => {
    const clientWithMalformedJson = createKnowledgeClient({
      baseUrl: 'https://knowledge.example.com',
      token: 'token',
      fetcher: vi.fn(async () =>
        jsonResponse({ error: 'not-an-envelope' }, 404)
      ),
    });

    const err = await clientWithMalformedJson.getSnapshotManifest('set-1').catch((e) => e);
    expect(err).toBeInstanceOf(KnowledgeClientError);
    expect(err.status).toBe(404);
    expect(err.serverCode).toBeUndefined();
    expect(err.code).toBe('REMOTE_ERROR');
  });

  it('preserves bounded redaction and does not leak token or raw body in error message', async () => {
    const canary = 'SECRET_CANARY_VALUE_123';
    const client = createKnowledgeClient({
      baseUrl: 'https://knowledge.example.com',
      token: canary,
      fetcher: vi.fn(async () =>
        new Response('<html><body>404 Not Found SECRET_CANARY_VALUE_123</body></html>', {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        })
      ),
    });

    const err = await client.getSnapshotManifest('set-1').catch((e) => e);
    expect(err).toBeInstanceOf(KnowledgeClientError);
    expect(err.message).not.toContain(canary);
    expect(err.serverCode).toBeUndefined();
  });

  describe('createPublishAttempt frozen manifest persistence (D-06, D-08, D-10, D-12)', () => {
    it('persists ordered submitted documents before returning accepted attempt', async () => {
      const setId = generateId();
      const docId1 = generateId();
      const docId2 = generateId();
      const hash1 = '1'.repeat(64);
      const hash2 = '2'.repeat(64);

      const snapshot = {
        setId,
        setName: 'Test Set',
        chunkingPolicyVersion: 'v1',
        documents: [
          {
            documentId: docId1,
            title: 'Doc 1',
            body: '# Body 1',
            tags: ['tag1'],
            contentHash: hash1,
            chunks: [],
          },
          {
            documentId: docId2,
            title: 'Doc 2',
            body: '# Body 2',
            tags: ['tag2'],
            contentHash: hash2,
            chunks: [],
          },
        ],
      };

      const serverAttempt = attempt({ setId });
      const reconcile = vi.fn();

      const client = createKnowledgeClient({
        baseUrl: 'https://knowledge.example.com',
        token: 'token',
        fetcher: vi.fn(async () => jsonResponse(serverAttempt, 202)),
        reconcile,
      });

      const res = await client.createPublishAttempt(snapshot, 'attempt-key-1');
      expect(res.attemptId).toBe(serverAttempt.attemptId);

      expect(reconcile).toHaveBeenCalledOnce();
      const reconcileArg = reconcile.mock.calls[0]![0];
      expect(reconcileArg.attempt.id).toBe(serverAttempt.attemptId);
      expect(reconcileArg.attempt.submittedDocuments).toEqual([
        { documentId: docId1, submittedContentHash: hash1 },
        { documentId: docId2, submittedContentHash: hash2 },
      ]);
    });

    it('rejects before cache mutation if server response setId does not match snapshot.setId', async () => {
      const snapshot = {
        setId: generateId(),
        setName: 'Mismatch Set',
        chunkingPolicyVersion: 'v1',
        documents: [],
      };

      const mismatchedAttempt = attempt({ setId: generateId() }); // Different setId!
      const reconcile = vi.fn();

      const client = createKnowledgeClient({
        baseUrl: 'https://knowledge.example.com',
        token: 'token',
        fetcher: vi.fn(async () => jsonResponse(mismatchedAttempt, 202)),
        reconcile,
      });

      await expect(
        client.createPublishAttempt(snapshot, 'attempt-key-mismatch')
      ).rejects.toThrow();

      expect(reconcile).not.toHaveBeenCalled();
    });

    it('rejects if reconcile cache-write fails and does not report accepted attempt', async () => {
      const snapshot = {
        setId: generateId(),
        setName: 'Cache Fail Set',
        chunkingPolicyVersion: 'v1',
        documents: [],
      };

      const serverAttempt = attempt({ setId: snapshot.setId });
      const reconcile = vi.fn().mockRejectedValue(new Error('IndexedDB quota error'));

      const client = createKnowledgeClient({
        baseUrl: 'https://knowledge.example.com',
        token: 'token',
        fetcher: vi.fn(async () => jsonResponse(serverAttempt, 202)),
        reconcile,
      });

      await expect(
        client.createPublishAttempt(snapshot, 'attempt-key-fail')
      ).rejects.toThrow('IndexedDB quota error');
    });

    it('subsequent mutation of local snapshot documents does not change persisted hashes or IDs', async () => {
      const setId = generateId();
      const docId = generateId();
      const hash = 'a'.repeat(64);

      const docObj = {
        documentId: docId,
        title: 'Original Title',
        body: 'Original Body',
        tags: ['original'],
        contentHash: hash,
        chunks: [],
      };

      const snapshot = {
        setId,
        setName: 'Mutate Set',
        chunkingPolicyVersion: 'v1',
        documents: [docObj],
      };

      const serverAttempt = attempt({ setId });
      const reconcile = vi.fn();

      const client = createKnowledgeClient({
        baseUrl: 'https://knowledge.example.com',
        token: 'token',
        fetcher: vi.fn(async () => jsonResponse(serverAttempt, 202)),
        reconcile,
      });

      await client.createPublishAttempt(snapshot, 'attempt-key-mutate');

      // Now mutate local docObj
      docObj.contentHash = 'f'.repeat(64);
      docObj.documentId = generateId();

      const reconcileArg = reconcile.mock.calls[0]![0];
      expect(reconcileArg.attempt.submittedDocuments).toEqual([
        { documentId: docId, submittedContentHash: hash },
      ]);
    });

    it('resumes polling from durable frozen manifest after observer close and post-submit local edit', async () => {
      // POST accepted with hash H1, observer closes, local Note body changes to H2,
      // database/session reopens, poll resumes by attempt ID, daemon reports In sync,
      // and persisted publishedContentHash equals H1 while current local hash H2 yields Local changes.
      const setId = generateId();
      const docId = generateId();
      const h1 = '1'.repeat(64);

      // Create note in db
      await db.notes.put({
        id: docId,
        type: 'document',
        title: 'Doc 1',
        body: 'Initial content',
        tags: [],
        isPinned: false,
        createdAt: '2026-10-08T00:00:00.000Z',
        updatedAt: '2026-10-08T00:00:00.000Z',
      });

      // Create document set
      await db.documentSets.put({
        id: setId,
        name: 'Set 1',
        documentIds: [docId],
        createdAt: '2026-10-08T00:00:00.000Z',
        updatedAt: '2026-10-08T00:00:00.000Z',
      });

      const attemptId = generateId();
      const snapshot = {
        setId,
        setName: 'Set 1',
        chunkingPolicyVersion: 'v1',
        documents: [
          {
            documentId: docId,
            title: 'Doc 1',
            body: 'Initial content',
            tags: [],
            contentHash: h1,
            chunks: [],
          },
        ],
      };

      const serverAttempt = attempt({
        attemptId,
        setId,
        status: 'Publishing',
      });

      const client1 = createKnowledgeClient({
        baseUrl: 'https://knowledge.example.com',
        token: 'token',
        db,
        fetcher: vi.fn(async () => jsonResponse(serverAttempt, 202)),
      });

      // Submit attempt
      await client1.createPublishAttempt(snapshot, 'attempt-key-resume');

      // Observer closes / app reloads: local note body edited to H2!
      await db.notes.update(docId, {
        body: 'Modified local content yielding H2',
        updatedAt: '2026-10-08T00:00:05.000Z',
      });

      // Server now reports terminal In sync with activeSnapshotId
      const activeSnapshotId = generateId();
      const terminalServerAttempt = attempt({
        attemptId,
        setId,
        status: 'In sync',
        completedAt: '2026-10-08T00:00:06.000Z',
        activeSnapshotId,
        metrics: {
          addedCount: 1,
          changedCount: 0,
          removedCount: 0,
          unchangedCount: 0,
          warningCount: 0,
        },
      });

      // New client / session resumes polling by attemptId only
      const client2 = createKnowledgeClient({
        baseUrl: 'https://knowledge.example.com',
        token: 'token',
        db,
        fetcher: vi.fn(async () => jsonResponse(terminalServerAttempt)),
      });

      const pollResult = await client2.pollAttempt(attemptId);
      expect(pollResult.status).toBe('In sync');

      // Check publishedDocuments: persisted hash must be submitted H1, not current H2
      const published = await db.publishedDocuments.get([setId, docId]);
      expect(published).toBeDefined();
      expect(published?.publishedContentHash).toBe(h1);
      expect(published?.activeSnapshotId).toBe(activeSnapshotId);

      // Check document set repo status: current local Note produces 'Local changes'
      const { getDocumentPublishStatuses } = await import('../../src/db/repositories/documentSetRepo');
      const statuses = await getDocumentPublishStatuses([docId], db);
      expect(statuses[docId]?.aggregateState).toBe('Local changes');
    });
  });
});
