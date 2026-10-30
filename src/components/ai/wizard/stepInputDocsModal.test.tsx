import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { db } from '../../../db';
import { StepInputDocsModal } from '../StepInputDocsModal';
import { NoteSourcePickerModal } from '../NoteSourcePickerModal';
import {
  buildMergedSdlcInput,
  type SdlcSourceRef,
} from '../../../services/wizard/sourceMerge';

const projectId = '22222222-2222-4222-8222-222222222222';
const otherProjectId = '99999999-9999-4999-8999-999999999999';

describe('StepInputDocsModal and NoteSourcePickerModal', () => {
  beforeEach(async () => {
    await db.notes.clear();

    // Seed notes
    await db.notes.bulkAdd([
      {
        id: '11111111-1111-4111-8111-000000000001',
        title: 'PL01 Yêu cầu Core Banking',
        body: '# Yêu cầu\n\nKhách hàng VIP được giảm 50% phí chuyển khoản.',
        entityType: 'project',
        entityId: projectId,
        isPinned: false,
        sdlcArtifact: { kind: 'PL01', version: 2 },
        createdAt: '2026-10-30T00:00:00.000Z',
        updatedAt: '2026-10-30T01:00:00.000Z',
      },
      {
        id: '11111111-1111-4111-8111-000000000002',
        title: 'PL02 Đặc tả API Chuyển tiền',
        body: '# API Spec\n\nEndpoint POST /api/transfer. Hạn mức tối đa 500 triệu.',
        entityType: 'project',
        entityId: projectId,
        isPinned: false,
        sdlcArtifact: { kind: 'PL02', version: 1 },
        createdAt: '2026-10-30T00:00:00.000Z',
        updatedAt: '2026-10-30T02:00:00.000Z',
      },
      {
        id: '11111111-1111-4111-8111-000000000003',
        title: 'Quy định bảo mật chung hệ thống',
        body: '# Security Guideline\n\nMọi request phải có JWT token và timestamp.',
        entityType: 'project',
        entityId: otherProjectId,
        isPinned: false,
        createdAt: '2026-10-30T00:00:00.000Z',
        updatedAt: '2026-10-30T03:00:00.000Z',
      },
    ]);
  });

  describe('NoteSourcePickerModal', () => {
    it('hiển thị danh sách Note theo phạm vi dự án mặc định và chuyển sang toàn hệ thống', async () => {
      const onApply = vi.fn();
      render(
        <NoteSourcePickerModal
          open={true}
          title="Chọn nguồn yêu cầu nghiệp vụ (PL01)"
          projectId={projectId}
          initialSelectedIds={[]}
          onApply={onApply}
          onClose={vi.fn()}
        />
      );

      // Mặc định phạm vi "Chỉ dự án hiện tại"
      await waitFor(() => {
        expect(screen.getByText('PL01 Yêu cầu Core Banking')).toBeInTheDocument();
        expect(screen.getByText('PL02 Đặc tả API Chuyển tiền')).toBeInTheDocument();
      });
      // Tài liệu dự án khác chưa xuất hiện trong phạm vi dự án
      expect(screen.queryByText('Quy định bảo mật chung hệ thống')).not.toBeInTheDocument();

      // Chuyển scope sang "Toàn hệ thống"
      const allScopeOption = screen.getByText('Toàn hệ thống');
      fireEvent.click(allScopeOption);

      await waitFor(() => {
        expect(screen.getByText('Quy định bảo mật chung hệ thống')).toBeInTheDocument();
      });
    });

    it('hỗ trợ tìm kiếm theo tiêu đề tài liệu', async () => {
      render(
        <NoteSourcePickerModal
          open={true}
          title="Chọn nguồn yêu cầu nghiệp vụ (PL01)"
          projectId={projectId}
          initialSelectedIds={[]}
          onApply={vi.fn()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('PL01 Yêu cầu Core Banking')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Tìm theo tiêu đề tài liệu…');
      fireEvent.change(searchInput, { target: { value: 'API' } });

      await waitFor(() => {
        expect(screen.queryByText('PL01 Yêu cầu Core Banking')).not.toBeInTheDocument();
        expect(screen.getByText('PL02 Đặc tả API Chuyển tiền')).toBeInTheDocument();
      });
    });

    it('cho phép chọn nhiều Note, xem trước an toàn và nút áp dụng mang đúng số lượng', async () => {
      const handleApply = vi.fn();
      render(
        <NoteSourcePickerModal
          open={true}
          title="Chọn nguồn yêu cầu nghiệp vụ (PL01)"
          projectId={projectId}
          initialSelectedIds={[]}
          onApply={handleApply}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('PL01 Yêu cầu Core Banking')).toBeInTheDocument();
      });

      // Preview pane ban đầu
      expect(screen.getByText('Chọn một tài liệu để xem trước nội dung.')).toBeInTheDocument();

      // Click vào row để xem preview
      const row = screen.getByText('PL01 Yêu cầu Core Banking');
      fireEvent.click(row);

      // Xem trước an toàn render tiêu đề và nội dung markdown
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Yêu cầu' })).toBeInTheDocument();
      });

      // Checkbox chọn 1 note
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThanOrEqual(2);
      fireEvent.click(checkboxes[0]!);

      // Nút Áp dụng có label đúng: "Áp dụng 1 nguồn"
      const applyBtn = screen.getByRole('button', { name: /Áp dụng 1 nguồn/i });
      expect(applyBtn).toBeEnabled();

      fireEvent.click(applyBtn);

      expect(handleApply).toHaveBeenCalledTimes(1);
      const applied = handleApply.mock.calls[0]![0] as SdlcSourceRef[];
      expect(applied).toHaveLength(1);
      expect(applied[0]?.id).toBe('11111111-1111-4111-8111-000000000001');
      expect(applied[0]?.version).toBe(2);
      expect(applied[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(applied[0]?.title).toBe('PL01 Yêu cầu Core Banking');
    });
  });

  describe('StepInputDocsModal tính độc lập PL01/PL02 và tính bất biến của Note', () => {
    it('cho phép chọn nguồn riêng biệt cho PL01 và PL02, kết hợp văn bản tự do', async () => {
      const handleSubmit = vi.fn();
      const handleClose = vi.fn();

      render(
        <StepInputDocsModal
          open={true}
          project={{ id: projectId, name: 'TaskMate Core' }}
          currentUser="Developer"
          today="2026-10-30"
          onSubmit={handleSubmit}
          onClose={handleClose}
        />
      );

      expect(screen.getByText('1. Tài liệu Yêu cầu Nghiệp vụ (PL01)')).toBeInTheDocument();
      expect(screen.getByText('2. Tài liệu Đặc tả Chức năng (PL02)')).toBeInTheDocument();

      // Kiểm tra 2 nút "Chọn nguồn" riêng biệt cho PL01 và PL02
      const chooseButtons = screen.getAllByRole('button', { name: /Chọn nguồn/i });
      expect(chooseButtons.length).toBe(2);

      // Nhập text cho PL01 và PL02
      const pl01Input = screen.getByPlaceholderText(/Dán nội dung Yêu cầu nghiệp vụ PL01/i);
      const pl02Input = screen.getByPlaceholderText(/Dán nội dung Đặc tả chức năng PL02/i);

      fireEvent.change(pl01Input, { target: { value: 'Free text PL01' } });
      fireEvent.change(pl02Input, { target: { value: 'Free text PL02' } });

      const submitBtn = screen.getByRole('button', { name: /Bắt đầu Phân tích Solution/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(handleSubmit).toHaveBeenCalled();
      });

      // Verify Note in DB was NOT modified (immutability check)
      const note1 = await db.notes.get('11111111-1111-4111-8111-000000000001');
      expect(note1?.body).toBe('# Yêu cầu\n\nKhách hàng VIP được giảm 50% phí chuyển khoản.');
      expect(note1?.updatedAt).toBe('2026-10-30T01:00:00.000Z');
    });
  });

  describe('D-19 buildMergedSdlcInput citation closure and conflict warnings', () => {
    it('giữ nguyên source ID/version/hash, sinh citations khép kín, và phát hiện mâu thuẫn', async () => {
      const source1: SdlcSourceRef = {
        id: '11111111-1111-4111-8111-000000000001',
        title: 'PL01 Yêu cầu',
        body: 'Hạn mức chuyển tiền: 500 triệu.',
        version: 2,
        hash: '01'.repeat(32),
        updatedAt: '2026-10-30T01:00:00.000Z',
      };

      const source2: SdlcSourceRef = {
        id: '11111111-1111-4111-8111-000000000002',
        title: 'PL02 Đặc tả',
        body: 'Hạn mức chuyển tiền: 1000 triệu.',
        version: 1,
        hash: '02'.repeat(32),
        updatedAt: '2026-10-30T02:00:00.000Z',
      };

      const merged = await buildMergedSdlcInput({
        pl01Text: 'Bổ sung yêu cầu free-text PL01.',
        pl02Text: 'Bổ sung đặc tả free-text PL02.',
        pl01Sources: [source1],
        pl02Sources: [source2],
      });

      // Nguồn được bảo toàn
      expect(merged.pl01Sources).toHaveLength(1);
      expect(merged.pl01Sources[0]?.id).toBe(source1.id);
      expect(merged.pl01Sources[0]?.version).toBe(2);
      expect(merged.pl01Sources[0]?.hash).toBe(source1.hash);

      expect(merged.pl02Sources).toHaveLength(1);
      expect(merged.pl02Sources[0]?.id).toBe(source2.id);

      // Citations khép kín: mọi citation sourceId phải thuộc danh sách source refs
      const allowedSourceIds = new Set([source1.id, source2.id]);
      expect(merged.citations.length).toBeGreaterThan(0);
      for (const citation of merged.citations) {
        expect(allowedSourceIds.has(citation.sourceId)).toBe(true);
      }

      // Conflict warning được phát hiện khi các nguồn mâu thuẫn
      expect(merged.conflicts.length).toBeGreaterThan(0);
      expect(merged.conflicts[0]?.topic).toContain('Hạn mức chuyển tiền');
    });
  });
});
