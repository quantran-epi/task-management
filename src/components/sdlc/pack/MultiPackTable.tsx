import React from 'react';
import { Table, Tag, Button, Space, Typography, Popconfirm, theme } from 'antd';
import { CheckCircleOutlined, DeleteOutlined, StarOutlined } from '@ant-design/icons';
import { LEGACY_SYSTEM_ID, type ChangePackHistoryItem } from '../../../services/wizard/sdlcCrManager';
import type { System } from '../../../types/models';
import dayjs from 'dayjs';

export interface MultiPackTableProps {
  packs: ChangePackHistoryItem[];
  activePackHash?: string | undefined;
  /** D-40: resolves each pack's `systemId` to its subsystem code for the Subsystem column. */
  systems?: System[] | undefined;
  onSelectActive: (packHash: string) => void;
  onDeletePack?: ((packHash: string) => void) | undefined;
}

export const MultiPackTable: React.FC<MultiPackTableProps> = ({
  packs,
  activePackHash,
  systems,
  onSelectActive,
  onDeletePack,
}) => {
  const { token } = theme.useToken();

  const columns = [
    {
      title: 'Subsystem',
      key: 'subsystem',
      width: 140,
      render: (_: unknown, record: ChangePackHistoryItem) => {
        const system = systems?.find((s) => s.id === record.systemId);
        if (!system) {
          return <Typography.Text type="secondary">{record.systemId === LEGACY_SYSTEM_ID ? 'Chung' : '—'}</Typography.Text>;
        }
        return (
          <Tag color="cyan" style={{ fontFamily: 'monospace', margin: 0 }}>
            {system.code}
          </Tag>
        );
      },
    },
    {
      title: 'Tên file pack',
      dataIndex: 'filename',
      key: 'filename',
      render: (text: string, record: ChangePackHistoryItem) => {
        const isActive = record.hash === activePackHash;
        return (
          <Space>
            <Typography.Text strong={isActive} style={{ fontFamily: 'monospace' }}>
              {text}
            </Typography.Text>
            {isActive && (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                Đang kích hoạt
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Thời gian nạp',
      dataIndex: 'uploadedAt',
      key: 'uploadedAt',
      render: (dateStr: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {dayjs(dateStr).format('YYYY-MM-DD HH:mm')}
        </Typography.Text>
      ),
    },
    {
      title: 'Dung lượng',
      dataIndex: 'fileSize',
      key: 'fileSize',
      render: (bytes: number) => {
        const kb = (bytes / 1024).toFixed(1);
        return <span>{kb} KB</span>;
      },
    },
    {
      title: 'Tóm tắt Drift',
      key: 'drift',
      render: (_: unknown, record: ChangePackHistoryItem) => {
        if (!record.driftSummary) return <span>-</span>;
        const { outsideSolution, missingImplementation, divergent } = record.driftSummary;
        const hasDrift = outsideSolution > 0 || missingImplementation > 0 || divergent > 0;
        if (!hasDrift) {
          return <Tag color="cyan">Khớp 100%</Tag>;
        }
        return (
          <Space size={4}>
            {outsideSolution > 0 && <Tag color="error">+{outsideSolution} ngoài sol</Tag>}
            {missingImplementation > 0 && <Tag color="warning">-{missingImplementation} thiếu</Tag>}
            {divergent > 0 && <Tag color="processing">~{divergent} khác</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_: unknown, record: ChangePackHistoryItem) => {
        const isActive = record.hash === activePackHash;
        return (
          <Space orientation="horizontal" size={8}>
            {!isActive && (
              <Button
                size="small"
                type="link"
                icon={<StarOutlined />}
                onClick={() => onSelectActive(record.hash)}
              >
                Chọn làm Active
              </Button>
            )}
            {!isActive && onDeletePack && (
              <Popconfirm
                title="Xóa change pack này khỏi lịch sử?"
                okText="Xóa"
                cancelText="Hủy"
                onConfirm={() => onDeletePack(record.hash)}
              >
                <Button size="small" type="link" danger icon={<DeleteOutlined />}>
                  Xóa pack
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Table
      size="small"
      dataSource={packs}
      columns={columns}
      rowKey="hash"
      pagination={false}
      style={{
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusSM,
      }}
    />
  );
};
