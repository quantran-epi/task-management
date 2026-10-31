import fsp from 'node:fs/promises';
import path from 'node:path';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { defaultSha256 } from '../../src/services/wizard/workflowCoordinator';
import { saveHubSolution } from '../../src/services/wizard/hubSolution';
import {
  buildHubReconciliation,
  confirmHubChangePack,
  validateHubChangePack,
} from '../../src/services/wizard/hubChangePack';
import { ChangePackValidationError, type ChangePackManifest } from '../../src/services/wizard/changePack';
import type { Project } from '../../src/types/models';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-11-01T12:00:00.000Z';
const CR = 'CR-25001';

const project: Project = { id: PROJECT_ID, name: 'Hub pack project', status: 'Open', createdAt: NOW, updatedAt: NOW };

const fixturePath = (name: string) => path.resolve('tests/fixtures/ai/change-packs', name);

async function readFixture(name: string): Promise<File> {
  return new File([await fsp.readFile(fixturePath(name))], name, { type: 'application/zip' });
}

let db: TaskPlannerDatabase;

beforeEach(async () => {
  db = new TaskPlannerDatabase(`hub-change-pack-${Date.now()}-${Math.random()}`);
  await db.open();
  await db.projects.add(project);
  // Plan 01 removed the wizard-session requirement: a project-scoped thread is the anchor.
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

/** Writes a SOLUTION Note exactly the way the hub does: `{ markdown, exportPayload: {} }`. */
async function seedHubSolution(markdown = '# SOLUTION\nHệ thống hiện tại.') {
  return saveHubSolution({ db, projectId: PROJECT_ID, threadId: THREAD_ID, sessionId: SESSION_ID, markdown, draftRevision: 1 });
}

async function confirm(manifest: Readonly<ChangePackManifest>, solution: Awaited<ReturnType<typeof seedHubSolution>>) {
  return confirmHubChangePack({
    db,
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    sessionId: SESSION_ID,
    inputRevision: 1,
    manifest,
    solution: { noteId: solution.noteId, version: solution.version, hash: solution.hash },
    confirmedAt: NOW,
  });
}

describe('validateHubChangePack', () => {
  it('returns the manifest identity read from the pack itself', async () => {
    const manifest = await validateHubChangePack(await readFixture('valid.zip'), CR);

    expect(manifest.identity).toEqual({
      cr: CR,
      base: 'base-commit-001',
      head: 'head-commit-002',
      branch: 'feature/CR-25001',
    });
    expect(manifest.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a pack whose own CR differs from the hub CR', async () => {
    await expect(validateHubChangePack(await readFixture('wrong-cr.zip'), CR)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ChangePackValidationError);
      expect((error as ChangePackValidationError).code).toBe('PACK_IDENTITY_MISMATCH');
      return true;
    });
  });
});

describe('confirmHubChangePack', () => {
  it('writes one Note per manifest entry and returns the reconciliation', async () => {
    const solution = await seedHubSolution();
    const manifest = await validateHubChangePack(await readFixture('valid.zip'), CR);

    const result = await confirm(manifest, solution);

    expect(result.persisted.created).toBe(true);
    expect(result.persisted.notes).toHaveLength(manifest.entries.length);
    expect(result.reconciliation.identity.packHash).toBe(manifest.packHash);
    expect(await db.notes.count()).toBe(1 + manifest.entries.length);
  });

  it('is replay-safe for the same pack (no duplicate entry set)', async () => {
    const solution = await seedHubSolution();
    const manifest = await validateHubChangePack(await readFixture('valid.zip'), CR);

    const first = await confirm(manifest, solution);
    const notesAfterFirst = await db.notes.count();
    const replay = await confirm(manifest, solution);

    expect(replay.persisted.created).toBe(false);
    expect(replay.persisted.notes.map((note) => note.id)).toEqual(first.persisted.notes.map((note) => note.id));
    expect(await db.notes.count()).toBe(notesAfterFirst);
  });

  it('confirms a different pack for the same project/thread at a new entry set', async () => {
    const solution = await seedHubSolution();
    const first = await validateHubChangePack(await readFixture('valid.zip'), CR);
    const second = await validateHubChangePack(await readFixture('partial.zip'), CR);

    expect(second.packHash).not.toBe(first.packHash);

    const firstResult = await confirm(first, solution);
    const secondResult = await confirm(second, solution);

    expect(secondResult.persisted.created).toBe(true);
    const secondIds = new Set(secondResult.persisted.notes.map((note) => note.id));
    expect(firstResult.persisted.notes.some((note) => secondIds.has(note.id))).toBe(false);
    expect(await db.notes.count()).toBe(1 + first.entries.length + second.entries.length);
  });

  it('production-shape guard: a SOLUTION Note with exportPayload {} confirms without throwing and reports PARTIAL_COVERAGE', async () => {
    const solution = await seedHubSolution();
    // Exactly what saveHubSolution writes — no structured requirements exist anywhere.
    const stored = await db.notes.get(solution.noteId);
    const body = JSON.parse(stored!.body) as { markdown: string; exportPayload: unknown };
    expect(body.exportPayload).toEqual({});

    const manifest = await validateHubChangePack(await readFixture('valid.zip'), CR);
    const result = await confirm(manifest, solution);

    expect(result.reconciliation.status).toBe('PARTIAL_COVERAGE');
    expect(result.reconciliation.approvedDesign).toEqual({
      currentSystem: body.markdown.trim(),
      affectedScreens: [],
      affectedApis: [],
      affectedTables: [],
    });
    expect(result.reconciliation.drift).toEqual([]);
  });
});

describe('buildHubReconciliation', () => {
  it('never claims NO_DRIFT_COMPLETE when the solution exposes no requirements', async () => {
    const solution = await seedHubSolution();
    const manifest = await validateHubChangePack(await readFixture('valid.zip'), CR);

    const result = await buildHubReconciliation({
      db,
      projectId: PROJECT_ID,
      threadId: THREAD_ID,
      manifest,
      solutionNoteId: solution.noteId,
      solutionVersion: solution.version,
      solutionHash: solution.hash,
    });

    expect(result.status).toBe('PARTIAL_COVERAGE');
  });

  it('reports NO_DRIFT_COMPLETE with an empty drift when requirements exist and coverage is complete', async () => {
    const markdown = '# SOLUTION\nCó yêu cầu.';
    const hash = await defaultSha256(markdown);
    const solutionNoteId = '66666666-6666-4666-8666-666666666666';
    await db.notes.add({
      id: solutionNoteId,
      type: 'document',
      tags: ['sdlc'],
      entityType: 'project',
      entityId: PROJECT_ID,
      title: 'SOLUTION v1',
      body: JSON.stringify({
        markdown,
        exportPayload: {
          requirements: [{ id: 'REQ-1', category: 'functional', summary: 'Chuyển tiền', evidencePaths: ['src/feature.ts'] }],
          approvedDesign: {
            currentSystem: 'Core banking',
            affectedScreens: ['Chuyển tiền'],
            affectedApis: ['POST /transfer'],
            affectedTables: ['TRANSFER'],
            regressionMatrix: [],
          },
        },
      }),
      isPinned: false,
      sdlcArtifact: {
        kind: 'SOLUTION',
        projectId: PROJECT_ID,
        threadId: THREAD_ID,
        sessionId: SESSION_ID,
        version: 1,
        inputHash: hash,
        sourceArtifactIds: [],
        sourceArtifactHashes: [],
        approvedAt: NOW,
        idempotencyKey: `${SESSION_ID}:SOLUTION:${hash}`,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const manifest = await validateHubChangePack(await readFixture('valid.zip'), CR);
    const result = await buildHubReconciliation({
      db,
      projectId: PROJECT_ID,
      threadId: THREAD_ID,
      manifest,
      solutionNoteId,
      solutionVersion: 1,
      solutionHash: hash,
    });

    expect(result.status).toBe('NO_DRIFT_COMPLETE');
    expect(result.drift).toEqual([]);
    expect(result.approvedDesign.affectedScreens).toEqual(['Chuyển tiền']);
  });

  it('rejects a solution Note whose pinned version or hash does not match', async () => {
    const solution = await seedHubSolution();
    const manifest = await validateHubChangePack(await readFixture('valid.zip'), CR);

    await expect(
      buildHubReconciliation({
        db,
        projectId: PROJECT_ID,
        threadId: THREAD_ID,
        manifest,
        solutionNoteId: solution.noteId,
        solutionVersion: 2,
        solutionHash: solution.hash,
      }),
    ).rejects.toThrow('PACK_SOLUTION_MISMATCH');
  });
});

