import React from 'react';
import { Tooltip } from 'antd';
import {
  MinusOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { JetBrainsAIIcon } from '../../components/icons/JetBrainsIcons';
import { useLayoutStore } from '../store/layoutStore';
import { useAIChat } from '../../context/AIChatContext';
import { AIChatDrawer } from '../../components/ai/AIChatDrawer';
import { NotificationPanel } from './NotificationPanel';
import type { TaskPlannerDatabase } from '../../db';

export interface RightToolWindowProps {
  db?: TaskPlannerDatabase | undefined;
  children?: React.ReactNode;
}

export function RightToolWindow({
  db,
  children,
}: RightToolWindowProps) {
  const rightActiveId = useLayoutStore((s) => s.rightActiveId);
  const toggleToolWindow = useLayoutStore((s) => s.toggleToolWindow);
  const { closeChat } = useAIChat();

  const handleCollapse = () => {
    if (rightActiveId) {
      if (rightActiveId === 'ai_chat') {
        closeChat();
      }
      toggleToolWindow('right', rightActiveId);
    }
  };

  const getHeaderMeta = () => {
    switch (rightActiveId) {
      case 'notifications':
        return {
          title: 'Notifications & Alerts',
          icon: <BellOutlined style={{ fontSize: 13, color: 'var(--accent, #3871e1)' }} />,
        };
      case 'ai_chat':
      default:
        return {
          title: 'AI Assistant',
          icon: <JetBrainsAIIcon size={14} />,
        };
    }
  };

  const { title, icon } = getHeaderMeta();

  return (
    <div
      className="workbench-toolwindow-right"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--bg-island, #ffffff)',
        overflow: 'hidden',
      }}
    >
      {/* Header - rendered for notifications/custom slots, ai_chat has its own native tool window header */}
      {rightActiveId !== 'ai_chat' && (
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
                onClick={handleCollapse}
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
      )}

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          background: 'var(--bg-app, #ffffff)',
        }}
      >
        {rightActiveId === 'ai_chat' ? (
          <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
            <AIChatDrawer
              open={true}
              onClose={handleCollapse}
              isPinned={true}
              isDockedPanel={true}
              {...(db ? { db } : {})}
            />
          </div>
        ) : rightActiveId === 'notifications' ? (
          <NotificationPanel db={db} />
        ) : (
          children || null
        )}
      </div>
    </div>
  );
}
export default RightToolWindow;
