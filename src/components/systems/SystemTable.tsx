import React, { useMemo } from 'react';
import { Table, Tag, Typography, Button, Space, Popconfirm, Tooltip, Empty, message } from 'antd';
import {
  FolderOutlined,
  BranchesOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  CloudServerOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { System, SystemType } from '../../types/models';
import type { SshConfig } from '../../types/ssh';
import { isLogicalParent } from '../../db/repositories/systemRepo';

const { Text } = Typography;

export interface SystemTableRow extends System {
  key: string;
  children?: SystemTableRow[] | undefined;
}

export interface SystemTableProps {
  systems: System[];
  sshConfigs?: SshConfig[] | undefined;
  loading?: boolean | undefined;
  onAddSubsystem: (parentId: string) => void;
  onEditSystem: (system: System) => void;
  onDeleteSystem: (system: System) => void;
}

export const SYSTEM_TYPE_CONFIG: Record<
  SystemType,
  { label: string; color: string; icon: React.ReactNode }
> = {
  LOGICAL_GROUP: {
    label: 'Parent System',
    color: '#722ed1',
    icon: <FolderOutlined style={{ marginRight: 4 }} />,
  },
  SERVICE: {
    label: 'Service',
    color: '#13c2c2',
    icon: <CodeOutlined style={{ marginRight: 4 }} />,
  },
  SCHEMA: {
    label: 'DB Schema',
    color: '#1890ff',
    icon: <DatabaseOutlined style={{ marginRight: 4 }} />,
  },
  UI: {
    label: 'Frontend UI',
    color: '#eb2f96',
    icon: <DesktopOutlined style={{ marginRight: 4 }} />,
  },
  WORKER: {
    label: 'Worker',
    color: '#fa8c16',
    icon: <ThunderboltOutlined style={{ marginRight: 4 }} />,
  },
};

export const SystemTable: React.FC<SystemTableProps> = ({
  systems,
  sshConfigs = [],
  loading = false,
  onAddSubsystem,
  onEditSystem,
  onDeleteSystem,
}) => {
  const sshConfigMap = useMemo(() => {
    const map = new Map<string, SshConfig>();
    for (const cfg of sshConfigs) {
      map.set(cfg.id, cfg);
    }
    return map;
  }, [sshConfigs]);

  // Build tree data: Parent Systems -> Subsystems
  const treeData = useMemo<SystemTableRow[]>(() => {
    const parents = systems.filter(isLogicalParent);

    return parents.map((parent) => {
      const children = systems.filter((s) => s.parentId === parent.id);
      const childRows: SystemTableRow[] = children.map((c) => ({
        ...c,
        key: c.id,
      }));

      const row: SystemTableRow = {
        ...parent,
        key: parent.id,
      };

      if (childRows.length > 0) {
        row.children = childRows;
      }
      return row;
    });
  }, [systems]);

  const handleCopyPath = (path: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(path);
      message.success('Đã sao chép đường dẫn repo');
    }
  };

  const columns: ColumnsType<SystemTableRow> = [
    {
      title: 'Hệ thống / Subsystem',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: SystemTableRow) => {
        const isParent = isLogicalParent(record);
        return (
          <Space direction="vertical" size={2}>
            <Space>
              {isParent ? (
                <FolderOutlined style={{ color: '#722ed1', fontSize: 15 }} />
              ) : (
                <BranchesOutlined style={{ color: '#13c2c2', fontSize: 14 }} />
              )}
              <Text strong style={{ fontSize: isParent ? 14 : 13 }}>
                {name}
              </Text>
              <Tag
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: 600,
                  margin: 0,
                  background: isParent ? '#f9f0ff' : '#e6fffb',
                  color: isParent ? '#722ed1' : '#08979c',
                  border: isParent ? '1px solid #d3adf7' : '1px solid #87e8de',
                }}
              >
                {record.code}
              </Tag>
            </Space>
            {record.description && (
              <Text type="secondary" style={{ fontSize: 12, paddingLeft: 22 }} ellipsis>
                {record.description}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Phân loại',
      dataIndex: 'type',
      key: 'type',
      width: 140,
      render: (type: SystemType) => {
        const config = SYSTEM_TYPE_CONFIG[type] || {
          label: type,
          color: '#8c8c8c',
          icon: null,
        };
        return (
          <Tag color={config.color} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {config.icon}
            <span>{config.label}</span>
          </Tag>
        );
      },
    },
    {
      title: 'Máy chủ SSH',
      dataIndex: 'sshConfigId',
      key: 'sshConfigId',
      width: 220,
      render: (sshConfigId?: string, record?: SystemTableRow) => {
        if (!sshConfigId) {
          if (record?.type === 'LOGICAL_GROUP') {
            return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
          }
          return (
            <Tag color="default" style={{ color: '#8c8c8c' }}>
              Chưa liên kết
            </Tag>
          );
        }

        const ssh = sshConfigMap.get(sshConfigId);
        if (!ssh) {
          return (
            <Tag color="warning" icon={<CloudServerOutlined />}>
              SSH ID không tồn tại
            </Tag>
          );
        }

        return (
          <Tooltip title={`${ssh.name} (${ssh.username}@${ssh.host}:${ssh.port})`}>
            <Tag
              icon={<CloudServerOutlined />}
              color="blue"
              style={{
                fontFamily: 'monospace',
                fontSize: 11.5,
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                verticalAlign: 'bottom',
              }}
            >
              {ssh.username}@{ssh.host}:{ssh.port}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Remote Repository Path',
      dataIndex: 'remoteRepoPath',
      key: 'remoteRepoPath',
      width: 260,
      render: (path?: string, record?: SystemTableRow) => {
        if (!path) {
          if (record?.type === 'LOGICAL_GROUP') {
            return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
          }
          return <Text type="secondary" style={{ fontSize: 12 }}>Chưa cấu hình</Text>;
        }

        return (
          <Space size={4}>
            <code
              style={{
                fontSize: 11.5,
                padding: '2px 6px',
                background: 'var(--bg-elev, #f7f8fa)',
                border: '1px solid var(--border, #e9eaee)',
                borderRadius: 3,
                wordBreak: 'break-all',
              }}
            >
              {path}
            </code>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined style={{ fontSize: 11 }} />}
              onClick={() => handleCopyPath(path)}
              title="Sao chép đường dẫn"
              style={{ width: 22, height: 22, padding: 0 }}
            />
          </Space>
        );
      },
    },
    {
      title: 'Nhánh mặc định',
      dataIndex: 'defaultBaseBranch',
      key: 'defaultBaseBranch',
      width: 140,
      render: (branch?: string, record?: SystemTableRow) => {
        if (record?.type === 'LOGICAL_GROUP') {
          return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
        }
        return (
          <Tag color="geekblue" style={{ fontFamily: 'monospace', fontSize: 11 }}>
            {branch || 'origin/main'}
          </Tag>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 180,
      render: (_: any, record: SystemTableRow) => {
        const isParent = isLogicalParent(record);
        return (
          <Space size="small">
            {isParent && (
              <Button
                size="small"
                type="link"
                icon={<PlusOutlined />}
                onClick={() => onAddSubsystem(record.id)}
                style={{ padding: 0, fontSize: 12 }}
              >
                Thêm subsystem
              </Button>
            )}
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => onEditSystem(record)}
              title="Chỉnh sửa hệ thống"
            />
            <Popconfirm
              title={`Xóa hệ thống '${record.name}'?`}
              description={`Xóa hệ thống '${record.name}'? Toàn bộ liên kết SSH và cấu hình repo của hệ thống này sẽ bị hủy. Các subsystem con cần được gán lại hệ thống cha.`}
              onConfirm={() => onDeleteSystem(record)}
              okText="Xóa"
              okType="danger"
              cancelText="Hủy"
            >
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                title="Xóa hệ thống"
              />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <Table<SystemTableRow>
      dataSource={treeData}
      columns={columns}
      loading={loading}
      pagination={false}
      rowKey="id"
      defaultExpandAllRows
      style={{
        background: 'var(--bg-island, #ffffff)',
        borderRadius: 8,
      }}
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có hệ thống nào trong danh mục"
          />
        ),
      }}
    />
  );
};

export default SystemTable;
