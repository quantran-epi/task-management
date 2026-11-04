import { useMemo } from 'react';
import { Tree, Tooltip, Empty } from 'antd';
import {
  FolderOutlined,
  FlagOutlined,
  MinusOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getAllProjects } from '../../db/repositories/projectRepo';
import { getAllMilestones } from '../../db/repositories/milestoneRepo';
import { useLayoutStore } from '../store/layoutStore';
import type { DataNode } from 'antd/es/tree';

export interface LeftToolWindowProps {
  db?: TaskPlannerDatabase | undefined;
  onSelectProject?: ((projectId: string | null) => void) | undefined;
  onOpenSettings?: (() => void) | undefined;
}

export function LeftToolWindow({
  db = defaultDb,
  onSelectProject,
  onOpenSettings,
}: LeftToolWindowProps) {
  const toggleToolWindow = useLayoutStore((s) => s.toggleToolWindow);
  const openTab = useLayoutStore((s) => s.openTab);

  // T-25.4-04: Read-only tree rendering for navigation; all data mutations route through existing db repositories
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
      }
    }
  };

  return (
    <div
      className="workbench-toolwindow-left"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--bg-island, #f7f8f9)',
        overflow: 'hidden',
      }}
    >
      {/* Tool Window Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 28,
          padding: '0 8px',
          borderBottom: '1px solid var(--border, #e9eaee)',
          background: 'var(--bg-elev, #f7f8f9)',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 11,
            letterSpacing: 0.5,
            color: 'var(--fg-secondary, #5f6269)',
            textTransform: 'uppercase',
          }}
        >
          Projects & Milestones
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
                  padding: 2,
                  borderRadius: 2,
                  cursor: 'pointer',
                  color: 'var(--fg-muted, #6c707e)',
                }}
              >
                <SettingOutlined style={{ fontSize: 11 }} />
              </button>
            </Tooltip>
          )}
          <Tooltip title="Collapse">
            <button
              type="button"
              onClick={() => toggleToolWindow('left', 'projects')}
              aria-label="Collapse tool window"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 2,
                borderRadius: 2,
                cursor: 'pointer',
                color: 'var(--fg-muted, #6c707e)',
              }}
            >
              <MinusOutlined style={{ fontSize: 11 }} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Tree Content Area */}
      <div
        style={{
          flex: 1,
          padding: '6px 4px',
          overflow: 'auto',
        }}
      >
        {treeData.length > 0 ? (
          <Tree
            showIcon
            blockNode
            treeData={treeData}
            onSelect={handleSelect}
            style={{
              background: 'transparent',
              fontSize: 'var(--font-size-ui, 12.5px)',
            }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No projects found"
            style={{ marginTop: 24 }}
          />
        )}
      </div>
    </div>
  );
}
