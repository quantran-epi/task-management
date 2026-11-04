import { useState, type CSSProperties } from 'react';
import { Button, Tooltip, Modal, Typography, Tag, Badge, message } from 'antd';
import {
  SearchOutlined,
  SettingOutlined,
  DashboardOutlined,
  CalendarOutlined,
  LineChartOutlined,
  CheckSquareOutlined,
  DesktopOutlined,
  CodeOutlined,
  SwapOutlined,
  ThunderboltOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { isTauriApp } from '../utils/timerPopout';
import { useGhostDevSessions } from '../hooks/useGhostDevSessions';
import { useTelegramPendingUsers } from '../hooks/useTelegramPendingUsers';
import type { EditorViewType } from './store/layoutStore';

export interface TitleBarProps {
  onOpenSearch?: (() => void) | undefined;
  onOpenSettings?: (() => void) | undefined;
  onOpenView?: ((view: EditorViewType) => void) | undefined;
  activeView?: string | undefined;
  title?: string | undefined;
}

export function TitleBar({
  onOpenSearch,
  onOpenSettings,
  onOpenView,
  activeView,
  title = 'TaskMate',
}: TitleBarProps) {
  const [tauriModalOpen, setTauriModalOpen] = useState(false);
  const isTauri = isTauriApp();

  const { sessions } = useGhostDevSessions();
  const { pendingCount } = useTelegramPendingUsers();
  const runningCount = sessions.filter(
    (s) => s.status === 'running' || s.status === 'awaiting_approval'
  ).length;

  const handleOpenTauriDevTools = async () => {
    if (isTauri && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_devtools');
        message.success('Opened Tauri DevTools');
      } catch (e) {
        message.info('DevTools trigger executed');
      }
    } else {
      message.info('DevTools available in Tauri desktop application');
    }
  };

  const handleSwitchShell = (shell: 'default' | 'intellij') => {
    try {
      if (shell === 'default') {
        localStorage.removeItem('taskmate_ui_shell');
      } else {
        localStorage.setItem('taskmate_ui_shell', 'intellij');
      }
    } catch {}
    window.location.reload();
  };

  const dragStyle: CSSProperties = {
    height: 'var(--titlebar-height, 40px)',
    minHeight: 'var(--titlebar-height, 40px)',
    background: 'transparent',
    borderBottom: '1px solid var(--border-strong, #d1d3d9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 12,
    paddingRight: 12,
    userSelect: 'none',
    position: 'relative',
    zIndex: 10,
    boxSizing: 'border-box',
    // @ts-expect-error WebkitAppRegion is standard for desktop electron/tauri drag regions
    WebkitAppRegion: 'drag',
  };

  const noDragStyle: CSSProperties = {
    // @ts-expect-error WebkitAppRegion is standard for desktop electron/tauri drag regions
    WebkitAppRegion: 'no-drag',
  };

  return (
    <>
      <header data-tauri-drag-region style={dragStyle}>
        {/* Left: App Logo & Brand Name */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            ...noDragStyle,
          }}
        >
          {/* Logo badge with gradient */}
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 5,
              background: 'linear-gradient(135deg, var(--project-color, #3574f0), var(--project-color-end, #7a64f0))',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.02em',
              boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
              flexShrink: 0,
            }}
          >
            T
          </div>

          <span
            style={{
              fontWeight: 700,
              fontSize: 'var(--font-size-ui, 13.5px)',
              color: 'var(--fg-strong, #000000)',
              letterSpacing: '0.02em',
            }}
          >
            {title}
          </span>
        </div>

        {/* Center: Search Everywhere Button */}
        <div
          style={{
            flex: 1,
            maxWidth: 340,
            margin: '0 12px',
            ...noDragStyle,
          }}
        >
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search Everywhere (Double Shift / Ctrl+K)"
            title="Search Everywhere (Double Shift or Ctrl+K)"
            style={{
              width: '100%',
              height: 28,
              background: 'var(--bg-island, #ffffff)',
              border: '1px solid var(--border-strong, #d1d3d9)',
              borderRadius: 'var(--radius-control, 4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              fontSize: 'var(--font-size-small, 12px)',
              color: 'var(--fg-muted, #6c707e)',
              cursor: 'pointer',
              outline: 'none',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
              transition: 'border-color 0.15s ease',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <SearchOutlined style={{ fontSize: 13, color: 'var(--fg-icon, #6c707e)' }} />
              <span>Search everywhere...</span>
            </span>
            <kbd
              style={{
                fontSize: 10.5,
                fontFamily: 'inherit',
                padding: '1px 6px',
                borderRadius: 3,
                background: 'var(--bg-frame, #e9eaee)',
                border: '1px solid var(--border-strong, #d1d3d9)',
                color: 'var(--fg-secondary, #5f6269)',
              }}
            >
              Double ⇧
            </kbd>
          </button>
        </div>

        {/* Right: Quick Views Navigation, Tauri Trigger, AI Trigger & Settings */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            ...noDragStyle,
          }}
        >
          {/* Quick Views Navigation Group */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-island, #ffffff)',
              border: '1px solid var(--border-strong, #d1d3d9)',
              borderRadius: 'var(--radius-control, 4px)',
              padding: 2,
              gap: 2,
            }}
          >
            <Tooltip title="Dashboard Overview">
              <Button
                type="text"
                size="small"
                icon={<DashboardOutlined style={{ fontSize: 12.5 }} />}
                onClick={() => onOpenView?.('dashboard')}
                aria-label="Open Dashboard"
                style={{
                  height: 24,
                  padding: '0 7px',
                  fontSize: 12,
                  borderRadius: 3,
                  color: activeView === 'dashboard' ? 'var(--accent, #3871e1)' : 'var(--fg-secondary, #5f6269)',
                  background: activeView === 'dashboard' ? 'var(--bg-selected, #d0dffe)' : 'transparent',
                  fontWeight: activeView === 'dashboard' ? 600 : 400,
                }}
              >
                Dashboard
              </Button>
            </Tooltip>

            <Tooltip title="Task Management">
              <Button
                type="text"
                size="small"
                icon={<CheckSquareOutlined style={{ fontSize: 12.5 }} />}
                onClick={() => onOpenView?.('tasks')}
                aria-label="Open Tasks"
                style={{
                  height: 24,
                  padding: '0 7px',
                  fontSize: 12,
                  borderRadius: 3,
                  color: activeView === 'tasks' ? 'var(--accent, #3871e1)' : 'var(--fg-secondary, #5f6269)',
                  background: activeView === 'tasks' ? 'var(--bg-selected, #d0dffe)' : 'transparent',
                  fontWeight: activeView === 'tasks' ? 600 : 400,
                }}
              >
                Tasks
              </Button>
            </Tooltip>

            <Tooltip title="Capacity Planner">
              <Button
                type="text"
                size="small"
                icon={<CalendarOutlined style={{ fontSize: 12.5 }} />}
                onClick={() => onOpenView?.('planner')}
                aria-label="Open Capacity Planner"
                style={{
                  height: 24,
                  padding: '0 7px',
                  fontSize: 12,
                  borderRadius: 3,
                  color: activeView === 'planner' ? 'var(--accent, #3871e1)' : 'var(--fg-secondary, #5f6269)',
                  background: activeView === 'planner' ? 'var(--bg-selected, #d0dffe)' : 'transparent',
                  fontWeight: activeView === 'planner' ? 600 : 400,
                }}
              >
                Planner
              </Button>
            </Tooltip>

            <Tooltip title="Ghost Dev Agents">
              <Button
                type="text"
                size="small"
                icon={<ThunderboltOutlined style={{ fontSize: 12.5 }} />}
                onClick={() => onOpenView?.('agents')}
                aria-label="Open Ghost Dev Agents"
                style={{
                  height: 24,
                  padding: '0 7px',
                  fontSize: 12,
                  borderRadius: 3,
                  color: activeView === 'agents' ? 'var(--accent, #3871e1)' : 'var(--fg-secondary, #5f6269)',
                  background: activeView === 'agents' ? 'var(--bg-selected, #d0dffe)' : 'transparent',
                  fontWeight: activeView === 'agents' ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>Ghost Dev</span>
                {runningCount > 0 && (
                  <Badge count={runningCount} size="small" style={{ backgroundColor: 'var(--accent, #3871e1)' }} />
                )}
              </Button>
            </Tooltip>

            <Tooltip title="Telegram Bot Monitor">
              <Button
                type="text"
                size="small"
                icon={<SendOutlined style={{ fontSize: 12.5 }} />}
                onClick={() => onOpenView?.('telegram')}
                aria-label="Open Telegram Bot"
                style={{
                  height: 24,
                  padding: '0 7px',
                  fontSize: 12,
                  borderRadius: 3,
                  color: activeView === 'telegram' ? 'var(--accent, #3871e1)' : 'var(--fg-secondary, #5f6269)',
                  background: activeView === 'telegram' ? 'var(--bg-selected, #d0dffe)' : 'transparent',
                  fontWeight: activeView === 'telegram' ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>Telegram</span>
                {pendingCount > 0 && (
                  <Badge count={pendingCount} size="small" style={{ backgroundColor: 'var(--danger, #c54e58)' }} />
                )}
              </Button>
            </Tooltip>

            <Tooltip title="Analytics & Reports">
              <Button
                type="text"
                size="small"
                icon={<LineChartOutlined style={{ fontSize: 12.5 }} />}
                onClick={() => onOpenView?.('analytics')}
                aria-label="Open Analytics"
                style={{
                  height: 24,
                  padding: '0 7px',
                  fontSize: 12,
                  borderRadius: 3,
                  color: activeView === 'analytics' ? 'var(--accent, #3871e1)' : 'var(--fg-secondary, #5f6269)',
                  background: activeView === 'analytics' ? 'var(--bg-selected, #d0dffe)' : 'transparent',
                  fontWeight: activeView === 'analytics' ? 600 : 400,
                }}
              >
                Analytics
              </Button>
            </Tooltip>
          </div>

          {/* Tauri Desktop Runtime Check Trigger Button */}
          <Tooltip title={isTauri ? 'Tauri Desktop Runtime (Click to inspect / switch shell)' : 'Web Browser Runtime (Click to switch shell)'}>
            <Button
              type="text"
              size="small"
              icon={
                <DesktopOutlined
                  style={{
                    fontSize: 13,
                    color: isTauri ? 'var(--success, #338555)' : 'var(--fg-muted, #6c707e)',
                  }}
                />
              }
              onClick={() => setTauriModalOpen(true)}
              aria-label="Tauri Desktop Runtime Check"
              style={{
                width: 28,
                height: 28,
                minWidth: 28,
                padding: 0,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </Tooltip>

          {/* Settings Action */}
          {onOpenSettings && (
            <Tooltip title="Settings">
              <Button
                type="text"
                size="small"
                icon={<SettingOutlined style={{ fontSize: 14, color: 'var(--fg-secondary, #5f6269)' }} />}
                onClick={onOpenSettings}
                aria-label="Settings"
                style={{
                  width: 28,
                  height: 28,
                  minWidth: 28,
                  padding: 0,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              />
            </Tooltip>
          )}
        </div>
      </header>

      {/* Tauri & Shell Runtime Diagnostics Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DesktopOutlined style={{ color: 'var(--accent, #3871e1)' }} />
            <span>TaskMate Application Runtime</span>
          </div>
        }
        open={tauriModalOpen}
        onCancel={() => setTauriModalOpen(false)}
        footer={null}
        width={420}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
          <div>
            <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>
              Active Runtime:
            </Typography.Text>
            <Tag color={isTauri ? 'green' : 'blue'} style={{ fontSize: 13, padding: '3px 8px' }}>
              {isTauri ? 'Tauri Desktop v2 Native' : 'Modern Web Browser'}
            </Tag>
          </div>

          <div>
            <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>
              Current UI Shell:
            </Typography.Text>
            <Tag color="purple" style={{ fontSize: 13, padding: '3px 8px' }}>
              JetBrains ExpUI Islands Workbench
            </Tag>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {isTauri && (
              <Button
                icon={<CodeOutlined />}
                onClick={handleOpenTauriDevTools}
                block
              >
                Open Tauri DevTools
              </Button>
            )}

            <Button
              icon={<SwapOutlined />}
              onClick={() => handleSwitchShell('default')}
              block
            >
              Switch to Classic Ant Design Shell
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
export default TitleBar;
