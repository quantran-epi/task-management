import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import type { Note } from '../../src/types/models';
import {
  clearNineRouterMemoryCache,
  DEFAULT_NINEROUTER_ENDPOINT,
} from '../../src/services/ai/nineRouterTokenService';
import { createSdlcWizardRuntime } from '../../src/services/wizard/sdlcWizardRuntime';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const SDLC_SET_ID = '33333333-3333-4333-8333-333333333333';
const BASE_SET_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_SET_ID = '55555555-5555-4555-8555-555555555555';
const NOTE_ID = '66666666-6666-4666-8666-666666666666';
const NOW = '2026-11-01T12:00:00.000Z';

const evidenceInput = (setIds: readonly string[]) => ({
  changeRequestId: PROJECT_ID,
  threadId: '77777777-7777-4777-8777-777777777777',
  sessionId: '88888888-8888-4888-8888-888888888888',
  inputRevision: 1,
  query: 'CR-25001 chuyển tiền nhanh PL03B',
  resolvedSetIds: setIds,
});

const note: Note = {
  id: NOTE_ID,
  type: 'document',
  entityType: 'cr',
  entityId: PROJECT_ID,
  title: 'SOLUTION v1',
  body: '# SOLUTION\n\nChuyển tiền nhanh qua Napas 247.',
  isPinned: false,
  createdAt: NOW,
  updatedAt: NOW,
};

async function seedRouterConfig(db: TaskPlannerDatabase) {
  await db.settings.put({ key: 'ninerouter_endpoint', value: 'http://127.0.0.1:20128/v1' });
  await db.settings.put({ key: 'ninerouter_default_model', value: 'model-from-settings' });
  await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-persisted' });
}

let db: TaskPlannerDatabase;

beforeEach(async () => {
  clearNineRouterMemoryCache();
  db = new TaskPlannerDatabase(`sdlc-wizard-runtime-${Date.now()}-${Math.random()}`);
  await db.open();
});

afterEach(async () => {
  clearNineRouterMemoryCache();
  await db.delete();
});

describe('createSdlcWizardRuntime (D-14, D-15)', () => {
  it('mirrors the persisted router settings and never falls back to build-time env', async () => {
    await seedRouterConfig(db);
    const runtime = await createSdlcWizardRuntime({ db });

    expect(runtime.model.endpoint).toBe('http://127.0.0.1:20128/v1');
    expect(runtime.model.model).toBe('model-from-settings');
    expect(runtime.model.apiKey).toBe('sk-persisted');
  });

  it('throws WIZARD_MODEL_UNCONFIGURED when no model settings exist', async () => {
    await expect(createSdlcWizardRuntime({ db })).rejects.toMatchObject({
      code: 'WIZARD_MODEL_UNCONFIGURED',
    });
  });

  it('resolves real set ids for the project instead of returning an empty scope', async () => {
    await seedRouterConfig(db);
    await db.documentSets.add({
      id: SDLC_SET_ID,
      name: 'SDLC artifacts',
      documentIds: [],
      createdAt: NOW,
      updatedAt: NOW,
      sdlc: { changeRequestId: PROJECT_ID, purpose: 'sdlc' },
    });
    await db.documentSets.add({
      id: BASE_SET_ID,
      name: 'Baseline knowledge',
      documentIds: [],
      isBase: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.documentSets.add({
      id: OTHER_SET_ID,
      name: "Other project's set",
      documentIds: [],
      createdAt: NOW,
      updatedAt: NOW,
      sdlc: { changeRequestId: OTHER_PROJECT_ID, purpose: 'sdlc' },
    });

    const runtime = await createSdlcWizardRuntime({ db });
    const setIds = await runtime.resolveSetIds(PROJECT_ID);

    expect(setIds).toEqual([SDLC_SET_ID, BASE_SET_ID]);
  });

  it('reports EMPTY_SCOPE with no sets and grounds local BM25 on the resolved ids', async () => {
    await seedRouterConfig(db);
    const runtime = await createSdlcWizardRuntime({ db });

    const empty = await runtime.collectEvidence(evidenceInput(await runtime.resolveSetIds(PROJECT_ID)));
    expect(empty.coverage).toBe('EMPTY_SCOPE');
    expect(empty.items).toEqual([]);

    await db.notes.add(note);
    await db.documentSets.add({
      id: SDLC_SET_ID,
      name: 'SDLC artifacts',
      documentIds: [NOTE_ID],
      createdAt: NOW,
      updatedAt: NOW,
      sdlc: { changeRequestId: PROJECT_ID, purpose: 'sdlc' },
    });

    const setIds = await runtime.resolveSetIds(PROJECT_ID);
    expect(setIds).toEqual([SDLC_SET_ID]);

    const grounded = await runtime.collectEvidence(evidenceInput(setIds));
    // No remote/MCP seam is wired, so local-only grounding is reported as PARTIAL, not COMPLETE.
    expect(grounded.coverage).toBe('PARTIAL');
    expect(grounded.items.length).toBeGreaterThan(0);
    expect(grounded.items[0]?.documentId).toBe(NOTE_ID);
    expect(grounded.items[0]?.source).toBe('local');
    // Markdown was unwrapped from any artifact envelope, so the excerpt is not raw JSON.
    expect(grounded.items[0]?.excerpt).not.toContain('exportPayload');
  });

  it('degrades to local-only evidence when no knowledge server is configured', async () => {
    await seedRouterConfig(db);
    await db.notes.add(note);
    await db.documentSets.add({
      id: SDLC_SET_ID,
      name: 'SDLC artifacts',
      documentIds: [NOTE_ID],
      createdAt: NOW,
      updatedAt: NOW,
      sdlc: { changeRequestId: PROJECT_ID, purpose: 'sdlc' },
    });

    const runtime = await createSdlcWizardRuntime({ db });
    const evidence = await runtime.collectEvidence(evidenceInput(await runtime.resolveSetIds(PROJECT_ID)));

    expect(evidence.degraded).toEqual(['REMOTE_DISABLED', 'MCP_UNAVAILABLE']);
    expect(evidence.coverage).toBe('PARTIAL');
    // No MCP seam by design: the wizard stage forbids tool requests.
    expect(evidence.items.every((item) => item.source === 'local')).toBe(true);
  });

  it('uses the router default endpoint when only a model is persisted', async () => {
    await db.settings.put({ key: 'ninerouter_default_model', value: 'model-only' });
    const runtime = await createSdlcWizardRuntime({ db });

    expect(runtime.model.endpoint).toBe(DEFAULT_NINEROUTER_ENDPOINT);
    expect(runtime.model.model).toBe('model-only');
  });
});
