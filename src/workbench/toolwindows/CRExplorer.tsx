import React, { useMemo, useState } from 'react';
import { Tree, Input, Button, Empty, Tag, Typography, Dropdown, Modal, message, type MenuProps } from 'antd';
import {
  SearchOutlined,
  InboxOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  BugOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  ExportOutlined,
  RocketOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  getAllChangeRequests,
  createChangeRequest,
  updateChangeRequest,
  deleteChangeRequest,
} from '../../db/repositories/changeRequestRepo';
import { useLayoutStore } from '../store/layoutStore';
import { ChangeRequestModal } from '../../components/changeRequests/ChangeRequestModal';
import type { DataNode } from 'antd/es/tree';
import type { ChangeRequest, CrStatus, CrType, Task } from '../../types/models';

export interface CRExplorerProps {
  db?: TaskPlannerDatabase | undefined;
  onSelectChangeRequest?: ((changeRequestId: string | null) => void) | undefined;
}

export const CR_TYPE_ICON: Record<CrType, React.ReactNode> = {
  NEW_FEATURE: <ThunderboltOutlined style={{ color: '#1677ff' }} />,
  ENHANCEMENT: <ToolOutlined style={{ color: '#52c41a' }} />,
  BUGFIX: <BugOutlined style={{ color: '#faad14' }} />,
};

export const CR_FOLDER_COLOR: Record<CrType, string> = {
  NEW_FEATURE: '#e11d48',
  ENHANCEMENT: '#f43f5e',
  BUGFIX: '#dc2626',
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

export function CRExplorer({ db = defaultDb, onSelectChangeRequest }: CRExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [crModalOpen, setCrModalOpen] = useState(false);
  const [editingCR, setEditingCR] = useState<ChangeRequest | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  const openTab = useLayoutStore((s) => s.openTab);

  const changeRequests = useLiveQuery(() => getAllChangeRequests(db), [db]) ?? [];
  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [];

  const crKeys = useMemo(() => changeRequests.map((cr) => `cr:${cr.id}`), [changeRequests]);

  // Collapsed by default — the user opens what they need. While searching, every CR is
  // revealed so the filter result is visible; clearing the search restores the user's state.
  const effectiveExpandedKeys = searchQuery.trim() ? crKeys : expandedKeys;

  const openCrDetail = (cr: ChangeRequest) => {
    onSelectChangeRequest?.(cr.id);
    openTab({
      id: `cr-${cr.id}`,
      title: cr.code || cr.name,
      viewType: 'cr_detail',
      closable: true,
      params: { changeRequestId: cr.id },
    });
  };

  const openSdlc = (cr: ChangeRequest) => {
    onSelectChangeRequest?.(cr.id);
    openTab({
      id: `sdlc-${cr.id}`,
      title: 'SDLC Studio',
      viewType: 'sdlc',
      closable: true,
      params: { changeRequestId: cr.id },
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

  const treeData = useMemo<DataNode[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = (value: string | undefined) => Boolean(q) && Boolean(value) && value!.toLowerCase().includes(q);

    return changeRequests
      .map((cr) => {
        const crTasks = tasks.filter((t) => t.crId === cr.id);
        const crMatches = !q || matches(cr.name) || matches(cr.code);
        const visibleTasks = crMatches ? crTasks : crTasks.filter((t) => matches(t.name));
        if (!crMatches && visibleTasks.length === 0) return null;

        const taskNodes: DataNode[] = visibleTasks.map((task) => ({
          key: `task:${task.id}`,
          title: <TaskLeafTitle task={task} />,
          icon: <FileTextOutlined style={{ color: 'var(--fg-muted, #6c707e)' }} />,
          isLeaf: true,
        }));

        const children: DataNode[] =
          taskNodes.length > 0
            ? taskNodes
            : [{ key: `empty-tasks:${cr.id}`, title: <MutedRow label="Chưa có tác vụ" />, isLeaf: true, selectable: false }];

        return {
          key: `cr:${cr.id}`,
          title: (
            <Dropdown menu={{ items: getCrMenu(cr) ?? [] }} trigger={['contextMenu']}>
              <div style={{ display: 'inline-flex', alignItems: 'center', width: '100%', minWidth: 0, gap: 6 }}>
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
                  <span style={{ fontSize: 12, color: 'var(--fg-muted, #6c707e)' }}>{crTasks.length}</span>
                </span>
              </div>
            </Dropdown>
          ),
          icon: ({ expanded }: { expanded?: boolean }) => {
            const color = CR_FOLDER_COLOR[cr.type] || '#e11d48';
            return expanded ? (
              <FolderOpenOutlined style={{ color }} />
            ) : (
              <FolderOutlined style={{ color }} />
            );
          },
          children,
        };
      })
      .filter(Boolean) as DataNode[];
  }, [changeRequests, tasks, searchQuery]);

  const handleSelect = (selectedKeys: React.Key[]) => {
    const key = selectedKeys[0]?.toString();
    if (!key) return;

    if (key.startsWith('cr:')) {
      const cr = changeRequests.find((c) => c.id === key.slice(3));
      if (cr) openCrDetail(cr);
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
          placeholder="Lọc CR, tác vụ..."
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
            motion={false as any}
            showIcon
            blockNode
            treeData={treeData}
            expandedKeys={effectiveExpandedKeys}
            onExpand={(keys) => setExpandedKeys(keys)}
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
