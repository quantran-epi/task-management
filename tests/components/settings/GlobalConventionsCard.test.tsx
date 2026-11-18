import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GlobalConventionsCard } from '../../../src/components/settings/GlobalConventionsCard';
import { TaskPlannerDatabase } from '../../../src/db/index';
import { GLOBAL_CONVENTIONS_SETTING_KEY } from '../../../src/services/conventionService';

describe('GlobalConventionsCard component', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestCardDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders initial empty state with "Chưa thiết lập" tag', async () => {
    render(<GlobalConventionsCard db={testDb} />);

    await waitFor(() => {
      expect(screen.getByText('Quy ước tổ chức (Global Conventions)')).toBeDefined();
      expect(screen.getByText('Chưa thiết lập')).toBeDefined();
      expect(screen.getByLabelText('Nội dung quy ước tổ chức Markdown')).toBeDefined();
    });

    const textarea = screen.getByLabelText('Nội dung quy ước tổ chức Markdown') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });

  it('loads existing conventions and shows "Đã cấu hình" tag', async () => {
    await testDb.settings.put({
      key: GLOBAL_CONVENTIONS_SETTING_KEY,
      value: '# Quy ước đã lưu',
    });

    render(<GlobalConventionsCard db={testDb} />);

    await waitFor(() => {
      expect(screen.getByText('Đã cấu hình')).toBeDefined();
    });

    const textarea = screen.getByLabelText('Nội dung quy ước tổ chức Markdown') as HTMLTextAreaElement;
    expect(textarea.value).toBe('# Quy ước đã lưu');
  });

  it('saves new content on primary button click', async () => {
    render(<GlobalConventionsCard db={testDb} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Nội dung quy ước tổ chức Markdown')).toBeDefined();
    });

    const textarea = screen.getByLabelText('Nội dung quy ước tổ chức Markdown');
    fireEvent.change(textarea, { target: { value: '# Chuẩn API mới' } });

    const saveBtn = screen.getByRole('button', { name: 'Lưu quy ước tổ chức' });
    fireEvent.click(saveBtn);

    await waitFor(async () => {
      const stored = await testDb.settings.get(GLOBAL_CONVENTIONS_SETTING_KEY);
      expect(stored?.value).toBe('# Chuẩn API mới');
    });

    expect(screen.getByText('Đã cấu hình')).toBeDefined();
  });

  it('opens preview modal when clicking "Xem trước Markdown"', async () => {
    render(<GlobalConventionsCard db={testDb} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Nội dung quy ước tổ chức Markdown')).toBeDefined();
    });

    const textarea = screen.getByLabelText('Nội dung quy ước tổ chức Markdown');
    fireEvent.change(textarea, { target: { value: '## Tiêu chuẩn mã nguồn' } });

    const previewBtn = screen.getByRole('button', { name: 'Xem trước Markdown' });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(screen.getByText('Xem trước Quy ước tổ chức (Markdown)')).toBeDefined();
      expect(screen.getByText('Tiêu chuẩn mã nguồn')).toBeDefined();
    });
  });
});
