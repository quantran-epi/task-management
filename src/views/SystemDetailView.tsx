import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Descriptions,
  Empty,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
  type DescriptionsProps,
  type TabsProps,
} from 'antd';
import {
  ApartmentOutlined,
  BranchesOutlined,
  CodeOutlined,
  EditOutlined,
  FolderOutlined,
  PlusOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import {
  createSystem,
  getAllSystems,
  getSubsystems,
  getSystem,
  isLogicalParent,
  isSubsystem,
  updateSystem,
} from '../db/repositories/systemRepo';
import { createChangeRequest, getChangeRequestsBySystem } from '../db/repositories/changeRequestRepo';
import { getSshConfigs } from '../services/sshService';
import { escapeShellArg, getRemoteBranches, runGitCommand } from '../services/gitRemoteService';
import { useLayoutStore } from '../workbench/store/layoutStore';
import { useSystemActions } from '../workbench/hooks/useSystemActions';
import { SystemModal } from '../components/systems/SystemModal';
import { ChangeRequestModal } from '../components/changeRequests/ChangeRequestModal';
import type { SshConfig } from '../types/ssh';
import type { ChangeRequest, CrStatus, CrType, System, SystemType } from '../types/models';

export interface SystemDetailViewProps {
  systemId: string;
  db?: TaskPlannerDatabase | undefined;
}

const SYSTEM_TYPE_TAG: Record<SystemType, { label: string; color: string }> = {
  LOGICAL_GROUP: { label: 'Parent System (Logical Group)', color: 'purple' },
  SERVICE: { label: 'Service / Microservice', color: 'blue' },
  SCHEMA: { label: 'Database Schema', color: 'cyan' },
  UI: { label: 'Frontend UI', color: 'green' },
  WORKER: { label: 'Background Worker', color: 'orange' },
};

const CR_TYPE_COLOR: Record<CrType, string> = {
  NEW_FEATURE: '#1677ff',
  ENHANCEMENT: '#52c41a',
  BUGFIX: '#faad14',
};

const CR_TYPE_LABEL: Record<CrType, string> = {
  NEW_FEATURE: 'Tạo mới',
  ENHANCEMENT: 'Nâng cấp',
  BUGFIX: 'Sửa lỗi',
};

const CR_STATUS_COLOR: Record<CrStatus, string> = {
  Open: 'default',
  Pending: 'gold',
  'In Progress': 'processing',
  Done: 'success',
  Cancelled: 'default',
};

const CR_STATUS_LABEL: Record<CrStatus, string> = {
  Open: 'Mở',
  Pending: 'Chờ xử lý',
  'In Progress': 'Đang làm',
  Done: 'Hoàn thành',
  Cancelled: 'Đã hủy',
};

interface BranchRow {
  name: string;
  isRemote: boolean;
  isHead: boolean;
  sha?: string;
  author?: string;
  date?: string;
}

interface GitTabState {
  status: 'idle' | 'loading' | 'unconfigured' | 'error' | 'loaded';
  rows: BranchRow[];
}

const BRANCH_DETAIL_FORMAT =
  '%(refname:short)%00%(objectname)%00%(authorname)%00%(committerdate:iso)';

/** One extra `for-each-ref` read enriches the branch list with commit/author/date (T-31.2-35). */
async function loadBranchDetails(
  config: SshConfig,
  repoPath: string
): Promise<Map<string, { sha: string; author: string; date: string }>> {
  const output = await runGitCommand(config, repoPath, [
    'for-each-ref',
    escapeShellArg(`--format=${BRANCH_DETAIL_FORMAT}`),
    'refs/heads/',
    'refs/remotes/origin/',
  ]);
  const details = new Map<string, { sha: string; author: string; date: string }>();
  for (const line of output.split('\n')) {
    const parts = line.split('\0');
    const name = parts[0]?.trim();
    if (!name || name === 'origin/HEAD') continue;
    details.set(name, {
      sha: parts[1]?.trim() ?? '',
      author: parts[2]?.trim() ?? '',
      date: parts[3]?.trim() ?? '',
    });
  }
  return details;
}

const CONNECTION_STATUS: Record<'connected' | 'unconfigured' | 'error', { color: string; label: string }> = {
  connected: { color: '#52c41a', label: 'Đã kết nối' },
  unconfigured: { color: '#faad14', label: 'Chưa cấu hình' },
  error: { color: '#c54e58', label: 'Lỗi kết nối' },
};

const ConnectionStatus: React.FC<{ state: 'connected' | 'unconfigured' | 'error' }> = ({ state }) => {
  const config = CONNECTION_STATUS[state];
  return (
    <Space size={6}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: config.color,
          display: 'inline-block',
        }}
      />
      <span>{config.label}</span>
    </Space>
  );
};

export const SystemDetailView: React.FC<SystemDetailViewProps> = ({
  systemId,
  db = defaultDb,
}) => {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createChildModalOpen, setCreateChildModalOpen] = useState(false);
  const [createCrModalOpen, setCreateCrModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [gitReloadToken, setGitReloadToken] = useState(0);
  const [gitState, setGitState] = useState<GitTabState>({ status: 'idle', rows: [] });

  const openTab = useLayoutStore((s) => s.openTab);
  const { openGit, openTerminal, disabledReason } = useSystemActions();

  // Queries
  const system = useLiveQuery(() => (systemId ? getSystem(systemId, db) : undefined), [systemId, db]);
  const allSystems = useLiveQuery(() => getAllSystems(db), [db]) ?? [];
  const sshConfigs = useLiveQuery(() => getSshConfigs(db), [db]) ?? [];

  const sshConfig = system?.sshConfigId
    ? sshConfigs.find((c) => c.id === system.sshConfigId) ?? null
    : null;

  // Impacted CRs: a parent unions its child subsystems' targets (D-33).
  const impactedCrs = useLiveQuery(async () => {
    if (!system) return [] as ChangeRequest[];
    if (isLogicalParent(system)) {
      const children = await getSubsystems(system.id, db);
      const byId = new Map<string, ChangeRequest>();
      for (const child of children) {
        const crs = await getChangeRequestsBySystem(child.id, db);
        for (const cr of crs) byId.set(cr.id, cr);
      }
      return [...byId.values()];
    }
    return getChangeRequestsBySystem(system.id, db);
  }, [system?.id, system?.type, db]) ?? [];

  const gitTarget = useMemo(
    () => ({ sshConfig, repoPath: system?.remoteRepoPath ?? '' }),
    [sshConfig, system?.remoteRepoPath]
  );
  const gitTargetKey =
    system && isSubsystem(system)
      ? `${system.id}|${system.sshConfigId ?? ''}|${system.remoteRepoPath ?? ''}`
      : '';

  useEffect(() => {
    if (activeTab !== 'git-branches' || !gitTargetKey) return undefined;
    const { sshConfig: config, repoPath } = gitTarget;
    if (!config || !repoPath) {
      setGitState({ status: 'unconfigured', rows: [] });
      return undefined;
    }
    let cancelled = false;
    setGitState({ status: 'loading', rows: [] });
    void (async () => {
      try {
        const [branches, details] = await Promise.all([
          getRemoteBranches(config, repoPath),
          loadBranchDetails(config, repoPath),
        ]);
        if (cancelled) return;
        setGitState({
          status: 'loaded',
          rows: branches.map((branch) => ({ ...branch, ...(details.get(branch.name) ?? {}) })),
        });
      } catch {
        if (!cancelled) setGitState({ status: 'error', rows: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, gitTargetKey, gitReloadToken, gitTarget]);

  if (!system) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <Empty description="Không tìm thấy thông tin hệ thống" />
      </div>
    );
  }

  const parentSystem = system.parentId ? allSystems.find((s) => s.id === system.parentId) : null;
  const childSubsystems = allSystems.filter((s) => s.parentId === system.id);
  const connectionState = sshConfig && system.remoteRepoPath ? 'connected' : 'unconfigured';

  const handleOpenSystem = (targetSys: System) => {
    openTab({
      id: `system-${targetSys.id}`,
      title: targetSys.name,
      viewType: 'system_detail',
      closable: true,
      params: { systemId: targetSys.id },
    });
  };


  const handleOpenTerminal = (target: System) => {
    try {
      openTerminal(target);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không mở được SSH Terminal.');
    }
  };

  const renderRowActions = (row: System) => {
    // `disabledReason` returns the shared copy `Chưa cấu hình SSH/Repo — mở System Catalog`
    // (SYSTEM_ACTIONS_DISABLED_REASON), used verbatim as the disabled aria-label (D-35).
    const reason = disabledReason(row);
    // ponytail: plain flex div, not antd `Space` — Space's mount measurement makes jsdom
    // accessible-name queries ~1s per call, which times the row-action test out.
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        <Tooltip title={reason ?? 'Mở Git Explorer'}>
          <Button
            size="small"
            type="text"
            icon={<BranchesOutlined />}
            aria-label={reason ?? 'Mở Git Explorer'}
            disabled={Boolean(reason)}
            onClick={() => openGit(row)}
          />
        </Tooltip>
        <Tooltip title={reason ?? `Mở SSH Terminal tại ${row.remoteRepoPath ?? ''}`}>
          <Button
            size="small"
            type="text"
            icon={<CodeOutlined />}
            aria-label={reason ?? `Mở SSH Terminal tại ${row.remoteRepoPath ?? ''}`}
            disabled={Boolean(reason)}
            onClick={() => handleOpenTerminal(row)}
          />
        </Tooltip>
      </div>
    );
  };

  const overviewItems: DescriptionsProps['items'] = [
    {
      key: 'type',
      label: 'Loại hệ thống',
      children: (
        <Tag color={SYSTEM_TYPE_TAG[system.type]?.color || 'default'}>
          {SYSTEM_TYPE_TAG[system.type]?.label || system.type}
        </Tag>
      ),
    },
    ...(system.description
      ? [{ key: 'description', label: 'Mô tả', children: system.description }]
      : []),
    ...(isSubsystem(system)
      ? [
          {
            key: 'ssh',
            label: 'Máy chủ SSH',
            children: sshConfig ? (
              <Typography.Text code copyable>
                {`${sshConfig.username}@${sshConfig.host}:${sshConfig.port}`}
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary">—</Typography.Text>
            ),
          },
          {
            key: 'repoPath',
            label: 'Đường dẫn Repository',
            children: system.remoteRepoPath ? (
              <Typography.Text code copyable style={{ fontSize: 12 }}>
                {system.remoteRepoPath}
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary">—</Typography.Text>
            ),
          },
          {
            key: 'baseBranch',
            label: 'Nhánh Base mặc định',
            children: (
              <Tag color="blue" style={{ fontFamily: 'monospace' }}>
                {system.defaultBaseBranch || 'origin/main'}
              </Tag>
            ),
          },
          {
            key: 'connection',
            label: 'Trạng thái kết nối',
            children: <ConnectionStatus state={connectionState} />,
          },
        ]
      : []),
  ];

  const subsystemsTab = (
    <Card
      size="small"
      title={`Danh sách Subsystems con (${childSubsystems.length})`}
      extra={
        <Button
          type="link"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setCreateChildModalOpen(true)}
        >
          Thêm subsystem
        </Button>
      }
    >
      {childSubsystems.length > 0 ? (
        <Table
          dataSource={childSubsystems}
          rowKey="id"
          pagination={false}
          size="small"
          columns={[
            {
              title: 'Tên subsystem',
              dataIndex: 'name',
              key: 'name',
              render: (text: string, record: System) => (
                <a onClick={() => handleOpenSystem(record)} style={{ fontWeight: 600 }}>
                  {text}
                </a>
              ),
            },
            {
              title: 'Mã (Code)',
              dataIndex: 'code',
              key: 'code',
              width: 130,
              render: (code: string) => (
                <Tag color="cyan" style={{ fontFamily: 'monospace' }}>
                  {code}
                </Tag>
              ),
            },
            {
              title: 'Loại',
              dataIndex: 'type',
              key: 'type',
              width: 160,
              render: (type: SystemType) => (
                <Tag color={SYSTEM_TYPE_TAG[type]?.color || 'default'}>
                  {SYSTEM_TYPE_TAG[type]?.label || type}
                </Tag>
              ),
            },
            {
              title: 'Đường dẫn Repo',
              dataIndex: 'remoteRepoPath',
              key: 'remoteRepoPath',
              render: (path?: string) =>
                path ? (
                  <Typography.Text code style={{ fontSize: 11 }}>
                    {path}
                  </Typography.Text>
                ) : (
                  '—'
                ),
            },
            {
              title: 'Thao tác',
              key: 'actions',
              width: 90,
              render: (_: unknown, record: System) => renderRowActions(record),
            },
          ]}
        />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Typography.Text strong>Hệ thống này chưa có subsystem con nào</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Subsystem là đơn vị deploy gắn đúng một repo remote SSH. Thêm subsystem để bắt đầu
                cấu hình.
              </Typography.Text>
            </div>
          }
        >
          <Button size="small" type="primary" onClick={() => setCreateChildModalOpen(true)}>
            Thêm subsystem
          </Button>
        </Empty>
      )}
    </Card>
  );

  const impactedCrsTab = (
    <>
      {impactedCrs.length > 0 ? (
        <Table
          dataSource={impactedCrs}
          rowKey="id"
          pagination={false}
          size="small"
          columns={[
            {
              title: 'Mã CR',
              dataIndex: 'code',
              key: 'code',
              width: 140,
              render: (code: string, record: ChangeRequest) => (
                <Tag
                  color={CR_TYPE_COLOR[record.type]}
                  style={{ fontFamily: 'monospace', fontWeight: 600 }}
                >
                  {code}
                </Tag>
              ),
            },
            {
              title: 'Tiêu đề Change Request',
              dataIndex: 'name',
              key: 'name',
              render: (text: string) => <strong>{text}</strong>,
            },
            {
              title: 'Loại CR',
              dataIndex: 'type',
              key: 'type',
              width: 120,
              render: (type: CrType) => <Tag color={CR_TYPE_COLOR[type]}>{CR_TYPE_LABEL[type]}</Tag>,
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              width: 120,
              render: (status: CrStatus) => (
                <Tag color={CR_STATUS_COLOR[status]}>{CR_STATUS_LABEL[status]}</Tag>
              ),
            },
          ]}
        />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Typography.Text strong>
                Chưa có Change Request nào ảnh hưởng hệ thống này
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {isLogicalParent(system)
                  ? 'CR sẽ xuất hiện ở đây khi subsystem con được chọn làm target.'
                  : 'CR sẽ xuất hiện ở đây khi subsystem này được chọn làm target.'}
              </Typography.Text>
            </div>
          }
        >
          {isSubsystem(system) && (
            <Button size="small" type="primary" onClick={() => setCreateCrModalOpen(true)}>
              Tạo Change Request
            </Button>
          )}
        </Empty>
      )}
    </>
  );

  const gitBranchesTab = (
    <>
      {gitState.status === 'idle' || gitState.status === 'loading' ? (
        <Spin tip="Đang tải nhánh từ máy chủ SSH...">
          <div style={{ height: 120 }} />
        </Spin>
      ) : gitState.status === 'error' ? (
        <Alert
          type="error"
          showIcon
          message="Không tải được nhánh từ máy chủ SSH"
          description="Kiểm tra cấu hình SSH và đường dẫn repo của subsystem, hoặc thử lại."
          action={
            <Button size="small" onClick={() => setGitReloadToken((token) => token + 1)}>
              Thử lại
            </Button>
          }
        />
      ) : gitState.status === 'unconfigured' ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Typography.Text strong>Subsystem chưa cấu hình SSH/Repo</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Cấu hình SSH và đường dẫn repo trong System Catalog để xem nhánh và commit.
              </Typography.Text>
            </div>
          }
        >
          <Button size="small" onClick={() => setEditModalOpen(true)}>
            Chỉnh sửa subsystem
          </Button>
        </Empty>
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space size={8}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Nhánh hiện tại:
            </Typography.Text>
            <Tag color="blue" style={{ fontFamily: 'monospace' }}>
              {system.defaultBaseBranch || 'origin/main'}
            </Tag>
          </Space>
          <Table
            dataSource={gitState.rows}
            rowKey="name"
            size="small"
            pagination={false}
            columns={[
              {
                title: 'Tên nhánh',
                dataIndex: 'name',
                key: 'name',
                render: (name: string) => (
                  <Typography.Text code style={{ fontSize: 12 }}>
                    {name}
                  </Typography.Text>
                ),
              },
              {
                title: 'Commit gần nhất',
                dataIndex: 'sha',
                key: 'sha',
                width: 130,
                render: (sha?: string) =>
                  sha ? (
                    <Tooltip title={sha}>
                      <Typography.Text code style={{ fontSize: 12 }}>
                        {sha.slice(0, 8)}
                      </Typography.Text>
                    </Tooltip>
                  ) : (
                    '—'
                  ),
              },
              {
                title: 'Tác giả',
                dataIndex: 'author',
                key: 'author',
                width: 160,
                render: (author?: string) => author || '—',
              },
              {
                title: 'Thời gian',
                dataIndex: 'date',
                key: 'date',
                width: 190,
                render: (date?: string) => date || '—',
              },
            ]}
          />
        </Space>
      )}
    </>
  );

  const tabItems: TabsProps['items'] = [
    { key: 'overview', label: 'Tổng quan', children: <Descriptions size="small" bordered column={1} items={overviewItems} /> },
    ...(isLogicalParent(system)
      ? [{ key: 'subsystems', label: 'Subsystems', children: subsystemsTab }]
      : []),
    { key: 'impacted-crs', label: 'Impacted CRs', children: impactedCrsTab },
    ...(isSubsystem(system)
      ? [{ key: 'git-branches', label: 'Git & Branches', children: gitBranchesTab }]
      : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 20px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Breadcrumb navigation */}
      <Breadcrumb
        items={[
          {
            title: (
              <span
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => {
                  openTab({
                    id: 'systems',
                    title: 'Danh mục hệ thống',
                    viewType: 'systems',
                    closable: true,
                  });
                }}
              >
                <ApartmentOutlined /> Danh mục hệ thống
              </span>
            ),
          },
          ...(parentSystem
            ? [
                {
                  title: (
                    <span
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={() => handleOpenSystem(parentSystem)}
                    >
                      <FolderOutlined /> {parentSystem.name} ({parentSystem.code})
                    </span>
                  ),
                },
              ]
            : []),
          {
            title: `${system.name} (${system.code})`,
          },
        ]}
      />

      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          padding: '16px 20px',
          background: 'var(--bg-island, #ffffff)',
          borderRadius: 8,
          border: '1px solid var(--border, #e9eaee)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {system.name}
            </Typography.Title>
            <Tag color="cyan" style={{ fontFamily: 'monospace', fontSize: 13, padding: '2px 8px', margin: 0 }}>
              {system.code}
            </Tag>
            <Tag color={SYSTEM_TYPE_TAG[system.type]?.color || 'default'} style={{ margin: 0 }}>
              {SYSTEM_TYPE_TAG[system.type]?.label || system.type}
            </Tag>
          </div>
          {system.description && (
            <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
              {system.description}
            </Typography.Paragraph>
          )}
        </div>

        <Space>
          <Button icon={<EditOutlined />} onClick={() => setEditModalOpen(true)}>
            Chỉnh sửa
          </Button>
          {isLogicalParent(system) && (
            <Button icon={<PlusOutlined />} onClick={() => setCreateChildModalOpen(true)}>
              Thêm subsystem
            </Button>
          )}
          {isSubsystem(system) && (
            <Button
              type="primary"
              icon={<RocketOutlined />}
              onClick={() => setCreateCrModalOpen(true)}
            >
              Tạo CR cho hệ thống này
            </Button>
          )}
        </Space>
      </div>

      <Tabs size="small" activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      {/* Edit System Modal */}
      <SystemModal
        open={editModalOpen}
        system={system}
        onClose={() => setEditModalOpen(false)}
        onSave={async (values) => {
          await updateSystem(system.id, values, db);
          message.success('Đã cập nhật hệ thống');
          setEditModalOpen(false);
        }}
        db={db}
      />

      {/* Create Subsystem Modal */}
      <SystemModal
        open={createChildModalOpen}
        defaultParentId={system.id}
        onClose={() => setCreateChildModalOpen(false)}
        onSave={async (values) => {
          await createSystem({ ...values, parentId: system.id }, db);
          message.success('Đã tạo subsystem con mới');
          setCreateChildModalOpen(false);
        }}
        db={db}
      />

      {/* Create CR targeting this system Modal */}
      <ChangeRequestModal
        open={createCrModalOpen}
        initialTargets={[{ systemId: system.id }]}
        onClose={() => setCreateCrModalOpen(false)}
        onSave={async (values) => {
          await createChangeRequest(values as any, db);
          message.success('Đã tạo Change Request mới cho hệ thống này');
          setCreateCrModalOpen(false);
        }}
        db={db}
      />
    </div>
  );
};

export default SystemDetailView;
