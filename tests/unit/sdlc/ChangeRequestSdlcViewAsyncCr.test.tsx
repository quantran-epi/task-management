import React from 'react';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { TaskPlannerDatabase } from '../../../src/db';
import { ChangeRequestSdlcView } from '../../../src/views/ChangeRequestSdlcView';
import { createSdlcWorkflowCoordinator, workflowStorageKey } from '../../../src/services/wizard/workflowCoordinator';
import type { SdlcWorkflowState } from '../../../src/services/wizard/workflowSchemas';

const mocks = vi.hoisted(() => ({ hashGate: null as Promise<void> | null }));
vi.mock('../../../src/services/wizard/workflowCoordinator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/services/wizard/workflowCoordinator')>();
  return { ...actual, defaultSha256: async (text: string) => {
    await mocks.hashGate;
    return actual.defaultSha256(text);
  } };
});
vi.mock('../../../src/components/sdlc/SdlcSidebar', () => ({
  SdlcSidebar: ({ activeCrId, onSelectCr, onSelectStep, workflowState }: {
    activeCrId: string; onSelectCr: (id: string) => void; onSelectStep: (step: 'SOLUTION') => void;
    workflowState?: SdlcWorkflowState;
  }) => <div>
    <span data-testid="cr">{activeCrId}</span>
    <span data-testid="version">{workflowState?.activeVersions?.SOLUTION}</span>
    <button onClick={() => onSelectCr('22222222-2222-4222-8222-222222222222')}>CR-B</button>
    <button onClick={() => onSelectStep('SOLUTION')}>SOLUTION</button>
  </div>,
}));
vi.mock('../../../src/components/sdlc/SdlcWorkspace', () => ({
  SdlcWorkspace: ({ stepViewNode, onSolutionExtracted }: {
    stepViewNode: React.ReactNode; onSolutionExtracted: (text: string) => Promise<void>;
  }) => <div>{stepViewNode}<button onClick={() => void onSolutionExtracted('# SOLUTION draft A')}>Trích xuất</button></div>,
}));
vi.mock('../../../src/components/sdlc/steps/Step2SolutionView', () => ({
  Step2SolutionView: ({ onCommitSolution }: { onCommitSolution: (text: string, noteId: string) => Promise<void> }) =>
    <button onClick={() => void onCommitSolution('# SOLUTION approved A', crypto.randomUUID())}>Duyệt</button>,
}));

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

const CR_A = '11111111-1111-4111-8111-111111111111';
const CR_B = '22222222-2222-4222-8222-222222222222';
const draftKey = (cr: string) => `sdlc_draft_solution:${cr}:${cr}`;
// The view persists under `sdlc_workflow:<crId>:<threadId>`; the legacy `<crId>:<crId>`
// row is only a read fallback, so assertions read by prefix instead of pinning a shape.
const statePrefix = (cr: string) => `sdlc_workflow:${cr}:`;
async function readStateRow(cr: string) {
  const rows = (await db.settings.toArray()).filter((row) => row.key.startsWith(statePrefix(cr)));
  return rows.find((row) => row.key !== workflowStorageKey(cr, cr)) ?? rows[0];
}
let db: TaskPlannerDatabase;
afterEach(async () => {
  cleanup();
  mocks.hashGate = null;
  vi.restoreAllMocks();
  await db?.delete();
});

async function mount() {
  vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
  db = new TaskPlannerDatabase(`async-cr-${crypto.randomUUID()}`);
  const metadata = { cr: 'CR-A', featureName: 'A', author: 'Tester', requestingUnit: 'CNTT', date: '2026-11-02' };
  const now = new Date().toISOString();
  await db.changeRequests.bulkAdd([
    { id: CR_A, name: 'CR A', code: 'CR-A', status: 'Open', type: 'ENHANCEMENT', targets: [], createdAt: now, updatedAt: now },
    { id: CR_B, name: 'CR B', code: 'CR-B', status: 'Cancelled', type: 'ENHANCEMENT', targets: [], createdAt: now, updatedAt: now },
  ]);
  for (const [cr, versions] of [[CR_A, 2], [CR_B, 7]] as const) {
    const coordinator = createSdlcWorkflowCoordinator({
      changeRequestId: cr, threadId: crypto.randomUUID(),
      saveState: async (state) => { await db.settings.put({ key: workflowStorageKey(cr, cr), value: JSON.stringify(state) }); },
    });
    await coordinator.startOrUpdateIntake({ ...metadata, cr: cr === CR_A ? 'CR-A' : 'CR-B' }, 'PL01', 'PL02');
    for (let version = 1; version <= versions; version += 1) await coordinator.commitSolution(`# SOLUTION ${cr === CR_A ? 'A' : 'B'} v${version}`);
    await db.settings.put({ key: draftKey(cr), value: cr === CR_A ? 'Draft A' : 'Draft B' });
  }
  render(<ChangeRequestSdlcView db={db} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByTestId('version')).toHaveTextContent('2'));
  return (await readStateRow(CR_B))!.value;
}

async function switchCr() {
  fireEvent.click(screen.getByRole('button', { name: 'CR-B' }));
  await waitFor(() => expect(screen.getByTestId('cr')).toHaveTextContent(CR_B));
  await waitFor(() => expect(screen.getByTestId('version')).toHaveTextContent('7'));
}

async function expectBUnchanged(snapshot: unknown) {
  const { updatedAt: restoredAt, ...actual } = JSON.parse(String((await readStateRow(CR_B))!.value));
  const { updatedAt: savedAt, ...expected } = JSON.parse(String(snapshot));
  expect(restoredAt).toBeTruthy();
  expect(savedAt).toBeTruthy();
  expect(actual).toEqual(expected);
  expect((await db.settings.get(draftKey(CR_B)))!.value).toBe('Draft B');
  const threadsB = (await db.chatThreads.toArray()).filter((thread) => thread.scopeKey.startsWith(`sdlc:${CR_B}:${CR_B}:`));
  const cards = (await db.chatMessages.toArray()).filter((row) => row.artifactEvent);
  expect(cards).toHaveLength(1);
  expect(threadsB.map((thread) => thread.id)).not.toContain(cards[0]!.threadId);
  expect((await db.chatThreads.get(cards[0]!.threadId))!.scopeKey).toBe(`sdlc:${CR_A}:${CR_A}:SOLUTION`);
  expect(cards[0]!.artifactEvent!.version).toBe(3);
  expect(screen.getByTestId('version')).toHaveTextContent('7');
}

describe('WR-05: controller giữ CR qua async boundary', () => {
  it.each(['write', 'hash'] as const)('draft/card giữ CR-A khi %s chờ rồi đổi CR-B', async (boundary) => {
    const snapshot = await mount();
    const gate = deferred();
    let blocked = false;
    if (boundary === 'hash') mocks.hashGate = gate.promise;
    else {
      const put = db.settings.put.bind(db.settings);
      vi.spyOn(db.settings, 'put').mockImplementation((row, ...args) => {
        if (row.key === draftKey(CR_A)) {
          blocked = true;
          return Dexie.Promise.resolve(gate.promise).then(() => put(row, ...args));
        }
        return put(row, ...args);
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Trích xuất' }));
    await waitFor(async () => {
      if (boundary === 'write') expect(blocked).toBe(true);
      else expect((await db.settings.get(draftKey(CR_A)))!.value).toBe('# SOLUTION draft A');
    });
    await switchCr();
    await act(async () => { gate.release(); });
    await waitFor(async () => expect(await db.chatMessages.count()).toBe(1));
    expect((await db.settings.get(draftKey(CR_A)))!.value).toBe('# SOLUTION draft A');
    await expectBUnchanged(snapshot);
  });

  it('commit/delete/card/version giữ CR-A khi persistence resolve sau đổi CR-B', async () => {
    const snapshot = await mount();
    fireEvent.click(screen.getByRole('button', { name: 'SOLUTION' }));
    await screen.findByRole('button', { name: 'Duyệt' });
    const gate = deferred();
    let blocked = false;
    const put = db.settings.put.bind(db.settings);
    vi.spyOn(db.settings, 'put').mockImplementation((row, ...args) => {
      if (row.key.startsWith(statePrefix(CR_A)) && JSON.parse(String(row.value)).activeVersions.SOLUTION === 3) {
        blocked = true;
        return Dexie.Promise.resolve(gate.promise).then(() => put(row, ...args));
      }
      return put(row, ...args);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
    await waitFor(() => expect(blocked).toBe(true));
    await switchCr();
    await act(async () => { gate.release(); });
    await waitFor(async () => expect(await db.chatMessages.count()).toBe(1));
    expect(await db.settings.get(draftKey(CR_A))).toBeUndefined();
    const stateA = JSON.parse(String((await readStateRow(CR_A))!.value));
    expect(stateA.versions.SOLUTION.map((ref: { version: number }) => ref.version)).toEqual([1, 2, 3]);
    expect(stateA.artifacts.solution.content).toBe('# SOLUTION approved A');
    await expectBUnchanged(snapshot);
  });
});
