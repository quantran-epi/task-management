import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import * as coordinatorModule from '../../src/services/wizard/wizardCoordinator';

vi.mock('../../src/utils/pptxExport', () => ({ exportPresentationAsFile: vi.fn() }));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

describe('AIChatDrawer wizard wiring', () => {
  let db: TaskPlannerDatabase;
  const start = vi.fn();
  const cancel = vi.fn();
  const dispose = vi.fn();
  const restore = vi.fn();
  const addContext = vi.fn();
  const selectChangePack = vi.fn();
  const replaceChangePack = vi.fn();
  const confirmChangePack = vi.fn();
  const generateTechnicalDocs = vi.fn();
  const generateCab = vi.fn();
  const getPackState = vi.fn();
  const approveAndExport = vi.fn();
  const retryExportDownload = vi.fn();
  const requestEdit = vi.fn();

  beforeEach(async () => {
    vi.restoreAllMocks();
    start.mockReset(); cancel.mockReset(); dispose.mockReset(); restore.mockReset(); addContext.mockReset(); selectChangePack.mockReset(); replaceChangePack.mockReset(); confirmChangePack.mockReset(); generateTechnicalDocs.mockReset(); generateCab.mockReset(); getPackState.mockReset(); approveAndExport.mockReset(); retryExportDownload.mockReset(); requestEdit.mockReset();
    approveAndExport.mockResolvedValue({ blobBuilt: true, noteSaved: true, downloadInitiated: true, savePickerSaved: false, filename: 'PL02.docx', sizeBytes: 4, noteId: '55555555-5555-4555-8555-555555555555', errorCode: null });
    retryExportDownload.mockResolvedValue({ blobBuilt: true, noteSaved: true, downloadInitiated: true, savePickerSaved: false, filename: 'PL02.docx', sizeBytes: 4, noteId: '55555555-5555-4555-8555-555555555555', errorCode: null });
    requestEdit.mockResolvedValue(undefined);
    getPackState.mockReturnValue({ status: 'idle' });
    selectChangePack.mockResolvedValue({ status: 'pending', manifest: { identity: { cr: 'CR-1', branch: 'feature/CR-1' }, commitCount: 1, fileCount: 1, packHash: '6'.repeat(64), entries: [], meta: {}, schemaVersion: 1, compressedBytes: 1, expandedBytes: 1, coverageStatus: 'complete' } });
    confirmChangePack.mockResolvedValue({ persisted: { created: true, notes: [] }, reconciliation: { status: 'NO_DRIFT_COMPLETE', drift: [], coverage: [] } });
    generateTechnicalDocs.mockResolvedValue({ status: 'NO_DRIFT_COMPLETE', drift: [], coverage: [], pl03: {}, pl07: {} });
    generateCab.mockResolvedValue({ status: 'NO_DRIFT_COMPLETE', drift: [], coverage: [] });
    db = new TaskPlannerDatabase(`drawer-wizard-${Date.now()}-${Math.random()}`);
    await db.open();
    await db.projects.add({ id: PROJECT_ID, name: 'Wizard Project', status: 'Open', createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z' });
    restore.mockResolvedValue(undefined);
    vi.spyOn(coordinatorModule, 'createWizardCoordinator').mockReturnValue({
      start, cancel, dispose, restore, addContext, selectChangePack, replaceChangePack, confirmChangePack, generateTechnicalDocs, generateCab, getPackState,
      answerGap: vi.fn(), skipGap: vi.fn(), requestEdit, approveSolution: vi.fn(), approveAndExport, retryExportDownload,
      getCabState: vi.fn(),
      getTechnicalDocs: vi.fn(),
      getLatestSolution: vi.fn(),
      isBusy: vi.fn(),
      getState: vi.fn(), getSnapshot: vi.fn(),
    } as any);
  });

  it('gates skills by project scope and starts after metadata', async () => {
    const { rerender } = render(<AIChatDrawer open onClose={() => {}} db={db} />);
    expect(screen.getByRole('button', { name: /Soạn PL02/ })).toHaveAttribute('aria-disabled', 'true');

    rerender(<AIChatDrawer open onClose={() => {}} db={db} activeScope={{ type: 'project', id: PROJECT_ID, title: 'Wizard Project' }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Soạn PL02/ })).not.toHaveAttribute('aria-disabled'));
    fireEvent.click(screen.getByRole('button', { name: /Soạn PL02/ }));
    await screen.findByText('Thông tin tài liệu');
    await waitFor(() => expect(screen.getByLabelText('Mã dự án/CR')).toHaveValue('Wizard Project'));
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu soạn thảo' }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });

  it('routes composer text to active gap wizard and disposes on close', async () => {
    const thread = await db.chatThreads.add({
      id: '33333333-3333-4333-8333-333333333333', scopeKey: `project:${PROJECT_ID}`, scopeType: 'project', entityId: PROJECT_ID,
      createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z',
    });
    void thread;
    await db.chatMessages.add({
      id: '44444444-4444-4444-8444-444444444444', threadId: '33333333-3333-4333-8333-333333333333', role: 'assistant', content: 'gap',
      createdAt: '2026-10-28T00:00:00.000Z', wizard: {
        schemaVersion: 1, sessionId: '22222222-2222-4222-8222-222222222222', projectId: PROJECT_ID,
        threadId: '33333333-3333-4333-8333-333333333333', skill: 'PL02', status: 'gap_fill',
        inputRevision: 1, draftRevision: null, approvedAt: null, artifactId: null, artifactHash: null,
        renderPayload: { title: 'PL02' }, createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z',
      },
    });
    const { rerender } = render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={{ type: 'project', id: PROJECT_ID, title: 'Wizard Project' }} />);
    const input = await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
    await waitFor(() => expect(input).toHaveAttribute('placeholder', 'Trả lời câu hỏi hoặc bổ sung thông tin…'));
    fireEvent.change(input, { target: { value: 'Ngưỡng là 100' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    await waitFor(() => expect(addContext).toHaveBeenCalledWith('Ngưỡng là 100'));
    rerender(<AIChatDrawer open={false} onClose={() => {}} db={db} activeScope={{ type: 'project', id: PROJECT_ID, title: 'Wizard Project' }} />);
    await waitFor(() => expect(dispose).toHaveBeenCalled());
  });

  it('shows pack identity, confirms once, then exposes drift and same-thread CAB action', async () => {
    getPackState
      .mockReturnValueOnce({ status: 'idle' })
      .mockReturnValue({ status: 'pending', manifest: { identity: { cr: 'CR-1', base: 'base-1', head: 'head-1', branch: 'feature/CR-1' }, commitCount: 1, fileCount: 1, packHash: '6'.repeat(64), entries: [], meta: {}, schemaVersion: 1, compressedBytes: 1, expandedBytes: 1, coverageStatus: 'complete' } });
    await db.chatThreads.add({
      id: '33333333-3333-4333-8333-333333333333', scopeKey: `project:${PROJECT_ID}`, scopeType: 'project', entityId: PROJECT_ID,
      createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z',
    });
    await db.chatMessages.add({
      id: '44444444-4444-4444-8444-444444444444', threadId: '33333333-3333-4333-8333-333333333333', role: 'assistant', content: 'PL03 review',
      createdAt: '2026-10-28T00:00:00.000Z', wizard: {
        schemaVersion: 1, sessionId: '22222222-2222-4222-8222-222222222222', projectId: PROJECT_ID,
        threadId: '33333333-3333-4333-8333-333333333333', skill: 'PL03', status: 'review',
        inputRevision: 2, draftRevision: 1, approvedAt: null, artifactId: null, artifactHash: null,
        renderPayload: { title: 'PL03' }, createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z',
      },
    });
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={{ type: 'project', id: PROJECT_ID, title: 'Wizard Project' }} />);
    const dropzone = await screen.findByLabelText('Khu vực nạp change-pack');
    const file = new File(['zip'], 'change-pack.zip', { type: 'application/zip' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(selectChangePack).toHaveBeenCalledWith(file));
    await screen.findByText(/CR CR-1 · Nhánh feature\/CR-1 · 1 commit · 1 tệp/);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận pack' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận pack' }));
    await waitFor(() => expect(confirmChangePack).toHaveBeenCalledTimes(1));
    await screen.findByText('Đã nạp change-pack CR-1');
    expect(await screen.findByText('Bảng drift so với SOLUTION.md')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tờ trình CAB' }));
    await waitFor(() => expect(generateCab).toHaveBeenCalledTimes(1));
  });

  it('keeps normal composer enabled while pack processing is pending', async () => {
    await db.chatThreads.add({
      id: '33333333-3333-4333-8333-333333333333', scopeKey: `project:${PROJECT_ID}`, scopeType: 'project', entityId: PROJECT_ID,
      createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z',
    });
    await db.chatMessages.add({
      id: '44444444-4444-4444-8444-444444444444', threadId: '33333333-3333-4333-8333-333333333333', role: 'assistant', content: 'PL07 review',
      createdAt: '2026-10-28T00:00:00.000Z', wizard: {
        schemaVersion: 1, sessionId: '22222222-2222-4222-8222-222222222222', projectId: PROJECT_ID,
        threadId: '33333333-3333-4333-8333-333333333333', skill: 'PL07', status: 'review',
        inputRevision: 2, draftRevision: 1, approvedAt: null, artifactId: null, artifactHash: null,
        renderPayload: { title: 'PL07' }, createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z',
      },
    });
    let finish: (() => void) | undefined;
    selectChangePack.mockImplementation(() => new Promise((resolve) => { finish = () => resolve({ status: 'invalid', code: 'PACK_CORRUPT' }); }));
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={{ type: 'project', id: PROJECT_ID, title: 'Wizard Project' }} />);
    fireEvent.drop(await screen.findByLabelText('Khu vực nạp change-pack'), { dataTransfer: { files: [new File(['zip'], 'change-pack.zip')] } });
    expect(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI')).not.toBeDisabled();
    finish?.();
  });
});
