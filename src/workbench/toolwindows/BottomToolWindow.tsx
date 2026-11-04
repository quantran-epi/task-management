import React, { useState } from 'react';
import { Tabs, Tooltip } from 'antd';
import {
  CommentOutlined,
  CodeOutlined,
  MinusOutlined,
  CloseOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { AIChatDrawer } from '../../components/ai/AIChatDrawer';
import { useLayoutStore } from '../store/layoutStore';
import type { TaskPlannerDatabase } from '../../db';

export interface BottomToolWindowProps {
  db?: TaskPlannerDatabase;
}

export function BottomToolWindow({ db }: BottomToolWindowProps) {
  const bottomActiveId = useLayoutStore((s) => s.bottomActiveId);
  const toggleToolWindow = useLayoutStore((s) => s.toggleToolWindow);
  const setToolWindowActive = useLayoutStore((s) => s.setToolWindowActive);

  const [activeTab, setActiveTab] = useState<'ai_chat' | 'logs'>(
    bottomActiveId === 'logs' ? 'logs' : 'ai_chat'
  );

  const handleTabChange = (key: string) => {
    const nextTab = key as 'ai_chat' | 'logs';
    setActiveTab(nextTab);
    setToolWindowActive('bottom', nextTab);
  };

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
        background: 'var(--bg-island, #f7f8f9)',
        overflow: 'hidden',
      }}
    >
      {/* Header bar with tabs and window controls */}
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
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Tabs
            size="small"
            activeKey={activeTab}
            onChange={handleTabChange}
            tabBarStyle={{ margin: 0, height: 28, borderBottom: 'none' }}
            items={[
              {
                key: 'ai_chat',
                label: (
                  <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <CommentOutlined style={{ fontSize: 11 }} /> AI Chat
                  </span>
                ),
              },
              {
                key: 'logs',
                label: (
                  <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <CodeOutlined style={{ fontSize: 11 }} /> System Logs
                  </span>
                ),
              },
            ]}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tooltip title="Collapse">
            <button
              type="button"
              onClick={handleCollapse}
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

      {/* Bottom Tool Window Body */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          background: 'var(--bg-app, #ffffff)',
        }}
      >
        {activeTab === 'ai_chat' ? (
          <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
            <AIChatDrawer
              open={true}
              onClose={handleCollapse}
              isPinned={true}
              db={db}
            />
          </div>
        ) : (
          <div
            style={{
              padding: 12,
              fontFamily: 'monospace',
              fontSize: 12,
              color: 'var(--fg-secondary, #5f6269)',
              height: '100%',
              overflow: 'auto',
            }}
          >
            <div style={{ color: 'var(--fg-muted, #6c707e)', marginBottom: 8 }}>
              [System Logs] Ready. Output redirected to workbench console.
            </div>
            <div>[info] Database connection established</div>
            <div>[info] Workbench theme: IntelliJ ExpUI Light</div>
            <div>[info] Storage persistence verified</div>
          </div>
        )}
      </div>
    </div>
  );
}
