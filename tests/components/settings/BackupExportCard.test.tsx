import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { notification } from 'antd';
import { TaskPlannerDatabase } from '../../../src/db/index';
import { BackupExportCard } from '../../../src/components/settings/BackupExportCard';
import * as exportBackupService from '../../../src/services/backup/exportBackup';
import * as ariaModule from '../../../src/components/common/AriaLiveRegion';

describe('BackupExportCard', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestExportCardDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders card title, export button, and empty state when no backups exist', async () => {
    render(<BackupExportCard db={testDb} />);

    expect(screen.getByText('Sao lưu dữ liệu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xuất bản sao lưu \(JSON\)/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Chưa có lịch sử sao lưu/i)).toBeInTheDocument();
    });
  });

  it('displays formatted last backup timestamp and record count when metadata exists', async () => {
    await testDb.backupMetadata.add({
      id: '88888888-8888-4888-8888-888888888888',
      timestamp: '2026-09-27T14:30:00.000Z',
      appVersion: '0.1.0',
      recordCount: 42,
    });

    render(<BackupExportCard db={testDb} />);

    await waitFor(() => {
      expect(screen.getByText(/Lần sao lưu gần nhất/i)).toBeInTheDocument();
      expect(screen.getByText(/42 bản ghi/i)).toBeInTheDocument();
    });
  });

  it('handles export click: triggers export service, file download, notification, and aria announcement', async () => {
    const triggerDownloadSpy = vi.spyOn(exportBackupService, 'triggerDownload').mockImplementation(() => {});
    const announceSpy = vi.spyOn(ariaModule, 'announceToScreenReader').mockImplementation(() => {});
    const notificationSpy = vi.spyOn(notification, 'success').mockImplementation(() => ({} as any));

    render(<BackupExportCard db={testDb} />);

    const exportBtn = screen.getByRole('button', { name: /Xuất bản sao lưu \(JSON\)/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(triggerDownloadSpy).toHaveBeenCalledTimes(1);
    });

    expect(announceSpy).toHaveBeenCalledWith('Đang tạo tệp sao lưu...');
    expect(notificationSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Đã xuất bản sao lưu thành công',
      })
    );
    expect(announceSpy).toHaveBeenCalledWith(
      expect.stringContaining('Đã xuất bản sao lưu thành công')
    );

    // Verify backupMetadata was logged in DB
    const entries = await testDb.backupMetadata.toArray();
    expect(entries.length).toBeGreaterThan(0);
  });
});
