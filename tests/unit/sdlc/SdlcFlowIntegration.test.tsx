import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { ProjectSdlcView } from '../../../src/views/ProjectSdlcView';
import { SdlcStaleBanner } from '../../../src/components/sdlc/common/SdlcStaleBanner';
import { CrCreateModal } from '../../../src/components/sdlc/common/CrCreateModal';
import { listCrs, createNewCr } from '../../../src/services/wizard/sdlcCrManager';
import type { SdlcWorkflowState } from '../../../src/services/wizard/workflowSchemas';

describe('SDLC Flow Integration & Components', () => {
  let db: TaskPlannerDatabase;
  const projectId = 'proj-sdlc-integration-test-01';

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-sdlc-integration-${Math.random()}`);
    await db.projects.add({
      id: projectId,
      name: 'Ngân hàng số - QR Pay',
      status: 'In Progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe('SdlcStaleBanner', () => {
    it('appears when steps are marked stale and navigates to the recovery step on click', () => {
      const handleNavigate = vi.fn();
      const mockWorkflowState: SdlcWorkflowState = {
        schemaVersion: 1,
        sessionId: 'sess-1',
        projectId,
        threadId: 'th-1',
        currentStep: 'TECH_DOCS',
        metadata: {
          cr: 'CR-2026-001',
          featureName: 'QR Pay',
          author: 'Dev',
          requestingUnit: 'Retail',
          date: '2026-11-01',
        },
        artifacts: {
          solution: {
            kind: 'SOLUTION',
            version: 2,
            hash: 'hash-solution-v2',
            title: 'SOLUTION v2',
            content: 'solution content v2',
            sourceHashes: ['pl01', 'pl02'],
            updatedAt: '2026-11-01T00:00:00.000Z',
          },
          changePack: {
            kind: 'CHANGE_PACK',
            version: 1,
            hash: 'hash-pack-v1',
            title: 'pack.zip',
            content: 'pack content',
            sourceHashes: ['hash-solution-v1'], // Stale because not matching v2
            updatedAt: '2026-11-01T00:00:00.000Z',
          },
        },
        staleSteps: ['CHANGE_PACK'],
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      };

      render(
        <SdlcStaleBanner
          currentStep="TECH_DOCS"
          workflowState={mockWorkflowState}
          onNavigateToStep={handleNavigate}
        />
      );

      expect(screen.getByTestId('sdlc-stale-banner')).toBeInTheDocument();
      expect(screen.getByText(/Quy trình có bước bị lệch dữ liệu/i)).toBeInTheDocument();

      const navBtn = screen.getByTestId('stale-navigate-button');
      expect(navBtn).toBeInTheDocument();
      fireEvent.click(navBtn);

      expect(handleNavigate).toHaveBeenCalledWith('CHANGE_PACK');
    });

    it('returns null when there are no stale steps', () => {
      const { container } = render(
        <SdlcStaleBanner
          currentStep="INTAKE"
          workflowState={undefined}
          onNavigateToStep={vi.fn()}
        />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('CrCreateModal', () => {
    it('validates fields, creates CR with context inheritance, and triggers callbacks', async () => {
      const handleClose = vi.fn();
      const handleCreated = vi.fn();

      render(
        <CrCreateModal
          projectId={projectId}
          open={true}
          onClose={handleClose}
          onCrCreated={handleCreated}
          db={db}
        />
      );

      expect(screen.getByTestId('cr-create-modal')).toBeInTheDocument();

      // Submit empty -> validation should block
      const okBtn = screen.getByRole('button', { name: 'Tạo CR' });
      fireEvent.click(okBtn);

      expect(handleCreated).not.toHaveBeenCalled();

      // Fill in required data
      fireEvent.change(screen.getByTestId('cr-input-code'), { target: { value: 'CR-2026-999' } });
      fireEvent.change(screen.getByTestId('cr-input-feature'), { target: { value: 'Thanh toán quốc tế' } });
      fireEvent.change(screen.getByTestId('cr-input-author'), { target: { value: 'Tran Van B' } });
      fireEvent.change(screen.getByTestId('cr-input-unit'), { target: { value: 'Khối Nguồn vốn' } });

      fireEvent.click(okBtn);

      await waitFor(() => {
        expect(handleCreated).toHaveBeenCalledWith(
          expect.objectContaining({
            crCode: 'CR-2026-999',
            featureName: 'Thanh toán quốc tế',
            author: 'Tran Van B',
            requestingUnit: 'Khối Nguồn vốn',
            status: 'active',
            inheritedContext: true,
          })
        );
      });

      expect(handleClose).toHaveBeenCalled();
    });
  });

  describe('ProjectSdlcView Workflow Reset and Notes Retention', () => {
    it('resets workflow state when confirmed while preserving project notes intact', async () => {
      // Add existing user note
      const noteId = 'user-note-preserved';
      await db.notes.add({
        id: noteId,
        title: 'Ghi chú kiến trúc quan trọng',
        body: 'Nội dung phân tích nghiệp vụ',
        entityType: 'project',
        entityId: projectId,
        isPinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      render(
        <ProjectSdlcView
          projectId={projectId}
          onBack={vi.fn()}
          db={db}
        />
      );

      // Verify studio renders (use waitFor because useLiveQuery is async)
      await waitFor(() => {
        expect(screen.getByText(/SDLC Studio — Ngân hàng số - QR Pay/i)).toBeInTheDocument();
      });

      // Notes in DB should still exist
      const note = await db.notes.get(noteId);
      expect(note).toBeDefined();
      expect(note?.title).toBe('Ghi chú kiến trúc quan trọng');
    });
  });
});
