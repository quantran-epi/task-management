import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { ChangeRequestSdlcView } from '../../../src/views/ChangeRequestSdlcView';
import * as workflow from '../../../src/services/wizard/workflowCoordinator';
import type { SdlcSidebarProps } from '../../../src/components/sdlc/SdlcSidebar';
import type { SdlcWorkspaceProps } from '../../../src/components/sdlc/SdlcWorkspace';

vi.mock('../../../src/components/sdlc/SdlcSidebar', () => ({
  SdlcSidebar: ({ activeCrId, onSelectCr, onSelectStep, workflowState }: SdlcSidebarProps) => (
    <div>
      <span data-testid="selected-cr">{activeCrId}</span>
      <span data-testid="workflow-cr">{workflowState?.metadata.cr ?? 'empty'}</span>
      <button onClick={() => onSelectCr?.('11111111-1111-4111-8111-111111111111')}>CR-A</button>
      <button onClick={() => onSelectCr?.('22222222-2222-4222-8222-222222222222')}>CR-B</button>
      <button onClick={() => onSelectStep('SOLUTION')}>Navigate</button>
    </div>
  ),
}));
vi.mock('../../../src/components/sdlc/SdlcWorkspace', () => ({
  SdlcWorkspace: (_props: SdlcWorkspaceProps) => null,
}));

const metadata = { cr: 'CR-A', featureName: 'Feature A', author: 'Tester', requestingUnit: 'IT', date: '2026-11-02' };
const CR_A = '11111111-1111-4111-8111-111111111111';
const CR_B = '22222222-2222-4222-8222-222222222222';
const threadId = '33333333-3333-4333-8333-333333333333';
const key = (crId: string) => workflow.workflowStorageKey(crId, crId);
// The view persists under `sdlc_workflow:<crId>:<threadId>` and only reads the pre-fix
// `<crId>:<crId>` row as a fallback, so assertions must not pin the legacy shape.
async function readRow(db: TaskPlannerDatabase, crId: string) {
  const prefix = `sdlc_workflow:${crId}:`;
  const rows = (await db.settings.toArray()).filter((row) => row.key.startsWith(prefix));
  return rows.find((row) => row.key !== key(crId)) ?? rows[0];
}
type Coordinator = ReturnType<typeof workflow.createSdlcWorkflowCoordinator>;

afterEach(() => vi.restoreAllMocks());

async function setup(withBState = false, delayRestore = false) {
  const db = new TaskPlannerDatabase(`cr-isolation-${crypto.randomUUID()}`);
  const now = new Date().toISOString();
  await db.changeRequests.bulkAdd([
    { id: CR_A, name: 'CR A', code: 'CR-A', status: 'Open', type: 'ENHANCEMENT', targets: [], createdAt: now, updatedAt: now },
    { id: CR_B, name: 'CR B', code: 'CR-B', status: 'Open', type: 'ENHANCEMENT', targets: [], createdAt: now, updatedAt: now },
  ]);
  const seed = workflow.createSdlcWorkflowCoordinator({ changeRequestId: CR_A, threadId });
  const stateA = await seed.startOrUpdateIntake(metadata, 'PL01 A', 'PL02 A');
  await db.settings.put({ key: key(CR_A), value: JSON.stringify(stateA) });
  if (withBState) {
    await db.settings.put({ key: key(CR_B), value: JSON.stringify({ ...stateA, metadata: { ...metadata, cr: 'CR-B' } }) });
  }
  const coordinators: Coordinator[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const reads = vi.fn();
  const create = workflow.createSdlcWorkflowCoordinator;
  vi.spyOn(workflow, 'createSdlcWorkflowCoordinator').mockImplementation((deps) => {
    const coordinator = create({
      ...deps,
      loadState: async () => {
        const loaded = await deps.loadState?.();
        reads(loaded?.metadata.cr);
        if (delayRestore && loaded?.metadata.cr === 'CR-A') await pending;
        return loaded;
      },
    });
    coordinators.push(coordinator);
    return coordinator;
  });
  return { db, coordinators, reads, release, pending };
}

async function switchToB() {
  fireEvent.click(screen.getByRole('button', { name: /^CR-B$/ }));
  await waitFor(() => expect(screen.getByTestId('selected-cr')).toHaveTextContent(CR_B));
}

describe('CR-scoped workflow coordinator', () => {
  it('clears CR-A memory on selection and refuses to persist it into empty CR-B', async () => {
    const { db } = await setup();
    render(<ChangeRequestSdlcView changeRequestId={CR_A} db={db} onBack={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('workflow-cr')).toHaveTextContent('CR-A'));
    await switchToB();
    await waitFor(() => expect(screen.getByTestId('workflow-cr')).toHaveTextContent('empty'));
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(await readRow(db, CR_B)).toBeUndefined();
    expect(screen.getByTestId('workflow-cr')).toHaveTextContent('empty');
  });

  it('keeps late CR-A saves and deletes on CR-A, preserving CR-B state', async () => {
    const { db, coordinators } = await setup(true);
    render(<ChangeRequestSdlcView changeRequestId={CR_A} db={db} onBack={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('workflow-cr')).toHaveTextContent('CR-A'));
    const coordinatorA = coordinators.at(-1)!;
    await switchToB();
    await waitFor(() => expect(screen.getByTestId('workflow-cr')).toHaveTextContent('CR-B'));
    const beforeB = await readRow(db, CR_B);
    await act(async () => { await coordinatorA.navigateToStep('CAB'); });
    expect(JSON.parse(String((await readRow(db, CR_A))!.value)).currentStep).toBe('CAB');
    expect(await readRow(db, CR_B)).toEqual(beforeB);
    expect(screen.getByTestId('workflow-cr')).toHaveTextContent('CR-B');
    await act(async () => { await coordinatorA.reset(); });
    expect(await readRow(db, CR_A)).toBeUndefined();
    expect(await readRow(db, CR_B)).toEqual(beforeB);
    expect(screen.getByTestId('workflow-cr')).toHaveTextContent('CR-B');
  });

  it('ignores CR-A restore completion after selecting CR-B', async () => {
    const { db, reads, release, pending } = await setup(false, true);
    render(<ChangeRequestSdlcView changeRequestId={CR_A} db={db} onBack={() => {}} />);
    await waitFor(() => expect(reads).toHaveBeenCalledWith('CR-A'));
    await switchToB();
    await act(async () => { release(); await pending; });
    await waitFor(() => expect(screen.getByTestId('workflow-cr')).toHaveTextContent('empty'));
    expect(await readRow(db, CR_B)).toBeUndefined();
  });

  it('reset clears both the thread-keyed row and the pre-fix legacy row', async () => {
    const { db, coordinators } = await setup();
    render(<ChangeRequestSdlcView changeRequestId={CR_A} db={db} onBack={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('workflow-cr')).toHaveTextContent('CR-A'));
    const coordinatorA = coordinators.at(-1)!;
    // Simulate an upgraded workspace: saveState wrote the thread-keyed row, the pre-fix
    // `<crId>:<crId>` row is still present, and loadState would fall back to it.
    await act(async () => { await coordinatorA.navigateToStep('CAB'); });
    expect(await db.settings.get(key(CR_A))).toBeDefined();
    expect(await readRow(db, CR_A)).toBeDefined();
    await act(async () => { await coordinatorA.reset(); });
    expect(await db.settings.get(key(CR_A))).toBeUndefined();
    expect(await readRow(db, CR_A)).toBeUndefined();
  });
});
