import React from 'react';
import { Empty, Tooltip } from 'antd';
import { MinusOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useLayoutStore } from '../store/layoutStore';

export interface RightToolWindowProps {
  title?: string;
  children?: React.ReactNode;
}

export function RightToolWindow({
  title = 'Inspector',
  children,
}: RightToolWindowProps) {
  const rightActiveId = useLayoutStore((s) => s.rightActiveId);
  const toggleToolWindow = useLayoutStore((s) => s.toggleToolWindow);

  const handleCollapse = () => {
    if (rightActiveId) {
      toggleToolWindow('right', rightActiveId);
    }
  };

  return (
    <div
      className="workbench-toolwindow-right"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--bg-island, #f7f8f9)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
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
          {title}
        </span>
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

      {/* Body */}
      <div
        style={{
          flex: 1,
          padding: 12,
          overflow: 'auto',
          background: 'var(--bg-app, #ffffff)',
        }}
      >
        {children || (
          <Empty
            image={<InfoCircleOutlined style={{ fontSize: 32, color: 'var(--fg-muted, #6c707e)' }} />}
            description="No item selected for inspection"
            style={{ marginTop: 32 }}
          />
        )}
      </div>
    </div>
  );
}
