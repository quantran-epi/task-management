import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { buildWizardDocx } from '../../src/services/export/wizardDocx';
import type { Pl03bDocxPayload } from '../../src/services/export/pl03bDocx';
import type { DownloadBlobResult } from '../../src/utils/fileExport';
import {
  ensurePl02ArtifactNote,
  exportHubArtifact,
  toPl02DocxPayload,
} from '../../src/services/wizard/hubExport';
import { defaultSha256 } from '../../src/services/wizard/workflowCoordinator';
import {
  SdlcWorkflowStateSchema,
  type SdlcWorkflowMetadata,
  type SdlcWorkflowState,
} from '../../src/services/wizard/workflowSchemas';
import type { Note, Project } from '../../src/types/models';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const PL03B_NOTE_ID = '44444444-4444-4444-8444-444444444444';
const NOW = '2026-11-01T12:00:00.000Z';
const PL02_MARKDOWN = '# PL02\nĐặc tả chức năng chuyển tiền nhanh.';

const project: Project = { id: PROJECT_ID, name: 'Export project', status: 'Open', createdAt: NOW, updatedAt: NOW };

const metadata: SdlcWorkflowMetadata = {
  cr: 'CR-25006',
  featureName: 'Chuyển tiền nhanh',
  author: 'Dev Lead',
  requestingUnit: 'Digital Banking',
  date: '2026-11-01',
};

const pl03bPayload: Pl03bDocxPayload = {
  schemaVersion: 1,
  kind: 'PL03B',
  status: 'approved',
  inputRevision: 1,
  draftRevision: 1,
  approvedRevision: 1,
  metadata: { crCode: metadata.cr, featureName: metadata.featureName, author: metadata.author, createdDate: metadata.date, version: '1' },
  introduction: { purpose: 'Thiết kế chuyển tiền.', users: '(chưa cung cấp)', databases: ['TRANSFER'], k8sServices: [] },
  technical: {
    overview: 'API /transfer',
    techStack: 'TypeScript',
    flows: [],
    services: [],
    databases: [],
    integrations: [],
    notifications: [],
  },
  reconciliationEvidence: {
    actualImplementation: { affectedFiles: [], affectedScreens: [], affectedApis: [], affectedTables: [] },
    coverage: [{ path: 'src/transfer.ts', state: 'included', evidenceIds: [] }],
    dbChangesRollback: {
      affectedTables: ['TRANSFER'],
      changes: [],
      rollback: { status: 'unknown', evidenceIds: [] },
    },
    regressionMatrix: [],
  },
};

let db: TaskPlannerDatabase;

beforeEach(async () => {
  db = new TaskPlannerDatabase(`hub-export-${Date.now()}-${Math.random()}`);
  await db.open();
  await db.projects.add(project);
  await db.chatThreads.add({
    id: THREAD_ID,
    scopeKey: `project:${PROJECT_ID}`,
    scopeType: 'project',
    entityId: PROJECT_ID,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

afterEach(async () => {
  await db.delete();
});

async function seedPl02(hash: string, version = 1, noteId?: string): Promise<SdlcWorkflowState> {
  return SdlcWorkflowStateSchema.parse({
    schemaVersion: 1,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    currentStep: 'INTAKE',
    metadata,
    artifacts: {
      pl02: {
        ...(noteId ? { noteId } : {}),
        kind: 'PL02',
        version,
        hash,
        title: 'PL02 — Đặc tả chức năng',
        content: PL02_MARKDOWN,
        sourceHashes: [],
        updatedAt: NOW,
      },
    },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function seedPl03bNote(exportPayload: unknown = pl03bPayload): Promise<void> {
  const note: Note = {
    id: PL03B_NOTE_ID,
    type: 'document',
    tags: ['sdlc', 'pl03b'],
    entityType: 'project',
    entityId: PROJECT_ID,
    title: 'PL03B v1',
    body: JSON.stringify({ markdown: '# PL03B v1', exportPayload }),
    isPinned: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
  await db.notes.add(note);
}

function stateWithPl03b(pl02Hash: string): SdlcWorkflowState {
  return SdlcWorkflowStateSchema.parse({
    schemaVersion: 1,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    currentStep: 'TECH_DOCS',
    metadata,
    artifacts: {
      pl02: {
        kind: 'PL02',
        version: 1,
        hash: pl02Hash,
        title: 'PL02 — Đặc tả chức năng',
        content: PL02_MARKDOWN,
        sourceHashes: [],
        updatedAt: NOW,
      },
      pl03b: {
        noteId: PL03B_NOTE_ID,
        kind: 'PL03B',
        version: 1,
        hash: '07'.repeat(32),
        title: 'PL03B v1',
        sourceHashes: [],
        updatedAt: NOW,
      },
    },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function downloader(result: DownloadBlobResult) {
  return vi.fn(async () => result);
}

describe('toPl02DocxPayload', () => {
  it('produces an approved PL02 payload the real DOCX dispatcher accepts', async () => {
    const payload = toPl02DocxPayload(metadata, PL02_MARKDOWN, 1, 1);

    await expect(buildWizardDocx('PL02', payload)).resolves.toBeInstanceOf(Blob);
    expect(payload).toMatchObject({
      schemaVersion: 1,
      kind: 'PL02',
      status: 'approved',
      inputRevision: 1,
      draftRevision: 1,
      approvedRevision: 1,
    });
    expect(payload.features[0]?.description).toBe(PL02_MARKDOWN);
  });
});

describe('ensurePl02ArtifactNote', () => {
  it('writes one Note and returns the same id for the same content hash', async () => {
    const state = await seedPl02(await defaultSha256(PL02_MARKDOWN));
    const first = await ensurePl02ArtifactNote({ db, projectId: PROJECT_ID, threadId: THREAD_ID, sessionId: SESSION_ID, markdown: PL02_MARKDOWN, metadata, state });
    const second = await ensurePl02ArtifactNote({ db, projectId: PROJECT_ID, threadId: THREAD_ID, sessionId: SESSION_ID, markdown: PL02_MARKDOWN, metadata, state });

    expect(second.noteId).toBe(first.noteId);
    expect(await db.notes.count()).toBe(1);
  });

  it('returns a new Note at version 2 when the PL02 markdown changed', async () => {
    const state = await seedPl02(await defaultSha256(PL02_MARKDOWN), 1);
    const first = await ensurePl02ArtifactNote({ db, projectId: PROJECT_ID, threadId: THREAD_ID, sessionId: SESSION_ID, markdown: PL02_MARKDOWN, metadata, state });
    const second = await ensurePl02ArtifactNote({
      db, projectId: PROJECT_ID, threadId: THREAD_ID, sessionId: SESSION_ID,
      markdown: '# PL02\nBản cập nhật.', metadata, state,
    });

    expect(second.noteId).not.toBe(first.noteId);
    expect(second.version).toBe(2);
    expect(first.version).toBe(1);
  });

  it('stores the inputHash validatedSources compares, with no noteId seeded in state', async () => {
    const hash = await defaultSha256(PL02_MARKDOWN.trim());
    const state = await seedPl02(hash);
    expect(state.artifacts.pl02?.noteId).toBeUndefined();

    const pin = await ensurePl02ArtifactNote({ db, projectId: PROJECT_ID, threadId: THREAD_ID, sessionId: SESSION_ID, markdown: PL02_MARKDOWN, metadata, state });

    const note = await db.notes.get(pin.noteId);
    expect(note?.sdlcArtifact?.inputHash).toBe(hash);
    expect(await defaultSha256(PL02_MARKDOWN.trim())).toBe(hash);
  });
});

describe('exportHubArtifact', () => {
  it('exports PL02 as a saved Note whose body carries markdown and the export payload', async () => {
    const state = await seedPl02(await defaultSha256(PL02_MARKDOWN));
    const result = await exportHubArtifact({
      db, kind: 'PL02', projectId: PROJECT_ID, threadId: THREAD_ID, sessionId: SESSION_ID,
      metadata, state, downloadFile: downloader({ kind: 'download_initiated', filename: 'x.docx' }),
    });

    expect(result).toMatchObject({ status: 'saved', version: 1 });
    expect(result.noteId).toBeTruthy();
    expect(result.filename).toContain('PL02');
    expect(result.filename).toMatch(/\.docx$/);
    expect(result.sizeBytes).toBeGreaterThan(0);

    const note = await db.notes.get(result.noteId!);
    const body = JSON.parse(note!.body) as { markdown: string; exportPayload: unknown };
    expect(body.markdown).toBe(PL02_MARKDOWN);
    await expect(buildWizardDocx('PL02', body.exportPayload)).resolves.toBeInstanceOf(Blob);
  });

  it('reads a stored PL03B payload instead of rebuilding it', async () => {
    await seedPl03bNote();
    const result = await exportHubArtifact({
      db, kind: 'PL03B', projectId: PROJECT_ID, threadId: THREAD_ID, sessionId: SESSION_ID,
      metadata, state: stateWithPl03b(await defaultSha256(PL02_MARKDOWN)),
      downloadFile: downloader({ kind: 'save_picker_saved', filename: 'x.docx' }),
    });

    expect(result).toMatchObject({ status: 'saved', noteId: PL03B_NOTE_ID, version: 1 });
    expect(result.filename).toMatch(/^PL03B-CR-25006-v1\.docx$/);
  });

  it('writes no Note when the build fails', async () => {
    await seedPl03bNote({ kind: 'PL03B', garbage: true });
    const before = await db.notes.count();
    const result = await exportHubArtifact({
      db, kind: 'PL03B', projectId: PROJECT_ID, threadId: THREAD_ID, sessionId: SESSION_ID,
      metadata, state: stateWithPl03b(await defaultSha256(PL02_MARKDOWN)),
      downloadFile: downloader({ kind: 'download_initiated', filename: 'x.docx' }),
    });

    expect(result).toEqual({ status: 'failed', errorCode: 'WIZARD_DOCX_PAYLOAD_INVALID' });
    expect(await db.notes.count()).toBe(before);
  });

  it('reports a cancelled download as saved_download_failed and a retry never duplicates', async () => {
    const state = await seedPl02(await defaultSha256(PL02_MARKDOWN));
    const cancelled = await exportHubArtifact({
      db, kind: 'PL02', projectId: PROJECT_ID, threadId: THREAD_ID, sessionId: SESSION_ID,
      metadata, state, downloadFile: downloader({ kind: 'cancelled', filename: 'x.docx' }),
    });

    expect(cancelled).toMatchObject({ status: 'saved_download_failed', errorCode: 'WIZARD_EXPORT_DOWNLOAD_CANCELLED' });
    expect(cancelled.noteId).toBeTruthy();

    const retried = await exportHubArtifact({
      db, kind: 'PL02', projectId: PROJECT_ID, threadId: THREAD_ID, sessionId: SESSION_ID,
      metadata, state, downloadFile: downloader({ kind: 'download_initiated', filename: 'x.docx' }),
    });

    expect(retried).toMatchObject({ status: 'saved', noteId: cancelled.noteId, version: cancelled.version });
    expect(await db.notes.count()).toBe(1);
  });
});
