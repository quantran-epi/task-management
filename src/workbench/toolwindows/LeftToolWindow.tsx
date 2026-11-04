import { useMemo } from 'react';
import { Tree, Tooltip, Empty } from 'antd';
import {
  FolderOutlined,
  FlagOutlined,
  MinusOutlined,
  SettingOutlined,
  CheckSquareOutlined,
  CalendarOutlined,
  ProjectOutlined,
  FileTextOutlined,
  DashboardOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getAllProjects } from '../../db/repositories/projectRepo';
import { getAllMilestones } from '../../db/repositories/milestoneRepo';
import { useLayoutStore, type EditorViewType } from '../store/layoutStore';
import type { DataNode } from 'antd/es/tree';

export interface LeftToolWindowProps {
  db?: TaskPlannerDatabase | undefined;
  onSelectProject?: ((projectId: string | null) => void) | undefined;
  onOpenSettings?: (() => void) | undefined;
}

interface NavItem {
  key: EditorViewType;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'tasks', label: 'Tasks', icon: <CheckSquareOutlined /> },
  { key: 'planner', label: 'Capacity Planner', icon: <CalendarOutlined /> },
  { key: 'projects', label: 'Projects', icon: <ProjectOutlined /> },
  { key: 'notes', label: 'Docs', icon: <FileTextOutlined /> },
  { key: 'dashboard', label: 'Dashboard', icon: <DashboardOutlined /> },
  { key: 'analytics', label: 'Analytics', icon: <LineChartOutlined /> },
];

export function LeftToolWindow({
  db = defaultDb,
  onSelectProject,
  onOpenSettings,
}: LeftToolWindowProps) {
  const toggleToolWindow = useLayoutStore((s) => s.toggleToolWindow);
  const openTab = useLayoutStore((s) => s.openTab);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const openTabs = useLayoutStore((s) => s.openTabs);

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  // Read-only tree rendering for navigation
  const projects = useLiveQuery(() => getAllProjects(db), [db]) ?? [];
  const milestones = useLiveQuery(() => getAllMilestones(db), [db]) ?? [];

  const treeData = useMemo<DataNode[]>(() => {
    return projects.map((p) => {
      const pMilestones = milestones.filter((m) => m.projectId === p.id);
      return {
        key: `project:${p.id}`,
        title: p.name,
        icon: <FolderOutlined style={{ color: (p as any).color || 'var(--accent, #3871e1)' }} />,
        children: pMilestones.map((m) => ({
          key: `milestone:${m.id}`,
          title: m.name,
          icon: <FlagOutlined style={{ color: 'var(--fg-muted, #6c707e)' }} />,
          isLeaf: true,
        })),
      };
    });
  }, [projects, milestones]);

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
        viewType: 'projects',
        closable: true,
        params: { projectId },
      });
    } else if (key.startsWith('milestone:')) {
      const milestoneId = key.replace('milestone:', '');
      const milestone = milestones.find((m) => m.id === milestoneId);
      if (milestone) {
        onSelectProject?.(milestone.projectId);
        openTab({
          id: `tasks-m-${milestoneId}`,
          title: `Tasks: ${milestone.name}`,
          viewType: 'tasks',
          closable: true,
          params: { projectId: milestone.projectId, milestoneId },
        });
      }
    }
  };

  const handleNavClick = (item: NavItem) => {
    openTab({
      id: item.key,
      title: item.label,
      viewType: item.key,
      closable: item.key !== 'tasks',
    });
  };

  return (
    <div
      className="workbench-toolwindow-left"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--bg-island, #ffffff)',
        overflow: 'hidden',
      }}
    >
      {/* Tool Window Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 32,
          padding: '0 10px',
          borderBottom: '1px solid var(--border, #e9eaee)',
          background: 'var(--bg-elev, #f7f8fa)',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: '0.02em',
            color: 'var(--fg-strong, #000000)',
          }}
        >
          Explorer
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {onOpenSettings && (
            <Tooltip title="Settings">
              <button
                type="button"
                onClick={onOpenSettings}
                aria-label="Settings"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 3,
                  borderRadius: 3,
                  cursor: 'pointer',
                  color: 'var(--fg-muted, #6c707e)',
                }}
              >
                <SettingOutlined style={{ fontSize: 11 }} />
              </button>
            </Tooltip>
          )}
          <Tooltip title="Hide Explorer">
            <button
              type="button"
              onClick={() => toggleToolWindow('left', 'projects')}
              aria-label="Collapse tool window"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 3,
                borderRadius: 3,
                cursor: 'pointer',
                color: 'var(--fg-muted, #6c707e)',
              }}
            >
              <MinusOutlined style={{ fontSize: 11 }} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Explorer Body */}
      <div
        style={{
          flex: 1,
          padding: '8px 6px',
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Quick Views Navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {NAV_ITEMS.map((item) => {
            const isSelected = activeTab?.viewType === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavClick(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 28,
                  padding: '0 8px',
                  borderRadius: 'var(--radius-control, 4px)',
                  border: 'none',
                  background: isSelected ? 'var(--bg-selected, #d0dffe)' : 'transparent',
                  color: isSelected ? 'var(--fg-strong, #000000)' : 'var(--fg, #191b1f)',
                  fontWeight: isSelected ? 600 : 400,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.12s ease',
                  width: '100%',
                }}
              >
                <span style={{ fontSize: 13, color: isSelected ? 'var(--accent, #3871e1)' : 'var(--fg-icon, #6c707e)' }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Section Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 6px 0',
            borderTop: '1px solid var(--border, #e9eaee)',
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--fg-muted, #6c707e)',
            }}
          >
            Projects & Milestones
          </span>
        </div>

        {/* Projects & Milestones Tree */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {treeData.length > 0 ? (
            <Tree
              showIcon
              blockNode
              treeData={treeData}
              onSelect={handleSelect}
              style={{
                background: 'transparent',
                fontSize: 12.5,
              }}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No projects"
              style={{ marginTop: 16 }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
