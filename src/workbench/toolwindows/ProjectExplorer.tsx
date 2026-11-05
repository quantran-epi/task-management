import React, { useState, useMemo, useCallback } from 'react';
import { Tree, Input, Empty, Tag, Typography, Dropdown, message, type MenuProps } from 'antd';
import {
  FolderOutlined,
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
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getAllProjects, updateProject, createProject } from '../../db/repositories/projectRepo';
import { getAllMilestones, updateMilestone, createMilestone } from '../../db/repositories/milestoneRepo';
import { updateTask, createTask } from '../../db/repositories/taskRepo';
import { deleteProjectWithCascade, deleteMilestoneWithCascade } from '../../db/repositories/cascadeRepo';
import { useLayoutStore } from '../store/layoutStore';
import { useTimer } from '../../hooks/useTimer';
import { useAIChat } from '../../context/AIChatContext';
import { ProjectModal } from '../../components/projects/ProjectModal';
import { MilestoneModal } from '../../components/projects/MilestoneModal';
import { CascadeDeleteModal } from '../../components/projects/CascadeDeleteModal';
import { TaskDrawer } from '../../components/tasks/TaskDrawer';
import type { DataNode } from 'antd/es/tree';
import type { Project, Milestone, Task } from '../../types/models';

export interface ProjectExplorerProps {
  db?: TaskPlannerDatabase | undefined;
  onSelectProject?: ((projectId: string | null) => void) | undefined;
}

export function ProjectExplorer({ db = defaultDb, onSelectProject }: ProjectExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    key: string;
  } | null>(null);

  // Modals state
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [activeProjectIdForMilestone, setActiveProjectIdForMilestone] = useState<string>('');
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

  const [cascadeModalOpen, setCascadeModalOpen] = useState(false);
  const [cascadeTarget, setCascadeTarget] = useState<{
    type: 'project' | 'milestone';
    id: string;
    name: string;
    childMilestoneCount: number;
    childTaskCount: number;
  } | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  const openTab = useLayoutStore((s) => s.openTab);
  const { activeTimers, startTimer, pauseTimer } = useTimer();
  const { openChat } = useAIChat();

  const projects = useLiveQuery(() => getAllProjects(db), [db]) ?? [];
  const milestones = useLiveQuery(() => getAllMilestones(db), [db]) ?? [];
  const tasks = useLiveQuery(
    async () => {
      return await db.tasks.toArray();
    },
    [db],
    []
  );

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
            setCascadeTarget({
              type: 'milestone',
              id: milestone.id,
              name: milestone.name,
              childMilestoneCount: 0,
              childTaskCount: pTasks.length,
            });
            setCascadeModalOpen(true);
          },
        },
      ];
    },
    [db, onSelectProject, openChat, openTab, tasks]
  );

  const getProjectContextMenu = useCallback(
    (project: Project): Required<MenuProps>['items'] => {
      const projMilestones = milestones.filter((m) => m.projectId === project.id);
      const projTasks = tasks.filter((t) => t.projectId === project.id);

      return [
        {
          key: 'ai-chat',
          icon: <RobotOutlined style={{ color: 'var(--accent, #3871e1)' }} />,
          label: 'Hỏi Trợ lý AI',
          onClick: () => {
            setContextMenu(null);
            openChat({ type: 'project', id: project.id, title: project.name });
          },
        },
        {
          key: 'sdlc',
          icon: <RocketOutlined style={{ color: '#3871e1' }} />,
          label: <span style={{ fontWeight: 600, color: '#3871e1' }}>Mở SDLC Studio</span>,
          onClick: () => {
            setContextMenu(null);
            onSelectProject?.(project.id);
            openTab({
              id: `sdlc-${project.id}`,
              title: `SDLC: ${project.name}`,
              viewType: 'sdlc',
              closable: true,
              params: { projectId: project.id },
            });
          },
        },
        {
          key: 'insight',
          icon: <EyeOutlined />,
          label: 'Chi tiết Dự án (Insight)',
          onClick: () => {
            setContextMenu(null);
            onSelectProject?.(project.id);
            openTab({
              id: `project-${project.id}`,
              title: project.name,
              viewType: 'insight',
              closable: true,
              params: { itemType: 'project', itemId: project.id },
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
                  projectId: project.id,
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
            setActiveProjectIdForMilestone(project.id);
            setEditingMilestone(null);
            setMilestoneModalOpen(true);
          },
        },
        {
          key: 'edit',
          icon: <EditOutlined />,
          label: 'Sửa dự án',
          onClick: () => {
            setContextMenu(null);
            setEditingProject(project);
            setProjectModalOpen(true);
          },
        },
        {
          key: 'tasks',
          icon: <CheckSquareOutlined />,
          label: 'Xem trên bảng Tác vụ',
          onClick: () => {
            setContextMenu(null);
            onSelectProject?.(project.id);
            openTab({
              id: 'tasks',
              title: 'Tasks',
              viewType: 'tasks',
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
          label: 'Xóa dự án',
          onClick: () => {
            setContextMenu(null);
            setCascadeTarget({
              type: 'project',
              id: project.id,
              name: project.name,
              childMilestoneCount: projMilestones.length,
              childTaskCount: projTasks.length,
            });
            setCascadeModalOpen(true);
          },
        },
      ];
    },
    [db, milestones, onSelectProject, openChat, openTab, tasks]
  );

  const contextMenuItems = useMemo<Required<MenuProps>['items']>(() => {
    if (!contextMenu) return [];
    const key = contextMenu.key;

    if (key.startsWith('project:')) {
      const pId = key.replace('project:', '');
      const project = projects.find((p) => p.id === pId);
      return project ? getProjectContextMenu(project) : [];
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
  }, [contextMenu, projects, milestones, tasks, getProjectContextMenu, getMilestoneContextMenu, getTaskContextMenu]);

  const treeData = useMemo<DataNode[]>(() => {
    const q = searchQuery.trim().toLowerCase();

    return projects
      .map((p) => {
        const pMilestones = milestones.filter((m) => m.projectId === p.id);
        const pTasks = tasks.filter((t) => t.projectId === p.id);

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
        const matchProject = !q || p.name.toLowerCase().includes(q) || allChildren.length > 0;
        if (!matchProject) return null;

        return {
          key: `project:${p.id}`,
          title: (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: 0, gap: 6, overflow: 'hidden' }}>
              <Typography.Text ellipsis strong style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: '20px' }}>
                {p.name}
              </Typography.Text>
              <span style={{ fontSize: 11, color: 'var(--fg-muted, #6c707e)', flexShrink: 0 }}>
                {pTasks.length}
              </span>
            </span>
          ),
          icon: <FolderOutlined style={{ color: (p as any).color || 'var(--accent, #3871e1)' }} />,
          children: allChildren,
        };
      })
      .filter(Boolean) as DataNode[];
  }, [projects, milestones, tasks, searchQuery]);

  const handleSelect = (selectedKeys: React.Key[]) => {
    const key = selectedKeys[0]?.toString();
    if (!key) return;

    if (key.startsWith('project:')) {
      const projectId = key.replace('project:', '');
      onSelectProject?.(projectId);
      const project = projects.find((p) => p.id === projectId);
      openTab({
        id: `project-${projectId}`,
        title: project?.name || 'Project',
        viewType: 'insight',
        closable: true,
        params: { itemType: 'project', itemId: projectId },
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
          placeholder="Filter projects, tasks..."
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
      <div style={{ flex: 1, padding: '8px 6px', overflowY: 'auto', overflowX: 'hidden' }}>
        {treeData.length > 0 ? (
          <>
            <Tree
              showIcon
              blockNode
              defaultExpandAll={projects.length <= 4}
              treeData={treeData}
              onSelect={handleSelect}
              onRightClick={handleRightClick}
              style={{
                background: 'transparent',
                fontSize: 'var(--font-size-ui, 13px)',
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
            description="No items found"
            style={{ marginTop: 24 }}
          />
        )}
      </div>

      {/* CRUD Modals and Drawers */}
      <ProjectModal
        open={projectModalOpen}
        project={editingProject}
        onClose={() => setProjectModalOpen(false)}
        onSave={async (values) => {
          try {
            if (editingProject) {
              await updateProject(editingProject.id, values, db);
              message.success('Đã cập nhật dự án');
            } else {
              await createProject(values, db);
              message.success('Đã tạo dự án mới');
            }
            setProjectModalOpen(false);
          } catch {
            message.error('Không thể lưu dự án');
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

      <CascadeDeleteModal
        open={cascadeModalOpen}
        targetType={cascadeTarget?.type ?? 'project'}
        targetName={cascadeTarget?.name ?? ''}
        childMilestoneCount={cascadeTarget?.childMilestoneCount ?? 0}
        childTaskCount={cascadeTarget?.childTaskCount ?? 0}
        onClose={() => setCascadeModalOpen(false)}
        onConfirm={async (mode) => {
          if (!cascadeTarget) return;
          try {
            if (cascadeTarget.type === 'project') {
              await deleteProjectWithCascade(cascadeTarget.id, mode, db);
              message.success('Đã xóa dự án');
            } else {
              await deleteMilestoneWithCascade(cascadeTarget.id, mode, db);
              message.success('Đã xóa cột mốc');
            }
            setCascadeModalOpen(false);
          } catch {
            message.error('Không thể xóa');
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
