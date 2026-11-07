import React, { useState, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { Tree, Input, Empty, Tag, Typography, Dropdown, Modal, Tooltip, message, type MenuProps } from 'antd';
import {
  FlagOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  InboxOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  RocketOutlined,
  CheckSquareOutlined,
  RobotOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  BugOutlined,
  BranchesOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  getAllChangeRequests,
  updateChangeRequest,
  createChangeRequest,
  deleteChangeRequest,
} from '../../db/repositories/changeRequestRepo';
import { getAllMilestones, updateMilestone, createMilestone } from '../../db/repositories/milestoneRepo';
import { updateTask, createTask } from '../../db/repositories/taskRepo';
import { deleteMilestoneWithCascade, deleteTaskWithAllocations } from '../../db/repositories/cascadeRepo';
import { useLayoutStore } from '../store/layoutStore';
import { useTimer } from '../../hooks/useTimer';
import { useAIChat } from '../../context/AIChatContext';
import { ChangeRequestModal } from '../../components/changeRequests/ChangeRequestModal';
import { MilestoneModal } from '../../components/projects/MilestoneModal';
import { TaskDrawer } from '../../components/tasks/TaskDrawer';
import type { DataNode } from 'antd/es/tree';
import type { ChangeRequest, Milestone, Task, System, CrType } from '../../types/models';

export interface ProjectExplorerProps {
  db?: TaskPlannerDatabase | undefined;
  onSelectProject?: ((projectId: string | null) => void) | undefined;
}

const CR_TYPE_ICON: Record<CrType, React.ReactNode> = {
  NEW_FEATURE: <ThunderboltOutlined style={{ color: '#1677ff' }} />,
  ENHANCEMENT: <ToolOutlined style={{ color: '#52c41a' }} />,
  BUGFIX: <BugOutlined style={{ color: '#faad14' }} />,
};

const CR_TYPE_COLOR: Record<CrType, string> = {
  NEW_FEATURE: '#1677ff',
  ENHANCEMENT: '#52c41a',
  BUGFIX: '#faad14',
};

export function ProjectExplorer({ db = defaultDb, onSelectProject }: ProjectExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    key: string;
  } | null>(null);

  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [treeHeight, setTreeHeight] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.max(200, window.innerHeight - 150);
    }
    return 600;
  });

  useLayoutEffect(() => {
    const el = treeContainerRef.current;
    if (!el) return;

    const measure = () => {
      const h = el.clientHeight;
      if (h > 40) {
        setTreeHeight(h);
      }
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const h = Math.floor(entry.contentRect.height);
          if (h > 40) {
            setTreeHeight(h);
          }
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, []);

  // Modals state
  const [crModalOpen, setCrModalOpen] = useState(false);
  const [editingCR, setEditingCR] = useState<ChangeRequest | null>(null);

  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [activeProjectIdForMilestone, setActiveProjectIdForMilestone] = useState<string>('');
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  const openTab = useLayoutStore((s) => s.openTab);
  const { activeTimers, startTimer, pauseTimer } = useTimer();
  const { openChat } = useAIChat();

  const changeRequests = useLiveQuery(() => getAllChangeRequests(db), [db]) ?? [];
  const milestones = useLiveQuery(() => getAllMilestones(db), [db]) ?? [];
  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [];
  const systems = useLiveQuery(() => db.systems.toArray(), [db]) ?? [];

  const systemMap = useMemo(() => {
    const map = new Map<string, System>();
    for (const sys of systems) {
      map.set(sys.id, sys);
    }
    return map;
  }, [systems]);

  const isTimerRunning = useCallback(
    (taskId: string) => {
      const active = activeTimers.find((t) => t.taskId === taskId);
      return active?.status === 'running';
    },
    [activeTimers]
  );

  const getTaskContextMenu = useCallback(
    (task: Task): Required<MenuProps>['items'] => {
      const running = isTimerRunning(task.id);
      return [
        {
          key: 'ai-chat',
          icon: <RobotOutlined style={{ color: 'var(--accent, #3871e1)' }} />,
          label: 'Hỏi Trợ lý AI',
          onClick: () => {
            setContextMenu(null);
            openChat({ type: 'task', id: task.id, title: task.name });
          },
        },
        {
          key: 'insight',
          icon: <EyeOutlined />,
          label: 'Chi tiết Insight',
          onClick: () => {
            setContextMenu(null);
            onSelectProject?.(task.projectId ?? null);
            openTab({
              id: `task-${task.id}`,
              title: task.name,
              viewType: 'insight',
              closable: true,
              params: { itemType: 'task', itemId: task.id },
            });
          },
        },
        {
          key: 'edit',
          icon: <EditOutlined />,
          label: 'Sửa tác vụ',
          onClick: () => {
            setContextMenu(null);
            setDrawerTaskId(task.id);
            setDrawerOpen(true);
          },
        },
        {
          type: 'divider',
        },
        {
          key: 'timer',
          icon: running ? <PauseCircleOutlined style={{ color: '#d97706' }} /> : <PlayCircleOutlined style={{ color: '#16a34a' }} />,
          label: running ? 'Tạm dừng Timer' : 'Bắt đầu Timer',
          onClick: () => {
            setContextMenu(null);
            if (running) {
              pauseTimer(task.id);
              message.info(`Đã tạm dừng timer cho "${task.name}"`);
            } else {
              startTimer(task.id);
              message.success(`Đã bắt đầu timer cho "${task.name}"`);
            }
          },
        },
        {
          key: 'toggle_status',
          icon: <CheckCircleOutlined style={{ color: task.status === 'Done' ? '#6b7280' : '#16a34a' }} />,
          label: task.status === 'Done' ? 'Mở lại tác vụ' : 'Đánh dấu hoàn thành',
          onClick: async () => {
            setContextMenu(null);
            try {
              const nextStatus = task.status === 'Done' ? 'Open' : 'Done';
              await updateTask(
                task.id,
                {
                  status: nextStatus,
                  ...(nextStatus === 'Done'
                    ? { actualEndDate: new Date().toISOString().slice(0, 10), progress: 100 }
                    : { progress: 0 }),
                },
                db
              );
              message.success(`Đã cập nhật trạng thái: ${nextStatus}`);
            } catch {
              message.error('Không thể cập nhật tác vụ');
            }
          },
        },
        {
          type: 'divider',
        },
        {
          key: 'delete',
          icon: <DeleteOutlined style={{ color: '#ef4444' }} />,
          danger: true,
          label: 'Xoá tác vụ',
          onClick: () => {
            setContextMenu(null);
            Modal.confirm({
              title: `Xoá tác vụ "${task.name}"?`,
              content: 'Hành động này không thể hoàn tác.',
              okText: 'Xoá',
              okType: 'danger',
              cancelText: 'Huỷ',
              onOk: async () => {
                try {
                  await deleteTaskWithAllocations(task.id, db);
                  message.success(`Đã xoá tác vụ "${task.name}"`);
                } catch {
                  message.error('Không thể xoá tác vụ');
                }
              },
            });
          },
        },
      ];
    },
    [db, isTimerRunning, onSelectProject, openChat, openTab, pauseTimer, startTimer]
  );

  const getMilestoneContextMenu = useCallback(
    (milestone: Milestone): Required<MenuProps>['items'] => {
      const pTasks = tasks.filter((t) => t.milestoneId === milestone.id);
      return [
        {
          key: 'ai-chat',
          icon: <RobotOutlined style={{ color: 'var(--accent, #3871e1)' }} />,
          label: 'Hỏi Trợ lý AI',
          onClick: () => {
            setContextMenu(null);
            openChat({ type: 'milestone', id: milestone.id, title: milestone.name });
          },
        },
        {
          key: 'insight',
          icon: <EyeOutlined />,
          label: 'Chi tiết Milestone Insight',
          onClick: () => {
            setContextMenu(null);
            onSelectProject?.(milestone.projectId);
            openTab({
              id: `milestone-${milestone.id}`,
              title: `Milestone: ${milestone.name}`,
              viewType: 'insight',
              closable: true,
              params: { itemType: 'milestone', itemId: milestone.id },
            });
          },
        },
        {
          key: 'add-task',
          icon: <PlusOutlined />,
          label: 'Thêm tác vụ',
          onClick: async () => {
            setContextMenu(null);
            try {
              const t = await createTask(
                {
                  name: 'Tác vụ mới',
                  projectId: milestone.projectId,
                  milestoneId: milestone.id,
                  status: 'Open',
                  priority: 'Medium',
                  estimateMinutes: 0,
                },
                db
              );
              setDrawerTaskId(t.id);
              setDrawerOpen(true);
            } catch {
              message.error('Không thể tạo tác vụ');
            }
          },
        },
        {
          key: 'edit',
          icon: <EditOutlined />,
          label: 'Sửa cột mốc',
          onClick: () => {
            setContextMenu(null);
            setActiveProjectIdForMilestone(milestone.projectId);
            setEditingMilestone(milestone);
            setMilestoneModalOpen(true);
          },
        },
        {
          type: 'divider',
        },
        {
          key: 'delete',
          icon: <DeleteOutlined style={{ color: 'var(--danger, #c54e58)' }} />,
          danger: true,
          label: 'Xóa cột mốc',
          onClick: () => {
            setContextMenu(null);
            Modal.confirm({
              title: `Xóa cột mốc '${milestone.name}'?`,
              content: `Toàn bộ ${pTasks.length} tác vụ con sẽ bị xóa theo.`,
              okText: 'Xóa',
              okType: 'danger',
              cancelText: 'Hủy',
              onOk: async () => {
                try {
                  await deleteMilestoneWithCascade(milestone.id, 'cascade', db);
                  message.success('Đã xóa cột mốc');
                } catch {
                  message.error('Không thể xóa cột mốc');
                }
              },
            });
          },
        },
      ];
    },
    [db, onSelectProject, openChat, openTab, tasks]
  );

  const getCRContextMenu = useCallback(
    (cr: ChangeRequest): Required<MenuProps>['items'] => {
      const crTasks = tasks.filter((t) => t.projectId === cr.id);

      return [
        {
          key: 'ai-chat',
          icon: <RobotOutlined style={{ color: 'var(--accent, #3871e1)' }} />,
          label: 'Hỏi Trợ lý AI',
          onClick: () => {
            setContextMenu(null);
            openChat({ type: 'project', id: cr.id, title: cr.name });
          },
        },
        {
          key: 'sdlc',
          icon: <RocketOutlined style={{ color: '#3871e1' }} />,
          label: <span style={{ fontWeight: 600, color: '#3871e1' }}>Mở SDLC Studio</span>,
          onClick: () => {
            setContextMenu(null);
            onSelectProject?.(cr.id);
            openTab({
              id: `sdlc-${cr.id}`,
              title: `SDLC: ${cr.name}`,
              viewType: 'sdlc',
              closable: true,
              params: { projectId: cr.id },
            });
          },
        },
        {
          key: 'insight',
          icon: <EyeOutlined />,
          label: 'Chi tiết CR (Insight)',
          onClick: () => {
            setContextMenu(null);
            onSelectProject?.(cr.id);
            openTab({
              id: `project-${cr.id}`,
              title: cr.name,
              viewType: 'insight',
              closable: true,
              params: { itemType: 'project', itemId: cr.id },
            });
          },
        },
        {
          type: 'divider',
        },
        {
          key: 'add-task',
          icon: <PlusOutlined />,
          label: 'Thêm tác vụ',
          onClick: async () => {
            setContextMenu(null);
            try {
              const t = await createTask(
                {
                  name: 'Tác vụ mới',
                  projectId: cr.id,
                  status: 'Open',
                  priority: 'Medium',
                  estimateMinutes: 0,
                },
                db
              );
              setDrawerTaskId(t.id);
              setDrawerOpen(true);
            } catch {
              message.error('Không thể tạo tác vụ');
            }
          },
        },
        {
          key: 'add-milestone',
          icon: <PlusOutlined />,
          label: 'Thêm cột mốc',
          onClick: () => {
            setContextMenu(null);
            setActiveProjectIdForMilestone(cr.id);
            setEditingMilestone(null);
            setMilestoneModalOpen(true);
          },
        },
        {
          key: 'edit',
          icon: <EditOutlined />,
          label: 'Sửa Change Request',
          onClick: () => {
            setContextMenu(null);
            setEditingCR(cr);
            setCrModalOpen(true);
          },
        },
        {
          key: 'tasks',
          icon: <CheckSquareOutlined />,
          label: 'Xem trên bảng Tác vụ',
          onClick: () => {
            setContextMenu(null);
            onSelectProject?.(cr.id);
            openTab({
              id: 'tasks',
              title: `Tasks: ${cr.name}`,
              viewType: 'tasks',
              params: { projectId: cr.id },
            });
          },
        },
        {
          type: 'divider',
        },
        {
          key: 'delete',
          icon: <DeleteOutlined style={{ color: 'var(--danger, #c54e58)' }} />,
          danger: true,
          label: 'Xóa Change Request',
          onClick: () => {
            setContextMenu(null);
            Modal.confirm({
              title: `Xóa Change Request: Xóa CR '${cr.name}'?`,
              content: `Toàn bộ ${crTasks.length} tác vụ con và tài liệu SDLC liên quan sẽ bị xóa vĩnh viễn.`,
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
    },
    [db, onSelectProject, openChat, openTab, tasks]
  );

  const contextMenuItems = useMemo<Required<MenuProps>['items']>(() => {
    if (!contextMenu) return [];
    const key = contextMenu.key;

    if (key.startsWith('cr:')) {
      const crId = key.replace('cr:', '');
      const cr = changeRequests.find((c) => c.id === crId);
      return cr ? getCRContextMenu(cr) : [];
    }

    if (key.startsWith('milestone:')) {
      const mId = key.replace('milestone:', '');
      const milestone = milestones.find((m) => m.id === mId);
      return milestone ? getMilestoneContextMenu(milestone) : [];
    }

    if (key.startsWith('task:')) {
      const tId = key.replace('task:', '');
      const task = tasks.find((t) => t.id === tId);
      return task ? getTaskContextMenu(task) : [];
    }

    return [];
  }, [contextMenu, changeRequests, milestones, tasks, getCRContextMenu, getMilestoneContextMenu, getTaskContextMenu]);

  const treeData = useMemo<DataNode[]>(() => {
    const q = searchQuery.trim().toLowerCase();

    return changeRequests
      .map((cr) => {
        const pMilestones = milestones.filter((m) => m.projectId === cr.id);
        const pTasks = tasks.filter((t) => t.projectId === cr.id);

        const milestoneNodes: DataNode[] = pMilestones
          .map((m) => {
            const mTasks = pTasks.filter((t) => t.milestoneId === m.id);
            const filteredTasks = q
              ? mTasks.filter((t) => t.name.toLowerCase().includes(q))
              : mTasks;

            const taskNodes: DataNode[] = filteredTasks.map((t) => ({
              key: `task:${t.id}`,
              title: (
                <span style={{ display: 'inline-flex', alignItems: 'center', width: '100%', minWidth: 0, justifyContent: 'space-between', gap: 6, overflow: 'hidden' }}>
                  <Typography.Text ellipsis style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: '20px' }}>
                    {t.name}
                  </Typography.Text>
                  {t.priority && (
                    <Tag
                      color={t.priority === 'Urgent' ? 'error' : t.priority === 'High' ? 'warning' : 'default'}
                      style={{ fontSize: 9.5, margin: 0, padding: '0 4px', lineHeight: '14px', height: 14, flexShrink: 0 }}
                    >
                      {t.priority.toUpperCase()}
                    </Tag>
                  )}
                </span>
              ),
              icon: t.status === 'Done' ? (
                <CheckCircleOutlined style={{ color: 'var(--success, #338555)' }} />
              ) : (
                <ClockCircleOutlined style={{ color: 'var(--accent, #3871e1)' }} />
              ),
              isLeaf: true,
            }));

            const matchMilestone = !q || m.name.toLowerCase().includes(q) || taskNodes.length > 0;
            if (!matchMilestone) return null;

            return {
              key: `milestone:${m.id}`,
              title: (
                <span style={{ display: 'inline-flex', alignItems: 'center', width: '100%', minWidth: 0, overflow: 'hidden' }}>
                  <Typography.Text ellipsis style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, lineHeight: '20px' }}>
                    {m.name}
                  </Typography.Text>
                </span>
              ),
              icon: <FlagOutlined style={{ color: 'var(--fg-muted, #6c707e)' }} />,
              children: taskNodes,
            };
          })
          .filter(Boolean) as DataNode[];

        // Orphan tasks without milestone
        const orphanTasks = pTasks.filter((t) => !t.milestoneId);
        const filteredOrphanTasks = q
          ? orphanTasks.filter((t) => t.name.toLowerCase().includes(q))
          : orphanTasks;

        const orphanTaskNodes: DataNode[] = filteredOrphanTasks.map((t) => ({
          key: `task:${t.id}`,
          title: (
            <span style={{ display: 'inline-flex', alignItems: 'center', width: '100%', minWidth: 0, overflow: 'hidden' }}>
              <Typography.Text ellipsis style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: '20px' }}>
                {t.name}
              </Typography.Text>
            </span>
          ),
          icon: <ClockCircleOutlined style={{ color: 'var(--fg-muted, #6c707e)' }} />,
          isLeaf: true,
        }));

        const allChildren = [...milestoneNodes, ...orphanTaskNodes];
        const matchCR =
          !q ||
          cr.name.toLowerCase().includes(q) ||
          (cr.code && cr.code.toLowerCase().includes(q)) ||
          allChildren.length > 0;
        if (!matchCR) return null;

        const typeColor = CR_TYPE_COLOR[cr.type] || '#52c41a';
        const typeIcon = CR_TYPE_ICON[cr.type] || <ToolOutlined style={{ color: typeColor }} />;

        // Subsystems chips
        const targetChips = (cr.targetSystemIds ?? []).map((id) => {
          const sys = systemMap.get(id);
          return sys ? sys.code : id.slice(0, 6);
        });

        return {
          key: `cr:${cr.id}`,
          title: (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0, overflow: 'hidden', padding: '2px 0' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: 0, gap: 6 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                  {cr.code && (
                    <Tag
                      color="blue"
                      style={{
                        margin: 0,
                        padding: '0 4px',
                        fontSize: 10,
                        lineHeight: '14px',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                      }}
                    >
                      {cr.code}
                    </Tag>
                  )}
                  <Typography.Text ellipsis strong style={{ fontSize: 13, lineHeight: '18px' }}>
                    {cr.name}
                  </Typography.Text>
                </span>
                <span style={{ fontSize: 11, color: 'var(--fg-muted, #6c707e)', flexShrink: 0 }}>
                  {pTasks.length}
                </span>
              </div>

              {targetChips.length > 0 && (
                <div style={{ display: 'flex', gap: 3, flexWrap: 'nowrap', overflow: 'hidden', marginTop: 2 }}>
                  {targetChips.slice(0, 2).map((chip, idx) => (
                    <Tag
                      key={idx}
                      color="cyan"
                      icon={<BranchesOutlined style={{ fontSize: 9 }} />}
                      style={{
                        fontSize: 9.5,
                        margin: 0,
                        padding: '0 4px',
                        lineHeight: '14px',
                        height: 14,
                        fontFamily: 'monospace',
                      }}
                    >
                      {chip}
                    </Tag>
                  ))}
                  {targetChips.length > 2 && (
                    <span style={{ fontSize: 9.5, color: '#8c8c8c' }}>+{targetChips.length - 2}</span>
                  )}
                </div>
              )}
            </div>
          ),
          icon: typeIcon,
          children: allChildren,
        };
      })
      .filter(Boolean) as DataNode[];
  }, [changeRequests, milestones, tasks, searchQuery, systemMap]);

  const handleSelect = (selectedKeys: React.Key[]) => {
    const key = selectedKeys[0]?.toString();
    if (!key) return;

    if (key.startsWith('cr:')) {
      const crId = key.replace('cr:', '');
      onSelectProject?.(crId);
      const cr = changeRequests.find((c) => c.id === crId);
      openTab({
        id: `project-${crId}`,
        title: cr?.name || 'Change Request',
        viewType: 'insight',
        closable: true,
        params: { itemType: 'project', itemId: crId },
      });
    } else if (key.startsWith('milestone:')) {
      const milestoneId = key.replace('milestone:', '');
      const milestone = milestones.find((m) => m.id === milestoneId);
      if (milestone) {
        onSelectProject?.(milestone.projectId);
        openTab({
          id: `milestone-${milestoneId}`,
          title: `Milestone: ${milestone.name}`,
          viewType: 'insight',
          closable: true,
          params: { itemType: 'milestone', itemId: milestoneId },
        });
      }
    } else if (key.startsWith('task:')) {
      const taskId = key.replace('task:', '');
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        onSelectProject?.(task.projectId ?? null);
        openTab({
          id: `task-${taskId}`,
          title: task.name,
          viewType: 'insight',
          closable: true,
          params: { itemType: 'task', itemId: taskId },
        });
      }
    }
  };

  const handleRightClick = ({ event, node }: { event: React.MouseEvent; node: any }) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      key: node.key.toString(),
    });
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
      onClick={() => {
        if (contextMenu) setContextMenu(null);
      }}
    >
      {/* Search Input Filter */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border, #e9eaee)' }}>
        <Input
          prefix={<SearchOutlined style={{ color: 'var(--fg-muted, #6c707e)', fontSize: 12 }} />}
          placeholder="Lọc Change Requests, tác vụ..."
          allowClear
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            fontSize: 'var(--font-size-small, 12px)',
            borderRadius: 'var(--radius-control, 4px)',
          }}
        />
      </div>

      {/* Tree Content */}
      <div
        ref={treeContainerRef}
        style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 0 }}
      >
        {treeData.length > 0 ? (
          <>
            <Tree
              virtual
              height={treeHeight}
              showIcon
              blockNode
              defaultExpandAll={changeRequests.length <= 4}
              treeData={treeData}
              onSelect={handleSelect}
              onRightClick={handleRightClick}
              style={{
                background: 'transparent',
                fontSize: 'var(--font-size-ui, 13px)',
                padding: '4px 6px',
              }}
            />
            {contextMenu && (
              <Dropdown
                open={true}
                onOpenChange={(open) => {
                  if (!open) setContextMenu(null);
                }}
                menu={{
                  items: contextMenuItems,
                  onClick: () => setContextMenu(null),
                }}
              >
                <span
                  style={{
                    position: 'fixed',
                    left: contextMenu.x,
                    top: contextMenu.y,
                    width: 1,
                    height: 1,
                    pointerEvents: 'none',
                  }}
                />
              </Dropdown>
            )}
          </>
        ) : (
          <Empty
            image={<InboxOutlined style={{ fontSize: 28, color: 'var(--fg-muted, #6c707e)' }} />}
            description="Chưa có Change Request nào"
            style={{ marginTop: 24 }}
          />
        )}
      </div>

      {/* CRUD Modals and Drawers */}
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

      <MilestoneModal
        open={milestoneModalOpen}
        projectId={activeProjectIdForMilestone}
        milestone={editingMilestone}
        onClose={() => setMilestoneModalOpen(false)}
        onSave={async (values) => {
          try {
            if (editingMilestone) {
              await updateMilestone(editingMilestone.id, values, db);
              message.success('Đã cập nhật cột mốc');
            } else {
              await createMilestone({ ...values, projectId: activeProjectIdForMilestone }, db);
              message.success('Đã tạo cột mốc mới');
            }
            setMilestoneModalOpen(false);
          } catch {
            message.error('Không thể lưu cột mốc');
          }
        }}
      />

      <TaskDrawer
        taskId={drawerTaskId}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerTaskId(null);
        }}
        db={db}
      />
    </div>
  );
}

export default ProjectExplorer;
