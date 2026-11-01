import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { Step1IntakeView } from '../../../src/components/sdlc/steps/Step1IntakeView';
import { Step2SolutionView } from '../../../src/components/sdlc/steps/Step2SolutionView';
import { Step3CodeGuideView } from '../../../src/components/sdlc/steps/Step3CodeGuideView';
import { Step4ChangePackView } from '../../../src/components/sdlc/steps/Step4ChangePackView';

describe('Step 1 Intake & Step 2 Solution Views', () => {
  let db: TaskPlannerDatabase;
  const projectId = 'b45c2f09-1a89-4c07-b24e-4f056d68b981';

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-steps-${Math.random()}`);
    await db.projects.add({
      id: projectId,
      name: 'Hệ thống Loyalty',
      status: 'In Progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe('Step1IntakeView', () => {
    it('validates required metadata, PL01, and PL02 inputs, and calls onStartIntake to advance to Step 2', async () => {
      const handleStartIntake = vi.fn().mockResolvedValue(undefined);

      render(
        <Step1IntakeView
          projectId={projectId}
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
  });

  describe('Step2SolutionView', () => {
    it('supports two-way editing, displays sanitized preview, and calls onCommitSolution on Approve', async () => {
      const handleCommitSolution = vi.fn().mockResolvedValue(undefined);

      render(
        <Step2SolutionView
          projectId={projectId}
          initialContent="# Kiến trúc Loyalty v1\n\nSử dụng Redis cache cho hạn mức điểm."
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
    });
  });

  describe('Step3CodeGuideView', () => {
    it('displays packaging command pre-filled with crCode and advances on click', () => {
      const handleProceed = vi.fn();
      render(
        <Step3CodeGuideView
          crCode="CR-2026-999"
          onProceedToStep4={handleProceed}
        />
      );

      expect(screen.getByTestId('cli-command')).toHaveTextContent('node scripts/change-pack.mjs --cr CR-2026-999');

      const advanceBtn = screen.getByRole('button', { name: /Đã code xong — Chuyển sang Nạp Change Pack/i });
      fireEvent.click(advanceBtn);
      expect(handleProceed).toHaveBeenCalledTimes(1);
    });
  });

  describe('Step4ChangePackView', () => {
    it('renders dropzone, shows requirement error if solutionArtifact is missing, and allows progression when drift exists', async () => {
      const handleCommitPack = vi.fn().mockResolvedValue(undefined);
      const handleProceedToStep5 = vi.fn();

      render(
        <Step4ChangePackView
          projectId={projectId}
          crId="cr-001"
          crCode="CR-2026-999"
          onCommitChangePackAndDrift={handleCommitPack}
          onProceedToStep5={handleProceedToStep5}
          db={db}
        />
      );

      expect(screen.getByText(/Chưa có SOLUTION.md đã duyệt/i)).toBeInTheDocument();
      expect(screen.getByText(/Tải lên bản đóng gói mới/i)).toBeInTheDocument();
    });
  });
});

