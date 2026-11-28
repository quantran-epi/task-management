import React, { useMemo } from 'react';
import { Table, Tag, Typography, Button, Space, Popconfirm, Tooltip, Empty, useMessage, EmptyImageSimple } from '../ui';
import { FolderOutlined, BranchesOutlined, PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, CloudServerOutlined } from '../ui/icon';
import type { ColumnsType } from 'antd/es/table';
import type { System, SystemType } from '../../types/models';
import type { SshConfig } from '../../types/ssh';
import { isLogicalParent } from '../../db/repositories/systemRepo';
import { gitHref, gitLinkLabel, shouldRenderGitLink } from '../../utils/gitLink';
import {
  DEFAULT_SYSTEM_TYPE_OPTIONS,
  SYSTEM_TYPE_FALLBACK_COLOR,
  getSystemTypeIcon,
  type SystemTypeOption,
} from '../../services/system/systemTypeSettings';

const { Text } = Typography;
const { Link } = Typography;

export interface SystemTableRow extends System {
  key: string;
  children?: SystemTableRow[] | undefined;
}

export interface SystemTableProps {
  systems: System[];
  sshConfigs?: SshConfig[] | undefined;
  loading?: boolean | undefined;
  typeOptions?: SystemTypeOption[] | undefined;
  onAddSubsystem: (parentId: string) => void;
  onEditSystem: (system: System) => void;
  onDeleteSystem: (system: System) => void;
}

export const SystemTable: React.FC<SystemTableProps> = ({
  systems,
  sshConfigs = [],
  loading = false,
  typeOptions = [...DEFAULT_SYSTEM_TYPE_OPTIONS],
  onAddSubsystem,
  onEditSystem,
  onDeleteSystem,
}) => {
  const message = useMessage();
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
                <FolderOutlined style={{ color: 'var(--accent)', fontSize: 15 }} />
              ) : (
                <BranchesOutlined style={{ color: 'var(--info-fg)', fontSize: 14 }} />
              )}
              <Text strong style={{ fontSize: isParent ? 14 : 13 }}>
                {name}
              </Text>
              <Tag
                style={{
                  fontFamily: 'monospace',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  margin: 0,
                  background: isParent ? 'var(--accent-soft)' : 'var(--bg-elev)',
                  color: isParent ? 'var(--accent)' : 'var(--info-fg)',
                  border: '1px solid var(--border)',
                }}
              >
                {record.code}
              </Tag>
            </Space>
            {record.description && (
              <Text type="secondary" style={{ fontSize: 'var(--font-size-small)', paddingLeft: 22 }} ellipsis>
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
        const option = typeOptions.find((opt) => opt.value === type);
        const TypeIcon = getSystemTypeIcon(type);
        return (
          <Tag
            color={option?.color ?? SYSTEM_TYPE_FALLBACK_COLOR}
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <TypeIcon style={{ marginRight: 4 }} />
            <span>{option?.label ?? type}</span>
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
            return <Text type="secondary" style={{ fontSize: 'var(--font-size-small)' }}>—</Text>;
          }
          return (
            <Tag color="default" style={{ color: 'var(--fg-secondary)' }}>
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
                fontSize: 'var(--font-size-xs)',
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
            return <Text type="secondary" style={{ fontSize: 'var(--font-size-small)' }}>—</Text>;
          }
          return <Text type="secondary" style={{ fontSize: 'var(--font-size-small)' }}>Chưa cấu hình</Text>;
        }

        return (
          <Space size={4}>
            <code
              style={{
                fontSize: 'var(--font-size-xs)',
                padding: '2px 6px',
                background: 'var(--bg-elev, #f7f8fa)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                wordBreak: 'break-all',
              }}
            >
              {path}
            </code>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined style={{ fontSize: 'var(--font-size-xs)' }} />}
              onClick={() => handleCopyPath(path)}
              title="Sao chép đường dẫn"
              style={{ width: 22, height: 22, padding: 0 }}
            />
          </Space>
        );
      },
    },
    {
      title: 'Link Git',
      key: 'gitLinks',
      width: 220,
      render: (_: unknown, record: SystemTableRow) => {
        if (!record.gitSourceUrl && !record.gitOpsUrl) {
          return <Text type="secondary" style={{ fontSize: 'var(--font-size-small)' }}>—</Text>;
        }
        return (
          <Space direction="vertical" size={2}>
            {record.gitSourceUrl && (
              <Text style={{ fontSize: 'var(--font-size-small)' }}>
                Source:{' '}
                {shouldRenderGitLink(record.gitSourceUrl) ? (
                  <Link
                    href={gitHref(record.gitSourceUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    ellipsis
                    style={{ fontSize: 'var(--font-size-small)' }}
                  >
                    {gitLinkLabel(record.gitSourceUrl)}
                  </Link>
                ) : (
                  <Text type="secondary" style={{ fontSize: 'var(--font-size-small)', wordBreak: 'break-all' }}>
                    {record.gitSourceUrl}
                  </Text>
                )}
              </Text>
            )}
            {record.gitOpsUrl && (
              <Text style={{ fontSize: 'var(--font-size-small)' }}>
                GitOps:{' '}
                {shouldRenderGitLink(record.gitOpsUrl) ? (
                  <Link
                    href={gitHref(record.gitOpsUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    ellipsis
                    style={{ fontSize: 'var(--font-size-small)' }}
                  >
                    {gitLinkLabel(record.gitOpsUrl)}
                  </Link>
                ) : (
                  <Text type="secondary" style={{ fontSize: 'var(--font-size-small)', wordBreak: 'break-all' }}>
                    {record.gitOpsUrl}
                  </Text>
                )}
              </Text>
            )}
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
          return <Text type="secondary" style={{ fontSize: 'var(--font-size-small)' }}>—</Text>;
        }
        return (
          <Tag color="geekblue" style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>
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
                style={{ padding: 0, fontSize: 'var(--font-size-small)' }}
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
        background: 'var(--bg-island, var(--bg-island))',
        borderRadius: 'var(--radius-control)',
      }}
      locale={{
        emptyText: (
          <Empty
            image={EmptyImageSimple}
            description="Chưa có hệ thống nào trong danh mục"
          />
        ),
      }}
    />
  );
};

export default SystemTable;
