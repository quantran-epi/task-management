import React, { useState } from 'react';
import { Alert, Button, Card, Space, Typography } from '../ui';
import { BugOutlined } from '../ui/icon';
import { saveFileWithPicker } from '../../utils/fileExport';
import { isTauriApp } from '../../utils/timerPopout';

const { Text, Paragraph } = Typography;

/**
 * Debug-only export of the bounded SQLcl PTY trace kept in the Tauri process. Reproduce the
 * Oracle tool failure first, then save the log here; exported text is escaped and redacted but
 * should still be reviewed before sharing.
 */
export const SqlclPtyDebugCard: React.FC = () => {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    if (!isTauriApp()) {
      return;
    }
    setBusy(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const trace = await invoke<string>('sqlcl_pty_dump_export', { clear: false });
      await saveFileWithPicker('sqlcl-pty-debug.log', new Blob([trace], { type: 'text/plain' }), {
        title: 'Lưu nhật ký PTY SQLcl (debug)',
        filters: [{ name: 'Log', extensions: ['log', 'txt'] }],
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={<span><BugOutlined style={{ marginRight: 8, color: 'var(--accent)' }} />SQLcl PTY debug log</span>}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="Chỉ dùng khi đang điều tra lỗi Oracle SQLcl"
          description="TaskMate ghi lại tối đa 64 KiB dữ liệu PTY gần nhất trong bộ nhớ. Repro lỗi xong bấm nút để lưu file .log, rồi kiểm tra lại trước khi gửi cho người phát triển."
        />
        <Button type="default" loading={busy} disabled={!isTauriApp()} onClick={handleExport}>
          Xuất nhật ký PTY SQLcl
        </Button>
        {!isTauriApp() && <Text type="secondary">Tính năng chỉ khả dụng trong app desktop.</Text>}
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Nội dung đã escape ký tự điều khiển và redact theo keyword; vẫn nên rà tay connection string/user/hostname trước khi chia sẻ.
        </Paragraph>
      </Space>
    </Card>
  );
};
