import { Tooltip } from 'antd';
import { RobotOutlined, MinusOutlined } from '@ant-design/icons';
import { AIChatDrawer } from '../../components/ai/AIChatDrawer';
import { useLayoutStore } from '../store/layoutStore';
import type { TaskPlannerDatabase } from '../../db';

export interface BottomToolWindowProps {
  db?: TaskPlannerDatabase | undefined;
}

export function BottomToolWindow({ db }: BottomToolWindowProps) {
  const bottomActiveId = useLayoutStore((s) => s.bottomActiveId);
  const toggleToolWindow = useLayoutStore((s) => s.toggleToolWindow);

  const handleCollapse = () => {
    if (bottomActiveId) {
      toggleToolWindow('bottom', bottomActiveId);
    }
  };

  return (
    <div
      className="workbench-toolwindow-bottom"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--bg-island, #ffffff)',
        overflow: 'hidden',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 30,
          padding: '0 10px',
          borderBottom: '1px solid var(--border, #e9eaee)',
          background: 'var(--bg-elev, #f7f8fa)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--fg-strong, #000)' }}>
          <RobotOutlined style={{ fontSize: 13, color: 'var(--accent, #3871e1)' }} />
          <span>AI Assistant</span>
        </div>

        <Tooltip title="Hide Tool Window">
          <button
            type="button"
            onClick={handleCollapse}
            aria-label="Collapse tool window"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              borderRadius: 3,
              cursor: 'pointer',
              color: 'var(--fg-muted, #6c707e)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <MinusOutlined style={{ fontSize: 11 }} />
          </button>
        </Tooltip>
      </div>

      {/* Body hosting AIChatDrawer */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          background: 'var(--bg-island, #ffffff)',
        }}
      >
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          <AIChatDrawer
            open={true}
            onClose={handleCollapse}
            isPinned={true}
            {...(db ? { db } : {})}
          />
        </div>
      </div>
    </div>
  );
}
