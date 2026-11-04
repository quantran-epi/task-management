import { Tooltip } from 'antd';
import {
  MinusOutlined,
  ProjectOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useLayoutStore } from '../store/layoutStore';
import { ProjectExplorer } from './ProjectExplorer';
import { DocsExplorer } from './DocsExplorer';

export interface LeftToolWindowProps {
  db?: TaskPlannerDatabase | undefined;
  onSelectProject?: ((projectId: string | null) => void) | undefined;
}

export function LeftToolWindow({
  db = defaultDb,
  onSelectProject,
}: LeftToolWindowProps) {
  const leftActiveId = useLayoutStore((s) => s.leftActiveId);
  const toggleToolWindow = useLayoutStore((s) => s.toggleToolWindow);

  const isDocs = leftActiveId === 'docs';
  const title = isDocs ? 'Docs Explorer' : 'Project Explorer';
  const icon = isDocs ? (
    <FileTextOutlined style={{ fontSize: 13, color: 'var(--accent, #3871e1)' }} />
  ) : (
    <ProjectOutlined style={{ fontSize: 13, color: 'var(--accent, #3871e1)' }} />
  );

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
          height: 34,
          padding: '0 12px',
          borderBottom: '1px solid var(--border, #e9eaee)',
          background: 'var(--bg-elev, #f7f8fa)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {icon}
          <span
            style={{
              fontWeight: 600,
              fontSize: 'var(--font-size-ui, 13px)',
              letterSpacing: '0.01em',
              color: 'var(--fg-strong, #000000)',
            }}
          >
            {title}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tooltip title={`Collapse ${title}`}>
            <button
              type="button"
              onClick={() => toggleToolWindow('left', leftActiveId || 'projects')}
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
              <MinusOutlined style={{ fontSize: 12 }} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Explorer Content Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {isDocs ? (
          <DocsExplorer db={db} />
        ) : (
          <ProjectExplorer db={db} onSelectProject={onSelectProject} />
        )}
      </div>
    </div>
  );
}
