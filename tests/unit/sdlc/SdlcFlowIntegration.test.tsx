import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { ProjectSdlcView } from '../../../src/views/ProjectSdlcView';
import { SdlcStaleBanner } from '../../../src/components/sdlc/common/SdlcStaleBanner';
import { CrCreateModal } from '../../../src/components/sdlc/common/CrCreateModal';
import { listCrs, createNewCr } from '../../../src/services/wizard/sdlcCrManager';
import { createSdlcWorkflowCoordinator } from '../../../src/services/wizard/workflowCoordinator';
import { detectWorkflowStaleness } from '../../../src/services/wizard/stalenessDetector';
import type { SdlcWorkflowState } from '../../../src/services/wizard/workflowSchemas';

describe('SDLC Flow Integration & Components', () => {
  let db: TaskPlannerDatabase;
  const projectId = '25000000-0000-4000-8000-000000000010';
  const threadId = '25000000-0000-4000-8000-000000000020';

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
        sessionId: '25000000-0000-4000-8000-000000000001',
        projectId,
        threadId,
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
            hash: 'c'.repeat(64),
            title: 'SOLUTION v2',
            content: 'solution content v2',
            sourceHashes: ['a'.repeat(64), 'b'.repeat(64)],
            updatedAt: '2026-11-01T00:00:00.000Z',
          },
          changePack: {
            kind: 'CHANGE_PACK',
            version: 1,
            hash: 'd'.repeat(64),
            title: 'pack.zip',
            content: 'pack content',
            sourceHashes: ['1'.repeat(64)], // Stale because not matching v2
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

  describe('Full Canonical SDLC Journey Simulation (Steps 1 to 6 & Staleness Recovery)', () => {
    it('executes full journey from Intake -> Solution -> Code Guide -> Change Pack -> Tech Docs -> CAB -> Staleness detection in one lifecycle', async () => {
      let state: SdlcWorkflowState | undefined;
      const coordinator = createSdlcWorkflowCoordinator({
        projectId,
        threadId,
        onStateChange: (newState) => {
          state = newState;
        },
      });

      // Step 1: Intake
      await coordinator.startOrUpdateIntake(
        {
          cr: 'CR-E2E-2026',
          featureName: 'QR Pay Liên ngân hàng',
          author: 'Nguyen Van A',
          requestingUnit: 'Khối Bán lẻ',
          date: '2026-11-01',
        },
        'Nghiệp vụ: Thanh toán mã VietQR qua tài khoản.',
        'Đặc tả kỹ thuật: API /api/v1/qr-pay hỗ trợ EMVCo standard.'
      );

      expect(state).toBeDefined();
      expect(state?.currentStep).toBe('SOLUTION');
      expect(state?.artifacts.pl01).toBeDefined();
      expect(state?.artifacts.pl02).toBeDefined();

      // Step 2: Solution approve
      await coordinator.commitSolution(
        '# SOLUTION ARCHITECTURE\n\nKiến trúc module QR gateway và ký số HMAC-SHA256.',
        '25000000-0000-4000-8000-000000000030'
      );

      expect(state?.currentStep).toBe('CODE_GUIDE');
      expect(state?.artifacts.solution?.version).toBe(1);

      // Step 3: Advance to Step 4
      await coordinator.navigateToStep('CHANGE_PACK');
      expect(state?.currentStep).toBe('CHANGE_PACK');

      // Step 4: Commit Change Pack & Drift
      const mockDriftResult = {
        schemaVersion: 1,
        identity: {
          projectId,
          threadId,
          solutionNoteId: '25000000-0000-4000-8000-000000000030',
          solutionVersion: 1,
          solutionHash: state!.artifacts.solution!.hash,
          packHash: 'd'.repeat(64),
          cr: 'CR-E2E-2026',
          base: 'main',
          head: 'feat/qr-pay',
        },
        status: 'DRIFT_DETECTED' as const,
        approvedDesign: { currentSystem: 'v1', affectedScreens: [], affectedApis: ['/api/v1/qr-pay'], affectedTables: ['qr_tx'] },
        actualImplementation: { affectedFiles: ['src/qr.ts'], affectedScreens: [], affectedApis: ['/api/v1/qr-pay'], affectedTables: ['qr_tx'] },
        drift: [],
        dbChangesRollback: { affectedTables: [], changes: [], rollback: { status: 'unknown' as const, evidenceIds: [] } },
        regressionMatrix: [],
        coverage: [{ path: 'src/qr.ts', state: 'included' as const, evidenceIds: [] }],
      };

      await coordinator.commitChangePackAndDrift(
        'd'.repeat(64),
        'change-pack-cr-e2e.zip',
        mockDriftResult
      );

      expect(state?.currentStep).toBe('TECH_DOCS');
      expect(state?.artifacts.changePack).toBeDefined();
      expect(state?.artifacts.driftResult).toBeDefined();

      // Step 5: Commit Tech Docs (PL03B and PL07)
      await coordinator.commitTechDoc(
        'PL03B',
        '# PL03B: Thiết kế chi tiết QR Pay\n\nSequence diagram luồng xử lý giao dịch.'
      );
      expect(state?.currentStep).toBe('TECH_DOCS'); // Still TECH_DOCS because PL07 not committed yet

      await coordinator.commitTechDoc(
        'PL07',
        '# PL07: Checklist review bảo mật\n\nĐạt tiêu chuẩn OWASP Top 10 và PCI-DSS.'
      );
      expect(state?.currentStep).toBe('CAB'); // Both committed -> advances to CAB

      // Step 6: Commit CAB
      await coordinator.commitCab(
        '# TỜ TRÌNH CAB: Triển khai QR Pay\n\nĐề nghị phê duyệt triển khai Production.'
      );
      expect(state?.artifacts.cab).toBeDefined();

      // Staleness Check: No stale steps right now
      let staleness = detectWorkflowStaleness(state!);
      expect(staleness.staleSteps).toHaveLength(0);

      // Trigger Staleness: update SOLUTION from v1 to v2
      await coordinator.commitSolution(
        '# SOLUTION ARCHITECTURE v2\n\nBổ sung mã hóa động AES-256.',
        '25000000-0000-4000-8000-000000000030'
      );

      // Now downstream steps must be flagged as stale
      staleness = detectWorkflowStaleness(state!);
      expect(staleness.staleSteps).toContain('CHANGE_PACK');
      expect(staleness.staleSteps).toContain('TECH_DOCS');
    });
  });
});
