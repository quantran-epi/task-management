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
  afterEach(() => vi.restoreAllMocks());

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
});
