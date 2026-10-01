import React, { useState } from 'react';
import { Alert, Button, Card, Descriptions, Modal, Space, Tag, Typography, notification } from 'antd';
import { DatabaseOutlined, SaveOutlined, FolderOpenOutlined, DownloadOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  flushLocalSqliteNow,
  hydrateDexieFromSqlite,
  selectAndConfigureSqlitePath,
  SQLITE_SETTING_KEYS,
} from '../../services/localSqlitePersistence';

const { Paragraph, Text } = Typography;

export interface LocalSqlitePersistenceCardProps {
  db?: TaskPlannerDatabase;
}

export const LocalSqlitePersistenceCard: React.FC<LocalSqlitePersistenceCardProps> = ({
  db = defaultDb,
}) => {
  const [busy, setBusy] = useState(false);

  const state = useLiveQuery(async () => {
    const [path, enabled, lastFlushAt, missingPath, queue] = await Promise.all([
      db.settings.get(SQLITE_SETTING_KEYS.path),
      db.settings.get(SQLITE_SETTING_KEYS.enabled),
      db.settings.get(SQLITE_SETTING_KEYS.lastFlushAt),
      db.settings.get(SQLITE_SETTING_KEYS.missingPath),
      db.settings.get(SQLITE_SETTING_KEYS.queue),
    ]);
    return {
      path: typeof path?.value === 'string' ? path.value : '',
      enabled: enabled?.value === true,
      lastFlushAt: typeof lastFlushAt?.value === 'string' ? lastFlushAt.value : '',
      missingPath: missingPath?.value === true,
      queued: Array.isArray(queue?.value) ? queue.value.length : 0,
    };
  }, [db]);

  const selectPath = async () => {
    setBusy(true);
    try {
      const path = await selectAndConfigureSqlitePath(db);
      if (path) notification.success({ message: 'Đã kết nối SQLite', description: path });
    } catch (err: any) {
      notification.error({ message: 'Không thể chọn tệp SQLite', description: err?.message || String(err) });
    } finally {
      setBusy(false);
    }
  };

  const flush = async () => {
    setBusy(true);
    try {
      const result = await flushLocalSqliteNow(db);
      if (result.missingPath) {
        notification.warning({ message: 'Không tìm thấy tệp SQLite', description: 'Vui lòng chọn lại tệp.' });
      } else {
        notification.success({ message: 'Đã ghi SQLite', description: `${result.flushed} thay đổi.` });
      }
    } catch (err: any) {
      notification.error({ message: 'Không thể ghi SQLite', description: err?.message || String(err) });
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = async () => {
    const count = await Promise.all([
      db.projects.count(),
      db.milestones.count(),
      db.tasks.count(),
      db.capacityRules.count(),
      db.capacityOverrides.count(),
      db.plannedAllocations.count(),
      db.workSessions.count(),
    ]).then((counts) => counts.reduce((sum, n) => sum + n, 0));

    const run = async () => {
      setBusy(true);
      try {
        const rows = await hydrateDexieFromSqlite(db);
        notification.success({ message: 'Đã khôi phục từ SQLite', description: `${rows} dòng.` });
      } catch (err: any) {
        notification.error({ message: 'Không thể khôi phục SQLite', description: err?.message || String(err) });
      } finally {
        setBusy(false);
      }
    };

    if (count > 0) {
      Modal.confirm({
        title: 'Khôi phục từ SQLite?',
        content: 'Dữ liệu SQLite sẽ ghi đè các dòng trùng khóa trong IndexedDB hiện tại.',
        okText: 'Khôi phục',
        cancelText: 'Hủy',
        onOk: run,
      });
    } else {
      await run();
    }
  };

  return (
    <Card
      title={
        <Space>
          <DatabaseOutlined />
          <span>Lưu cục bộ SQLite cho desktop</span>
        </Space>
      }
      extra={state?.enabled ? <Tag color="success">Đã bật</Tag> : <Tag>Chưa bật</Tag>}
    >
      <Paragraph type="secondary">
        SQLite là bản sao plaintext trên máy desktop. IndexedDB vẫn là nguồn dữ liệu chạy chính.
      </Paragraph>

      {state?.missingPath && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Không tìm thấy tệp SQLite"
          description="Ứng dụng không tự tạo lại hoặc ghi đè tệp bị mất. Dữ liệu IndexedDB hiện tại được giữ nguyên; hãy chọn lại tệp để tiếp tục lưu."
        />
      )}

      <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Đường dẫn">
          {state?.path ? <Text code>{state.path}</Text> : <Text type="secondary">Chưa chọn</Text>}
        </Descriptions.Item>
        <Descriptions.Item label="Hàng đợi ghi">{state?.queued ?? 0}</Descriptions.Item>
        <Descriptions.Item label="Lần ghi gần nhất">
          {state?.lastFlushAt ? dayjs(state.lastFlushAt).format('DD/MM/YYYY HH:mm:ss') : 'Chưa có'}
        </Descriptions.Item>
      </Descriptions>

      <Space wrap>
        <Button icon={<FolderOpenOutlined />} loading={busy} onClick={selectPath}>
          Chọn tệp SQLite
        </Button>
        <Button icon={<SaveOutlined />} loading={busy} disabled={!state?.enabled} onClick={flush}>
          Ghi ngay
        </Button>
        <Button icon={<DownloadOutlined />} loading={busy} disabled={!state?.enabled} onClick={confirmRestore}>
          Khôi phục từ tệp
        </Button>
      </Space>
    </Card>
  );
};
