import React, { useMemo, useState } from 'react';
import {
  Modal,
  Input,
  Typography,
  Alert,
  Table,
  Tag,
  Descriptions,
  Space,
  notification,
} from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { validateBackupPayload } from '../../services/backup/validateBackup';
import { restoreBackupPayload } from '../../services/backup/restoreBackup';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Text, Paragraph } = Typography;

export interface ImportPreviewModalProps {
  open: boolean;
  payload: unknown;
  rawFileName: string;
  db?: TaskPlannerDatabase;
  onClose: () => void;
  onRestoreSuccess: (snapshotTime: string) => void;
}

interface TableComparisonRow {
  key: string;
  tableName: string;
  currentCount: number;
  incomingCount: number;
  delta: number;
}

const TABLE_NAMES: Record<string, string> = {
  projects: 'Dự án (Projects)',
  milestones: 'Cột mốc (Milestones)',
  tasks: 'Tác vụ (Tasks)',
  capacityRules: 'Quy tắc công suất (Capacity Rules)',
  capacityOverrides: 'Ngoại lệ công suất (Capacity Overrides)',
  plannedAllocations: 'Phân bổ kế hoạch (Planned Allocations)',
};

export const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({
  open,
  payload,
  rawFileName,
  db = defaultDb,
  onClose,
  onRestoreSuccess,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  // Validate payload in-memory
  const validationResult = useMemo(() => {
    if (!payload) {
      return { valid: false, errors: [] };
    }
    return validateBackupPayload(payload);
  }, [payload]);

  // Query current counts from local database
  const currentCounts = useLiveQuery(
    async () => {
      const [p, m, t, cr, co, pa] = await Promise.all([
        db.projects.count(),
        db.milestones.count(),
        db.tasks.count(),
        db.capacityRules.count(),
        db.capacityOverrides.count(),
        db.plannedAllocations.count(),
      ]);
      return {
        projects: p,
        milestones: m,
        tasks: t,
        capacityRules: cr,
        capacityOverrides: co,
        plannedAllocations: pa,
      };
    },
    [db],
    {
      projects: 0,
      milestones: 0,
      tasks: 0,
      capacityRules: 0,
      capacityOverrides: 0,
      plannedAllocations: 0,
    }
  );

  const comparisonData: TableComparisonRow[] = useMemo(() => {
    if (!validationResult.valid || !validationResult.envelope) {
      return [];
    }

    const incoming = validationResult.envelope.counts;
    const current = currentCounts ?? {
      projects: 0,
      milestones: 0,
      tasks: 0,
      capacityRules: 0,
      capacityOverrides: 0,
      plannedAllocations: 0,
    };

    return Object.keys(TABLE_NAMES).map((tableKey) => {
      const cur = (current as any)[tableKey] ?? 0;
      const inc = (incoming as any)[tableKey] ?? 0;
      return {
        key: tableKey,
        tableName: TABLE_NAMES[tableKey] || tableKey,
        currentCount: cur,
        incomingCount: inc,
        delta: inc - cur,
      };
    });
  }, [validationResult, currentCounts]);

  const handleConfirmRestore = async () => {
    if (confirmText !== 'RESTORE' || !validationResult.valid || !validationResult.envelope) {
      return;
    }

    setLoading(true);
    try {
      const { totalRestored, snapshotTime } = await restoreBackupPayload(
        validationResult.envelope,
        db
      );

      announceToScreenReader(`Khôi phục thành công ${totalRestored} bản ghi vào hệ thống.`);
      notification.success({
        message: 'Khôi phục dữ liệu thành công',
        description: `Đã khôi phục ${totalRestored} bản ghi. Bản snapshot an toàn đã được lưu trước khi ghi đè.`,
        duration: 5,
      });

      setConfirmText('');
      onRestoreSuccess(snapshotTime);
      onClose();
    } catch (err: any) {
      notification.error({
        message: 'Lỗi khôi phục cơ sở dữ liệu',
        description: err?.message || 'Đã có lỗi xảy ra trong quá trình khôi phục.',
      });
    } finally {
      setLoading(false);
    }
  };

  const comparisonColumns = [
    {
      title: 'Bảng dữ liệu',
      dataIndex: 'tableName',
      key: 'tableName',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Hiện tại trong máy',
      dataIndex: 'currentCount',
      key: 'currentCount',
      width: 160,
      align: 'right' as const,
    },
    {
      title: 'Tệp nhập vào',
      dataIndex: 'incomingCount',
      key: 'incomingCount',
      width: 140,
      align: 'right' as const,
    },
    {
      title: 'Chênh lệch',
      dataIndex: 'delta',
      key: 'delta',
      width: 130,
      align: 'right' as const,
      render: (delta: number) => {
        if (delta > 0) {
          return <Tag color="success">+{delta}</Tag>;
        }
        if (delta < 0) {
          return <Tag color="error">{delta}</Tag>;
        }
        return <Tag color="default">0</Tag>;
      },
    },
  ];

  const errorColumns = [
    {
      title: 'Vị trí',
      dataIndex: 'table',
      key: 'table',
      width: 140,
      render: (t: string) => <Tag color="volcano">{t}</Tag>,
    },
    {
      title: 'Trường lỗi',
      dataIndex: 'field',
      key: 'field',
      width: 150,
      render: (f: string) => <Text code>{f}</Text>,
    },
    {
      title: 'Mô tả',
      dataIndex: 'message',
      key: 'message',
    },
  ];

  return (
    <Modal
      title="Xem trước & Xác nhận Khôi phục"
      open={open}
      width={720}
      onCancel={() => {
        setConfirmText('');
        onClose();
      }}
      onOk={handleConfirmRestore}
      okText="Xác nhận khôi phục"
      cancelText="Hủy"
      okButtonProps={{
        danger: true,
        disabled: confirmText !== 'RESTORE' || !validationResult.valid,
        loading,
      }}
      maskClosable={!loading}
      closable={!loading}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Descriptions size="small" bordered column={2}>
          <Descriptions.Item label="Tên tệp">{rawFileName}</Descriptions.Item>
          <Descriptions.Item label="Phiên bản sơ đồ">
            {validationResult.envelope?.schemaVersion ?? 'N/A'}
          </Descriptions.Item>
          <Descriptions.Item label="Thời gian xuất">
            {validationResult.envelope?.exportedAt
              ? new Date(validationResult.envelope.exportedAt).toLocaleString('vi-VN')
              : 'N/A'}
          </Descriptions.Item>
          <Descriptions.Item label="Ứng dụng">
            {validationResult.envelope?.app ?? 'N/A'}
          </Descriptions.Item>
        </Descriptions>

        {!validationResult.valid ? (
          <div>
            <Alert
              type="error"
              showIcon
              message="Tệp sao lưu không hợp lệ"
              description="Tệp sao lưu có cấu trúc không đúng định dạng hoặc vi phạm tính toàn vẹn quan hệ. Dữ liệu hiện tại trong máy hoàn toàn an toàn và không bị thay đổi."
              style={{ marginBottom: 12 }}
            />
            <Table
              size="small"
              dataSource={validationResult.errors.map((err, idx) => ({ ...err, key: idx }))}
              columns={errorColumns}
              pagination={{ pageSize: 5 }}
            />
          </div>
        ) : (
          <div>
            <Alert
              type="warning"
              showIcon
              message="Hành động thay thế toàn bộ dữ liệu"
              description="Quá trình này sẽ xóa dữ liệu hiện tại trong 6 bảng và thay thế bằng nội dung tệp sao lưu. Hệ thống sẽ tự động tạo một bản snapshot an toàn để bạn có thể hoàn tác nếu cần."
              style={{ marginBottom: 16 }}
            />

            <Table
              size="small"
              dataSource={comparisonData}
              columns={comparisonColumns}
              pagination={false}
              summary={(pageData) => {
                const totalCur = pageData.reduce((sum, row) => sum + row.currentCount, 0);
                const totalInc = pageData.reduce((sum, row) => sum + row.incomingCount, 0);
                const totalDelta = totalInc - totalCur;

                return (
                  <Table.Summary.Row style={{ fontWeight: 'bold' }}>
                    <Table.Summary.Cell index={0}>Tổng cộng</Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      {totalCur}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">
                      {totalInc}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                      {totalDelta > 0 ? (
                        <Tag color="success">+{totalDelta}</Tag>
                      ) : totalDelta < 0 ? (
                        <Tag color="error">{totalDelta}</Tag>
                      ) : (
                        <Tag color="default">0</Tag>
                      )}
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }}
            />

            <div style={{ marginTop: 16 }}>
              <Paragraph>
                Nhập chính xác từ khóa <Text code strong>RESTORE</Text> bên dưới để mở khóa nút xác nhận:
              </Paragraph>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESTORE"
                aria-label="Xác nhận từ khóa RESTORE"
              />
            </div>
          </div>
        )}
      </Space>
    </Modal>
  );
};
