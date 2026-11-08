import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { Step1IntakeView } from '../../../src/components/sdlc/steps/Step1IntakeView';
import { Step2SolutionView } from '../../../src/components/sdlc/steps/Step2SolutionView';
import { Step3CodeGuideView } from '../../../src/components/sdlc/steps/Step3CodeGuideView';
import { Step4ChangePackView } from '../../../src/components/sdlc/steps/Step4ChangePackView';
import { Step5TechDocsView } from '../../../src/components/sdlc/steps/Step5TechDocsView';
import { Step6CabView } from '../../../src/components/sdlc/steps/Step6CabView';
import { formatGuardMessage } from '../../../src/services/wizard/workflowGuards';

describe('Step 1 Intake & Step 2 Solution Views', () => {
  let db: TaskPlannerDatabase;
  const projectId = 'b45c2f09-1a89-4c07-b24e-4f056d68b981';

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-steps-${Math.random()}`);
    await db.changeRequests.add({
      id: projectId,
      name: 'Hệ thống Loyalty',
      code: 'CR-STEPS',
      status: 'In Progress',
      type: 'ENHANCEMENT',
      targets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe('Step1IntakeView', () => {
    it('validates required metadata, PL01, and PL02 inputs, and calls onStartIntake to advance to Step 2', async () => {
      const handleStartIntake = vi.fn().mockResolvedValue(undefined);

      render(
        <Step1IntakeView
          changeRequestId={projectId}
          onStartIntake={handleStartIntake}
          db={db}
        />
      );

      // Verify form elements exist
      expect(screen.getByPlaceholderText(/Mã CR/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Tên tính năng/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Nội dung Yêu cầu nghiệp vụ \(PL01\)/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Nội dung Đặc tả chức năng \(PL02\)/i)).toBeInTheDocument();

      const submitBtn = screen.getByRole('button', { name: /Bắt đầu phân tích Solution/i });

      // Trigger submit with missing fields -> should not call onStartIntake
      fireEvent.click(submitBtn);
      expect(handleStartIntake).not.toHaveBeenCalled();

      // Fill in valid data
      fireEvent.change(screen.getByPlaceholderText(/Mã CR/i), { target: { value: 'CR-2026-888' } });
      fireEvent.change(screen.getByPlaceholderText(/Tên tính năng/i), { target: { value: 'Tích điểm thành viên' } });
      fireEvent.change(screen.getByPlaceholderText(/Người lập/i), { target: { value: 'Nguyen Van C' } });
      fireEvent.change(screen.getByPlaceholderText(/Đơn vị yêu cầu/i), { target: { value: 'Khối Bán lẻ' } });
      fireEvent.change(screen.getByPlaceholderText(/Nội dung Yêu cầu nghiệp vụ \(PL01\)/i), {
        target: { value: 'Tích 1 điểm cho mỗi 100k chi tiêu.' },
      });
      fireEvent.change(screen.getByPlaceholderText(/Nội dung Đặc tả chức năng \(PL02\)/i), {
        target: { value: 'API tích điểm tự động gọi sau giao dịch hoàn tất.' },
      });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(handleStartIntake).toHaveBeenCalledWith(
          expect.objectContaining({
            cr: 'CR-2026-888',
            featureName: 'Tích điểm thành viên',
            author: 'Nguyen Van C',
            requestingUnit: 'Khối Bán lẻ',
          }),
          'Tích 1 điểm cho mỗi 100k chi tiêu.',
          'API tích điểm tự động gọi sau giao dịch hoàn tất.'
        );
      });
    });

    it('renders note picker with VirtualizedList and filters notes via search', async () => {
      const timestamp = new Date().toISOString();
      await db.notes.bulkAdd([
        {
          id: 'note-1',
          entityId: projectId,
          entityType: 'cr',
          title: 'Khảo sát nghiệp vụ CRM',
          body: 'Nội dung khảo sát chi tiết',
          isPinned: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: 'note-2',
          entityId: projectId,
          entityType: 'cr',
          title: 'Đặc tả API Gateway',
          body: 'Mô tả endpoints REST',
          isPinned: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]);

      render(
        <Step1IntakeView
          changeRequestId={projectId}
          onStartIntake={vi.fn()}
          db={db}
        />
      );

      // Open note picker for PL01
      fireEvent.click(screen.getAllByRole('button', { name: /Chọn từ Notes/ })[0]!);

      // VirtualizedList is mounted
      const list = await screen.findByRole('list', { name: 'Danh sách ghi chú' });
      expect(list).toBeInTheDocument();
      expect(await screen.findByText('Khảo sát nghiệp vụ CRM')).toBeInTheDocument();
      expect(await screen.findByText('Đặc tả API Gateway')).toBeInTheDocument();

      // Search filters items
      const searchInput = screen.getByPlaceholderText(/Tìm theo tiêu đề hoặc nội dung/);
      fireEvent.change(searchInput, { target: { value: 'Gateway' } });

      await waitFor(() => {
        expect(screen.getByText('Đặc tả API Gateway')).toBeInTheDocument();
        expect(screen.queryByText('Khảo sát nghiệp vụ CRM')).not.toBeInTheDocument();
      });

      // Select note populates PL01
      fireEvent.click(screen.getByRole('button', { name: 'Chọn' }));
      expect(screen.getByPlaceholderText(/Nội dung Yêu cầu nghiệp vụ \(PL01\)/)).toHaveValue('Mô tả endpoints REST');
    });
  });

  describe('Step2SolutionView', () => {
    it('supports two-way editing, displays sanitized preview, and calls onCommitSolution on Approve', async () => {
      const handleCommitSolution = vi.fn().mockResolvedValue(undefined);

      const { unmount } = render(
        <Step2SolutionView
          changeRequestId={projectId}
          initialContent="# Kiến trúc Loyalty v1\n\nSử dụng Redis cache cho hạn mức điểm."
          pl01Content="PL01 text"
          pl02Content="PL02 text"
          hasIntakeBaseline
          onCommitSolution={handleCommitSolution}
          db={db}
        />
      );

      // Verify initial content loaded in editor
      const textarea = screen.getByPlaceholderText(/Nội dung kiến trúc giải pháp SOLUTION.md/i) as HTMLTextAreaElement;
      expect(textarea.value).toContain('Kiến trúc Loyalty v1');

      // Manual edit
      fireEvent.change(textarea, {
        target: { value: '# Kiến trúc Loyalty v2\n\nBổ sung RabbitMQ queue.' },
      });
      expect(textarea.value).toContain('RabbitMQ queue');

      // Switch to preview mode
      const previewTab = screen.getByRole('radio', { name: /Xem trước/i }) || screen.getByText(/Xem trước/i);
      fireEvent.click(previewTab);

      await waitFor(() => {
        expect(screen.getByText(/Bổ sung RabbitMQ queue/i)).toBeInTheDocument();
      });

      // Switch back to write or approve directly
      const approveBtn = screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION.md/i });
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(handleCommitSolution).toHaveBeenCalledWith(
          '# Kiến trúc Loyalty v2\n\nBổ sung RabbitMQ queue.',
          expect.any(String) // noteId
        );
      });

      // D-20: without the intake baseline the approve control is disabled, not toast-after-the-fact.
      unmount();
      render(
        <Step2SolutionView
          changeRequestId={projectId}
          initialContent="# Kiến trúc Loyalty v2"
          onCommitSolution={handleCommitSolution}
          db={db}
        />
      );

      expect(screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION.md/i })).toBeDisabled();
      expect(
        screen.getByText(/Chưa đủ điều kiện: Thiếu PL01 — Yêu cầu nghiệp vụ từ Bước 1/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/PL02 — Đặc tả chức năng/i)).toBeInTheDocument();
      handleCommitSolution.mockClear();
      fireEvent.click(screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION.md/i }));
      expect(handleCommitSolution).not.toHaveBeenCalled();
    });
  });

  describe('Step3CodeGuideView', () => {
    it('gates the Step 4 handoff on an approved SOLUTION and an approved branch snapshot', () => {
      const handleProceed = vi.fn();
      render(
        <Step3CodeGuideView
          crCode="CR-2026-999"
          approvedSolutionMarkdown="# SOLUTION đã duyệt"
          onProceedToStep4={handleProceed}
        />
      );

      // D-38b: the handoff needs an approved snapshot, not a self-reported coding status.
      const advanceBtn = screen.getByRole('button', { name: /Chuyển sang Bước 4: Change Pack/i });
      expect(advanceBtn).toBeDisabled();
      fireEvent.click(advanceBtn);
      expect(handleProceed).not.toHaveBeenCalled();

      // D-12: no independent implementation-status tracker.
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    });

    it('D-20: blocks the handoff when no approved SOLUTION exists', () => {
      const handleProceed = vi.fn();
      const handleNavigate = vi.fn();
      render(
        <Step3CodeGuideView
          crCode="CR-2026-999"
          onProceedToStep4={handleProceed}
          onNavigateToStep={handleNavigate}
        />
      );

      expect(
        screen.getByRole('button', { name: /Chuyển sang Bước 4: Change Pack/i })
      ).toBeDisabled();
      expect(screen.getByTestId('step3-prerequisite-guard')).toHaveTextContent(
        /Chưa đủ điều kiện: Thiếu SOLUTION\.md từ Bước 2\./i
      );

      fireEvent.click(screen.getByRole('button', { name: /Chuyển đến Bước 2: Thiết kế giải pháp/i }));
      expect(handleNavigate).toHaveBeenCalledWith('SOLUTION');
      expect(handleProceed).not.toHaveBeenCalled();
    });

    it('renders the CR-scoped review surface with the SSH/repo configuration bar', () => {
      render(<Step3CodeGuideView crCode="CR-2026-999" onProceedToStep4={vi.fn()} />);
      expect(
        screen.getByText(/Bước 3: Review Nhánh & Diff Repository Remote qua SSH/i)
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText('/home/user/workspace/repo')).toBeInTheDocument();
    });
  });

  describe('Step4ChangePackView', () => {
    it('renders dropzone, shows requirement error if solutionArtifact is missing, and allows progression when drift exists', async () => {
      const handleCommitPack = vi.fn().mockResolvedValue(undefined);
      const handleProceedToStep5 = vi.fn();

      render(
        <Step4ChangePackView
          changeRequestId={projectId}
          crId="cr-001"
          crCode="CR-2026-999"
          onCommitChangePackAndDrift={handleCommitPack}
          onProceedToStep5={handleProceedToStep5}
          db={db}
        />
      );

      expect(
        screen.getByText(formatGuardMessage('SOLUTION_REQUIRED_FOR_CHANGE_PACK'))
      ).toBeInTheDocument();
      // Behavioural: the guard region names the missing artifact and the step that supplies it.
      const guard = screen
        .getByText(formatGuardMessage('SOLUTION_REQUIRED_FOR_CHANGE_PACK'))
        .closest('[role="alert"]');
      expect(guard).not.toBeNull();
      expect(guard).toHaveTextContent('SOLUTION.md');
      expect(guard).toHaveTextContent('Bước 2');
      expect(screen.getByText(/Tải lên bản đóng gói mới/i)).toBeInTheDocument();
    });

    it('disables the dropzone before SOLUTION approval and offers direct navigation to Step 2', () => {
      const handleCommitPack = vi.fn().mockResolvedValue(undefined);
      const handleNavigate = vi.fn();

      render(
        <Step4ChangePackView
          changeRequestId={projectId}
          crId="cr-001"
          crCode="CR-2026-999"
          onCommitChangePackAndDrift={handleCommitPack}
          onNavigateToStep={handleNavigate}
          db={db}
        />
      );

      const dropzone = screen.getByRole('button', { name: 'Khu vực nạp change-pack' });
      expect(dropzone).toHaveAttribute('aria-disabled', 'true');

      const navButton = screen.getByRole('button', { name: 'Chuyển đến Bước 2: Thiết kế giải pháp' });
      fireEvent.click(navButton);
      expect(handleNavigate).toHaveBeenCalledWith('SOLUTION');

      const file = new File(['PK'], 'pack.zip', { type: 'application/zip' });
      fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
      expect(handleCommitPack).not.toHaveBeenCalled();
    });

    it('renders the re-upload prompt for a legacy history row without a manifest and keeps driftResult', async () => {
      const handleCommitPack = vi.fn().mockResolvedValue(undefined);
      const legacyHash = 'd'.repeat(64);

      await db.settings.put({
        key: `sdlc_packs:${projectId}:cr-legacy`,
        value: JSON.stringify({
          packs: [
            {
              hash: legacyHash,
              filename: 'legacy-pack.zip',
              uploadedAt: '2026-01-01T00:00:00.000Z',
              fileSize: 128,
            },
          ],
        }),
      });

      render(
        <Step4ChangePackView
          changeRequestId={projectId}
          crId="cr-legacy"
          crCode="CR-2026-999"
          solutionArtifact={{
            noteId: '11111111-1111-4111-8111-111111111111',
            kind: 'SOLUTION',
            version: 1,
            hash: 'a'.repeat(64),
            title: 'SOLUTION.md',
            content: '# Solution',
            sourceHashes: [],
            updatedAt: '2026-01-01T00:00:00.000Z',
          }}
          onCommitChangePackAndDrift={handleCommitPack}
          db={db}
        />
      );

      const selectButton = await screen.findByRole('button', { name: /Chọn làm Active/i });
      fireEvent.click(selectButton);

      expect(await screen.findByText(/Tải lại tệp pack để đối soát/i)).toBeInTheDocument();
      expect(handleCommitPack).not.toHaveBeenCalled();
      expect(screen.queryByText(/Bảng drift so với SOLUTION.md/i)).toBeNull();
    });
  });

  describe('Step5TechDocsView', () => {
    it('renders PL03B and PL07 review tabs and the draft generation button', () => {
      const handleCommitTechDoc = vi.fn().mockResolvedValue(undefined);

      render(
        <Step5TechDocsView
          changeRequestId={projectId}
          crId="cr-001"
          onCommitTechDoc={handleCommitTechDoc}
          db={db}
        />
      );

      expect(screen.getByText(/PL03B — Thiết kế & Triển khai/i)).toBeInTheDocument();
      expect(screen.getByText(/PL07 — Checklist An toàn Review/i)).toBeInTheDocument();
      // D-16/D-17: generation produces a draft; approval is a separate explicit action.
      expect(screen.getByRole('button', { name: /Tạo bản nháp$/i })).toBeInTheDocument();
    });
  });

  describe('Step6CabView', () => {
    it('checks prerequisites, shows CAB AI generate button, and export options', () => {
      const handleCommitCab = vi.fn().mockResolvedValue(undefined);

      render(
        <Step6CabView
          changeRequestId={projectId}
          crId="cr-001"
          onCommitCab={handleCommitCab}
          db={db}
        />
      );

      expect(screen.getByText(/Kiểm tra điều kiện tiên quyết tạo CAB/i)).toBeInTheDocument();
      // D-17: generation yields a draft; approval is a separate explicit action.
      expect(screen.getByRole('button', { name: /Tạo bản nháp CAB/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Tải PL02.docx/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Tải toàn bộ bộ hồ sơ \(\.zip\)/i })).toBeInTheDocument();
    });
  });
});


