import React, { useMemo, useState } from 'react';
import { Tree, Input, Button, Empty, Tag, Typography, Dropdown, Modal, Tooltip, message, type MenuProps } from 'antd';
import {
  SearchOutlined,
  InboxOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  BugOutlined,
  BranchesOutlined,
  CheckSquareOutlined,
  ExportOutlined,
  RocketOutlined,
  EditOutlined,
  DeleteOutlined,
  CloudServerOutlined,
  CodeOutlined,
  DisconnectOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  getAllChangeRequests,
  createChangeRequest,
  updateChangeRequest,
  deleteChangeRequest,
  removeSubsystemFromChangeRequest,
} from '../../db/repositories/changeRequestRepo';
import { getAllSystems } from '../../db/repositories/systemRepo';
import { useLayoutStore } from '../store/layoutStore';
import { useSystemActions } from '../hooks/useSystemActions';
import { ChangeRequestModal } from '../../components/changeRequests/ChangeRequestModal';
import type { DataNode } from 'antd/es/tree';
import type { ChangeRequest, CrStatus, CrType, System, Task } from '../../types/models';

export interface CRExplorerProps {
  db?: TaskPlannerDatabase | undefined;
  onSelectProject?: ((projectId: string | null) => void) | undefined;
}

export const UNATTACHED_KEY = 'sys:__none__';
export const UNATTACHED_LABEL = 'Chung (không gắn)';

export const CR_TYPE_ICON: Record<CrType, React.ReactNode> = {
  NEW_FEATURE: <ThunderboltOutlined style={{ color: '#1677ff' }} />,
  ENHANCEMENT: <ToolOutlined style={{ color: '#52c41a' }} />,
  BUGFIX: <BugOutlined style={{ color: '#faad14' }} />,
};

const STATUS_TAG_COLORS: Record<CrStatus, string> = {
  Open: 'default',
  Pending: 'gold',
  'In Progress': 'processing',
  Done: 'success',
  Cancelled: 'default',
};

const MUTED_ROW_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--fg-subtle, #8c8f9c)',
  fontStyle: 'normal',
};

function MutedRow({ label }: { label: string }) {
  return <span style={MUTED_ROW_STYLE}>{label}</span>;
}

function TaskLeafTitle({ task }: { task: Task }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', width: '100%', minWidth: 0, gap: 6 }}>
      <Typography.Text ellipsis style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.2 }}>
        {task.name}
      </Typography.Text>
    </span>
  );
}

export function CRExplorer({ db = defaultDb, onSelectProject }: CRExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [crModalOpen, setCrModalOpen] = useState(false);
  const [editingCR, setEditingCR] = useState<ChangeRequest | null>(null);

  const openTab = useLayoutStore((s) => s.openTab);
  const { openGit, openTerminal, disabledReason } = useSystemActions();

  const changeRequests = useLiveQuery(() => getAllChangeRequests(db), [db]) ?? [];
  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [];
  const systems = useLiveQuery(() => getAllSystems(db), [db]) ?? [];

  const systemMap = useMemo(() => {
    const map = new Map<string, System>();
    for (const sys of systems) map.set(sys.id, sys);
    return map;
  }, [systems]);

  const openCrDetail = (cr: ChangeRequest) => {
    onSelectProject?.(cr.id);
    openTab({
      id: `cr-${cr.id}`,
      title: cr.code || cr.name,
      viewType: 'cr_detail',
      closable: true,
      params: { changeRequestId: cr.id },
    });
  };

  const openSdlc = (cr: ChangeRequest, systemId?: string) => {
    onSelectProject?.(cr.id);
    openTab({
      id: `sdlc-${cr.id}`,
      title: 'SDLC Studio',
      viewType: 'sdlc',
      closable: true,
      params: systemId ? { changeRequestId: cr.id, systemId } : { changeRequestId: cr.id },
    });
  };

  const openTaskInsight = (task: Task) => {
    openTab({
      id: `task-${task.id}`,
      title: task.name,
      viewType: 'insight',
      closable: true,
      params: { itemType: 'task', itemId: task.id },
    });
  };

  const handleRemoveFromCr = (cr: ChangeRequest, system: System) => {
    Modal.confirm({
      title: `Gỡ '${system.name}' khỏi CR '${cr.code || cr.name}'?`,
      content: 'Subsystem sẽ không còn thuộc CR này. Các tác vụ đang gắn subsystem sẽ chuyển về "Chung (không gắn)".',
      okText: 'Gỡ khỏi CR',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await removeSubsystemFromChangeRequest(cr.id, system.id, db);
          message.success('Đã gỡ subsystem khỏi CR');
        } catch {
          message.error('Không thể gỡ subsystem khỏi CR');
        }
      },
    });
  };

  const getCrMenu = (cr: ChangeRequest): MenuProps['items'] => [
    {
      key: 'open-detail',
      icon: <ExportOutlined style={{ color: 'var(--accent, #3871e1)' }} />,
      label: 'Mở CR Detail',
      onClick: () => openCrDetail(cr),
    },
    {
      key: 'open-sdlc',
      icon: <RocketOutlined style={{ color: 'var(--accent, #3871e1)' }} />,
      label: 'Mở SDLC Studio',
      onClick: () => openSdlc(cr),
    },
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: 'Sửa',
      onClick: () => {
        setEditingCR(cr);
        setCrModalOpen(true);
      },
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined style={{ color: 'var(--danger, #c54e58)' }} />,
      danger: true,
      label: 'Xóa',
      onClick: () => {
        Modal.confirm({
          title: `Xóa Change Request '${cr.code || cr.name}'?`,
          content: 'Toàn bộ tác vụ con và tài liệu SDLC liên quan sẽ bị xóa vĩnh viễn.',
          okText: 'Xóa vĩnh viễn',
          okType: 'danger',
          cancelText: 'Hủy',
          onOk: async () => {
            try {
              await deleteChangeRequest(cr.id, db);
              message.success('Đã xóa Change Request');
            } catch {
              message.error('Không thể xóa Change Request');
            }
          },
        });
      },
    },
  ];

  const getSystemMenu = (cr: ChangeRequest, system: System): MenuProps['items'] => {
    const reason = disabledReason(system);
    const withReason = (label: string) =>
      reason ? (
        <Tooltip title={reason}>
          <span>{label}</span>
        </Tooltip>
      ) : (
        label
      );

    return [
      {
        key: 'open-git',
        icon: <CloudServerOutlined style={{ color: '#f59e0b' }} />,
        label: withReason('Mở Git Explorer'),
        disabled: Boolean(reason),
        onClick: () => openGit(system),
      },
      {
        key: 'open-terminal',
        icon: <CodeOutlined />,
        label: withReason('Mở SSH Terminal'),
        disabled: Boolean(reason),
        onClick: () => {
          try {
            openTerminal(system);
          } catch (err: any) {
            message.error(err?.message || 'Đường dẫn repo không hợp lệ.');
          }
        },
      },
      {
        key: 'open-sdlc-at-system',
        icon: <RocketOutlined style={{ color: 'var(--accent, #3871e1)' }} />,
        label: 'Mở SDLC tại subsystem này',
        onClick: () => openSdlc(cr, system.id),
      },
      { type: 'divider' },
      {
        key: 'remove-from-cr',
        icon: <DisconnectOutlined style={{ color: 'var(--danger, #c54e58)' }} />,
        danger: true,
        label: 'Gỡ khỏi CR',
        onClick: () => handleRemoveFromCr(cr, system),
      },
    ];
  };

  const treeData = useMemo<DataNode[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = (value: string | undefined) =>
      Boolean(q) && Boolean(value) && value!.toLowerCase().includes(q);

    return changeRequests
      .map((cr) => {
        const pTasks = tasks.filter((t) => t.crId === cr.id);
        const crMatches = !q || matches(cr.name) || matches(cr.code);

        const taskNode = (task: Task): DataNode => ({
          key: `task:${task.id}`,
          title: <TaskLeafTitle task={task} />,
          icon: <CheckSquareOutlined style={{ color: 'var(--fg-muted, #6c707e)' }} />,
          isLeaf: true,
        });

        const pillEntries = cr.targets.map((target) => {
          const sys = systemMap.get(target.systemId);
          const sysTasks = pTasks.filter((t) => t.systemId === target.systemId);
          const sysMatches = crMatches || matches(sys?.code) || matches(sys?.name);
          const visibleTasks = sysMatches ? sysTasks : sysTasks.filter((t) => matches(t.name));
          const node: DataNode = {
            key: `sys:${cr.id}:${target.systemId}`,
            title: (
              <Dropdown
                menu={{
                  items: getSystemMenu(
                    cr,
                    sys ?? ({ id: target.systemId, name: target.systemId, code: target.systemId } as System)
                  ) ?? [],
                }}
                trigger={['contextMenu']}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', width: '100%', minWidth: 0, gap: 6 }}>
                  <Tag
                    color="cyan"
                    style={{ margin: 0, padding: '0 4px', fontSize: 12, lineHeight: '16px', fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {sys?.code ?? target.systemId.slice(0, 8)}
                  </Tag>
                  <Typography.Text ellipsis style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.2 }}>
                    {sys?.name ?? target.systemId}
                  </Typography.Text>
                </span>
              </Dropdown>
            ),
            icon: <BranchesOutlined style={{ color: '#13c2c2' }} />,
            children: visibleTasks.map(taskNode),
          };
          return { node, include: sysMatches || visibleTasks.length > 0 };
        });

        const pillNodes = pillEntries.filter((e) => e.include).map((e) => e.node);

        const unattachedTasks = pTasks.filter((t) => !t.systemId);
        const unattachedVisible = crMatches
          ? unattachedTasks
          : unattachedTasks.filter((t) => matches(t.name) || matches(UNATTACHED_LABEL));
        const unattachedNode: DataNode | null =
          unattachedVisible.length > 0
            ? {
                key: UNATTACHED_KEY,
                title: <MutedRow label={UNATTACHED_LABEL} />,
                selectable: false,
                children: unattachedVisible.map(taskNode),
              }
            : null;

        const children: DataNode[] = [...pillNodes, ...(unattachedNode ? [unattachedNode] : [])];
        const matchCR = crMatches || children.length > 0;
        if (!matchCR) return null;

        const noTargetRow: DataNode | null =
          cr.targets.length === 0
            ? { key: `empty-targets:${cr.id}`, title: <MutedRow label="Chưa gắn subsystem" />, isLeaf: true, selectable: false }
            : null;
        const noTaskRow: DataNode | null =
          pTasks.length === 0
            ? { key: `empty-tasks:${cr.id}`, title: <MutedRow label="Chưa có tác vụ" />, isLeaf: true, selectable: false }
            : null;

        const allChildren = [...children, ...(noTargetRow ? [noTargetRow] : []), ...(noTaskRow ? [noTaskRow] : [])];

        return {
          key: `cr:${cr.id}`,
          title: (
            <Dropdown menu={{ items: getCrMenu(cr) ?? [] }} trigger={['contextMenu']}>
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0, overflow: 'hidden' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: 0, gap: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                    {cr.code && (
                      <Tag
                        color="blue"
                        style={{ margin: 0, padding: '0 4px', fontSize: 12, lineHeight: '16px', fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {cr.code}
                      </Tag>
                    )}
                    <Typography.Text ellipsis strong style={{ fontSize: 13.5, lineHeight: 1.2 }}>
                      {cr.name}
                    </Typography.Text>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <Tag color={STATUS_TAG_COLORS[cr.status] || 'default'} style={{ margin: 0, fontSize: 12, lineHeight: '16px' }}>
                      {cr.status}
                    </Tag>
                    <span style={{ fontSize: 12, color: 'var(--fg-muted, #6c707e)' }}>{pTasks.length}</span>
                  </span>
                </div>
              </div>
            </Dropdown>
          ),
          icon: CR_TYPE_ICON[cr.type] || <ToolOutlined style={{ color: '#52c41a' }} />,
          children: allChildren,
        };
      })
      .filter(Boolean) as DataNode[];
  }, [changeRequests, tasks, systemMap, searchQuery]);

  const handleSelect = (selectedKeys: React.Key[]) => {
    const key = selectedKeys[0]?.toString();
    if (!key || key === UNATTACHED_KEY) return;

    if (key.startsWith('cr:')) {
      const cr = changeRequests.find((c) => c.id === key.slice(3));
      if (cr) openCrDetail(cr);
      return;
    }
    if (key.startsWith('sys:')) {
      // Key is `sys:<crId>:<systemId>` — the CR whose node was clicked owns the selection.
      const [, crId, systemId] = key.split(':');
      if (!crId || !systemId) return;
      const cr = changeRequests.find((c) => c.id === crId);
      if (cr) openSdlc(cr, systemId);
      return;
    }
    if (key.startsWith('task:')) {
      const task = tasks.find((t) => t.id === key.slice(5));
      if (task) openTaskInsight(task);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header strip */}
      <div
        style={{
          padding: 8,
          borderBottom: '1px solid var(--border, #e9eaee)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Input
          prefix={<SearchOutlined style={{ color: 'var(--fg-muted, #6c707e)', fontSize: 12 }} />}
          placeholder="Lọc CR, subsystem, tác vụ..."
          allowClear
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, fontSize: 12, borderRadius: 'var(--radius-control, 4px)' }}
        />
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingCR(null);
            setCrModalOpen(true);
          }}
          data-testid="cr-explorer-btn-new-cr"
          style={{ height: 24, padding: '0 8px', fontSize: 12 }}
        >
          Tạo CR
        </Button>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 6px' }}>
        {treeData.length > 0 ? (
          <Tree
            key={`${searchQuery}-${changeRequests.length}`}
            showIcon
            blockNode
            defaultExpandAll
            treeData={treeData}
            onSelect={handleSelect}
            style={{ background: 'transparent', fontSize: 13.5 }}
          />
        ) : (
          <Empty
            image={<InboxOutlined style={{ fontSize: 28, color: 'var(--fg-muted, #6c707e)' }} />}
            description={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Chưa có Change Request nào</span>
                <span style={{ fontSize: 12, color: 'var(--fg-muted, #6c707e)' }}>
                  Tạo CR đầu tiên để bắt đầu vòng đời SDLC.
                </span>
              </div>
            }
            style={{ marginTop: 24 }}
          >
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingCR(null);
                setCrModalOpen(true);
              }}
            >
              Tạo Change Request
            </Button>
          </Empty>
        )}
      </div>

      <ChangeRequestModal
        open={crModalOpen}
        changeRequest={editingCR}
        onClose={() => setCrModalOpen(false)}
        onSave={async (values) => {
          try {
            if (editingCR) {
              await updateChangeRequest(editingCR.id, values as any, db);
              message.success('Đã cập nhật Change Request');
            } else {
              await createChangeRequest(values as any, db);
              message.success('Đã tạo Change Request mới');
            }
            setCrModalOpen(false);
          } catch {
            message.error('Không thể lưu Change Request');
          }
        }}
        db={db}
      />
    </div>
  );
}

export default CRExplorer;
