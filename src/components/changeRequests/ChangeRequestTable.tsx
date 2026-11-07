import React, { useMemo, useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  Tooltip,
  Popover,
  Dropdown,
  Progress,
  theme,
  type TableColumnsType,
  type MenuProps,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  BranchesOutlined,
  LinkOutlined,
  FolderOpenOutlined,
  RobotOutlined,
  MoreOutlined,
  BellOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  BugOutlined,
} from '@ant-design/icons';
import type { ChangeRequest, CrType, CrStatus, System, Task } from '../../types/models';
import { EmptyState } from '../common/EmptyState';
import { getTodayDateString } from '../../utils/date';
import { TagListDisplay } from '../common/TagListDisplay';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { getJiraBrowseUrl, openJiraExternalUrl } from '../../services/jira/jiraApi';
import { openDocumentLink, isLocalPath } from '../../utils/documentLinks';
import { useAIChat } from '../../context/AIChatContext';
import { QuickReminderModal } from '../common/QuickReminderModal';

export interface ChangeRequestTableProps {
  changeRequests: ChangeRequest[];
  tasks: Task[];
  systems?: System[];
  onAddChangeRequest?: () => void;
  onEditChangeRequest: (cr: ChangeRequest) => void;
  onDeleteChangeRequest: (cr: ChangeRequest) => void;
  onOpenSdlcStudio?: (crId: string) => void;
  onViewTasks?: (crId: string) => void;
  loading?: boolean;
  db?: TaskPlannerDatabase;
}

export const CR_TYPE_CONFIG: Record<
  CrType,
  { label: string; color: string; icon: React.ReactNode; text: string }
> = {
  NEW_FEATURE: {
    label: 'New Feature',
    color: '#1677ff',
    icon: <ThunderboltOutlined />,
    text: 'Tạo mới tính năng',
  },
  ENHANCEMENT: {
    label: 'Enhancement',
    color: '#52c41a',
    icon: <ToolOutlined />,
    text: 'Nâng cấp / Cập nhật',
  },
  BUGFIX: {
    label: 'Bugfix',
    color: '#faad14',
    icon: <BugOutlined />,
    text: 'Sửa lỗi',
  },
};

const STATUS_TAG_COLORS: Record<CrStatus, string> = {
  Open: 'default',
  Pending: 'gold',
  'In Progress': 'processing',
  Done: 'success',
  Cancelled: 'default',
};

const STATUS_LABELS: Record<CrStatus, string> = {
  Open: 'Mở',
  Pending: 'Chờ xử lý',
  'In Progress': 'Đang làm',
  Done: 'Hoàn thành',
  Cancelled: 'Đã hủy',
};

export const ChangeRequestTable: React.FC<ChangeRequestTableProps> = ({
  changeRequests,
  tasks,
  systems: propSystems,
  onEditChangeRequest,
  onDeleteChangeRequest,
  onOpenSdlcStudio,
  onViewTasks,
  loading = false,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const today = getTodayDateString();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const { openChat } = useAIChat();

  const [reminderTargetCR, setReminderTargetCR] = useState<ChangeRequest | null>(null);

  const dbSystems = useLiveQuery(() => db.systems.toArray(), [db]) ?? [];
  const systems = propSystems ?? dbSystems;

  const systemMap = useMemo(() => {
    const map = new Map<string, System>();
    for (const sys of systems) {
      map.set(sys.id, sys);
    }
    return map;
  }, [systems]);

  const taskMap = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.crId) {
        const arr = map.get(t.crId) || [];
        arr.push(t);
        map.set(t.crId, arr);
      }
    }
    return map;
  }, [tasks]);

  const getCRMenuItems = (record: ChangeRequest): NonNullable<MenuProps['items']> => [
    {
      key: 'ai-chat',
      icon: <RobotOutlined style={{ color: token.colorPrimary }} />,
      label: 'Hỏi Trợ lý AI',
      onClick: () => {
        openChat({ type: 'cr', id: record.id, title: record.name });
      },
    },
    {
      key: 'sdlc-studio',
      icon: <SettingOutlined style={{ color: token.colorPrimary }} />,
      label: '⚙️ SDLC Studio',
      onClick: () => {
        onOpenSdlcStudio?.(record.id);
      },
    },
    {
      key: 'add-reminder',
      icon: <BellOutlined style={{ color: '#faad14' }} />,
      label: 'Thêm nhắc nhở',
      onClick: () => setReminderTargetCR(record),
    },
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: 'Sửa CR',
      onClick: () => onEditChangeRequest(record),
    },
    {
      type: 'divider',
    },
    {
      key: 'delete',
      icon: <DeleteOutlined style={{ color: token.colorError }} />,
      danger: true,
      label: 'Xóa CR',
      onClick: () => onDeleteChangeRequest(record),
    },
  ];

  const columns: TableColumnsType<ChangeRequest> = [
    {
      title: 'Change Request',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => {
        const linkCount = record.documentLinks?.length ?? 0;
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: token.colorText,
                  cursor: onViewTasks ? 'pointer' : 'default',
                }}
                onClick={() => onViewTasks?.(record.id)}
              >
                {name}
              </span>

              {record.code && (
                <Tag
                  color="blue"
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    margin: 0,
                    fontSize: 11.5,
                  }}
                >
                  {record.code}
                </Tag>
              )}

              {record.jiraEpicKey && (
                <Tag
                  color="purple"
                  icon={<LinkOutlined />}
                  style={{ cursor: 'pointer', margin: 0, fontSize: 11 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void openJiraExternalUrl(getJiraBrowseUrl(record.jiraEpicKey!));
                  }}
                  title={`Mở Jira Epic ${record.jiraEpicKey}`}
                >
                  Epic: {record.jiraEpicKey}
                </Tag>
              )}

              {linkCount > 0 && (
                <Popover
                  title="Tài liệu liên kết"
                  overlayStyle={{ maxWidth: 420 }}
                  content={
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        maxWidth: 380,
                        maxHeight: 280,
                        overflowY: 'auto',
                        paddingRight: 4,
                      }}
                    >
                      {record.documentLinks?.map((link, idx) => {
                        const local = isLocalPath(link);
                        return (
                          <a
                            key={idx}
                            href={link}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void openDocumentLink(link);
                            }}
                            title={local ? 'Mở trong File Explorer' : 'Mở liên kết web'}
                            style={{
                              fontSize: 12,
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 6,
                              lineHeight: 1.4,
                              color: token.colorLink,
                            }}
                          >
                            {local ? (
                              <FolderOpenOutlined style={{ color: '#fa8c16', flexShrink: 0, marginTop: 2 }} />
                            ) : (
                              <LinkOutlined style={{ color: '#1677ff', flexShrink: 0, marginTop: 2 }} />
                            )}
                            <span
                              title={link}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                wordBreak: 'break-all',
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {link}
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  }
                  trigger="hover"
                >
                  <Tag
                    icon={<LinkOutlined />}
                    style={{ cursor: 'pointer', margin: 0, fontSize: 11 }}
                    color="default"
                  >
                    {linkCount} link{linkCount > 1 ? 's' : ''}
                  </Tag>
                </Popover>
              )}
            </div>
            {record.description && (
              <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 4 }}>
                {record.description}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Loại CR',
      dataIndex: 'type',
      key: 'type',
      width: 140,
      render: (type: CrType) => {
        const cfg = CR_TYPE_CONFIG[type] ?? CR_TYPE_CONFIG.ENHANCEMENT;
        return (
          <Tag color={cfg.color} icon={cfg.icon} style={{ fontWeight: 600, fontSize: 11.5 }}>
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      title: 'Target Subsystems',
      dataIndex: 'targets',
      key: 'targets',
      width: 220,
      render: (_: unknown, record) => {
        const targets = record.targets ?? [];
        if (targets.length === 0) {
          return <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>Chưa chọn</span>;
        }

        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {targets.map((target) => {
              const sys = systemMap.get(target.systemId);
              const label = sys ? sys.code : target.systemId.slice(0, 8);
              const tooltipTitle = sys ? `${sys.name} (${sys.type})` : `System ${target.systemId}`;
              return (
                <Tooltip key={target.systemId} title={tooltipTitle}>
                  <Tag
                    color="cyan"
                    icon={<BranchesOutlined />}
                    style={{ margin: 0, fontSize: 11, fontFamily: 'monospace' }}
                  >
                    {label}
                  </Tag>
                </Tooltip>
              );
            })}
          </div>
        );
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: CrStatus) => (
        <Tag color={STATUS_TAG_COLORS[status] || 'default'}>{STATUS_LABELS[status] || status}</Tag>
      ),
    },
    {
      title: 'Tiến độ Tác vụ',
      key: 'progress',
      width: 160,
      render: (_, record) => {
        const crTasks = taskMap.get(record.id) || [];
        const total = crTasks.length;
        if (total === 0) {
          return <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>0 tác vụ</span>;
        }
        const done = crTasks.filter((t) => t.status === 'Done').length;
        const percent = Math.round((done / total) * 100);

        return (
          <div style={{ width: 140 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
              <span>{done}/{total} Done</span>
              <span style={{ fontWeight: 600 }}>{percent}%</span>
            </div>
            <Progress percent={percent} size="small" showInfo={false} />
          </div>
        );
      },
    },
    {
      title: 'Hạn chót',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 120,
      render: (deadline?: string) => {
        if (!deadline) return '—';
        const isOverdue = deadline < today;
        return (
          <span style={{ color: isOverdue ? token.colorError : token.colorText, fontWeight: isOverdue ? 600 : 400 }}>
            {deadline}
          </span>
        );
      },
    },
    {
      title: 'Ops Owner',
      key: 'opsOwners',
      width: 130,
      render: (_, record) => <TagListDisplay tags={record.opsOwners} source="direct" />,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space orientation="horizontal" size="small">
          {onOpenSdlcStudio && (
            <Button
              size="small"
              icon={<SettingOutlined />}
              onClick={() => onOpenSdlcStudio(record.id)}
            >
              SDLC
            </Button>
          )}
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEditChangeRequest(record)}
          >
            Sửa
          </Button>
          <Dropdown menu={{ items: getCRMenuItems(record) }} trigger={['click']}>
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              aria-label="Thao tác khác"
            />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Table
        rowKey="id"
        dataSource={changeRequests}
        columns={columns}
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} Change Requests`,
          hideOnSinglePage: false,
          onChange: (current, pageSize) => {
            setPagination((prev) => ({
              current: pageSize !== prev.pageSize ? 1 : current,
              pageSize,
            }));
          },
        }}
        locale={{
          emptyText: (
            <EmptyState
              heading="Chưa có Change Request (CR) nào"
              body="Tạo Change Request mới (Tính năng mới, Nâng cấp, hoặc Sửa lỗi) và chọn các subsystem bị ảnh hưởng để bắt đầu quy trình SDLC 6 bước."
            />
          ),
        }}
        size="middle"
      />

      {reminderTargetCR && (
        <QuickReminderModal
          open={!!reminderTargetCR}
          onClose={() => setReminderTargetCR(null)}
          target={{ type: 'cr', entity: reminderTargetCR }}
          db={db}
        />
      )}
    </>
  );
};
