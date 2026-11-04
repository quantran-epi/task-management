import { useMemo, type CSSProperties } from 'react';
import { Dropdown, Button, Tooltip, Typography, type MenuProps } from 'antd';
import {
  DownOutlined,
  SearchOutlined,
  MinusOutlined,
  BorderOutlined,
  CloseOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ActiveTimerWidget } from '../components/timer/ActiveTimerWidget';

export interface TitleBarProps {
  selectedProjectId?: string | null | undefined;
  onSelectProject?: ((projectId: string | null) => void) | undefined;
  onOpenSearch?: (() => void) | undefined;
  title?: string | undefined;
}

export function TitleBar({
  selectedProjectId,
  onSelectProject,
  onOpenSearch,
  title = 'TaskMate',
}: TitleBarProps) {
  const projects = useLiveQuery(
    async () => {
      const list = await db.projects.toArray();
      return list.sort((a, b) => a.name.localeCompare(b.name));
    },
    [],
    []
  );

  const currentProject = useMemo(() => {
    if (!selectedProjectId || !projects) return null;
    return projects.find((p) => p.id === selectedProjectId) ?? null;
  }, [selectedProjectId, projects]);

  const projectMenuItems: MenuProps['items'] = useMemo(() => {
    const items: MenuProps['items'] = [
      {
        key: '__all_projects__',
        label: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 160 }}>
            <span>All Projects</span>
            {!selectedProjectId && <CheckOutlined style={{ fontSize: 11, color: 'var(--accent, #3871e1)' }} />}
          </div>
        ),
        onClick: () => onSelectProject?.(null),
      },
      { type: 'divider' },
    ];

    if (!projects || projects.length === 0) {
      items.push({
        key: '__no_projects__',
        disabled: true,
        label: <span style={{ color: 'var(--fg-muted, #6c707e)' }}>No projects</span>,
      });
      return items;
    }

    projects.forEach((proj) => {
      const isSelected = proj.id === selectedProjectId;
      items.push({
        key: proj.id,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 160 }}>
            {/* T-25.4-09: Render project name as text to prevent tampering */}
            <Typography.Text ellipsis style={{ maxWidth: 180, fontSize: 12 }}>
              {proj.name}
            </Typography.Text>
            {isSelected && <CheckOutlined style={{ fontSize: 11, color: 'var(--accent, #3871e1)', marginLeft: 8 }} />}
          </div>
        ),
        onClick: () => onSelectProject?.(proj.id),
      });
    });

    return items;
  }, [projects, selectedProjectId, onSelectProject]);

  const handleMinimize = async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().minimize();
      } catch {
        // Fallback or ignore in browser dev
      }
    }
  };

  const handleMaximize = async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().toggleMaximize();
      } catch {
        // Fallback or ignore in browser dev
      }
    }
  };

  const handleClose = async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
      } catch {
        // Fallback or ignore in browser dev
      }
    }
  };

  const dragStyle: CSSProperties = {
    height: 'var(--titlebar-height, 38px)',
    minHeight: 'var(--titlebar-height, 38px)',
    background: 'transparent',
    borderBottom: '1px solid var(--border-strong, #d1d3d9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 10,
    paddingRight: 6,
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
    <header data-tauri-drag-region style={dragStyle}>
      {/* Left: App Project Avatar & Project Switcher Dropdown */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          ...noDragStyle,
        }}
      >
        {/* Project Avatar with OpenIDEA Gradient */}
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            background: 'linear-gradient(135deg, var(--project-color, #3574f0), var(--project-color-end, #7a64f0))',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.02em',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            flexShrink: 0,
          }}
        >
          {currentProject ? currentProject.name.charAt(0).toUpperCase() : 'T'}
        </div>

        <Dropdown menu={{ items: projectMenuItems }} trigger={['click']} placement="bottomLeft">
          <Button
            type="text"
            size="small"
            style={{
              height: 26,
              padding: '0 8px',
              fontSize: 12.5,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              color: 'var(--fg-strong, #000000)',
              borderRadius: 'var(--radius-control, 4px)',
            }}
            aria-label="Switch project"
          >
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentProject ? currentProject.name : title}
            </span>
            <DownOutlined style={{ fontSize: 9, opacity: 0.6 }} />
          </Button>
        </Dropdown>
      </div>

      {/* Center: Search Everywhere Button */}
      <div
        style={{
          flex: 1,
          maxWidth: 360,
          margin: '0 16px',
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
            height: 26,
            background: 'var(--bg-island, #ffffff)',
            border: '1px solid var(--border-strong, #d1d3d9)',
            borderRadius: 'var(--radius-control, 4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 10px',
            fontSize: 12,
            color: 'var(--fg-muted, #6c707e)',
            cursor: 'pointer',
            outline: 'none',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
            transition: 'border-color 0.15s ease',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SearchOutlined style={{ fontSize: 12, color: 'var(--fg-icon, #6c707e)' }} />
            <span>Search everywhere...</span>
          </span>
          <kbd
            style={{
              fontSize: 10,
              fontFamily: 'inherit',
              padding: '1px 5px',
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

      {/* Right: Active Timer Widget & Desktop Window Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          ...noDragStyle,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <ActiveTimerWidget />
        </div>

        {/* Window action buttons (Minimize, Maximize, Close) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: 4 }}>
          <Tooltip title="Minimize Window">
            <Button
              type="text"
              size="small"
              icon={<MinusOutlined style={{ fontSize: 11 }} />}
              onClick={handleMinimize}
              aria-label="Minimize Window"
              style={{ width: 24, height: 24, minWidth: 24, padding: 0, borderRadius: 2 }}
            />
          </Tooltip>
          <Tooltip title="Maximize Window">
            <Button
              type="text"
              size="small"
              icon={<BorderOutlined style={{ fontSize: 10 }} />}
              onClick={handleMaximize}
              aria-label="Maximize Window"
              style={{ width: 24, height: 24, minWidth: 24, padding: 0, borderRadius: 2 }}
            />
          </Tooltip>
          <Tooltip title="Close Window">
            <Button
              type="text"
              size="small"
              danger
              icon={<CloseOutlined style={{ fontSize: 11 }} />}
              onClick={handleClose}
              aria-label="Close Window"
              style={{ width: 24, height: 24, minWidth: 24, padding: 0, borderRadius: 2 }}
            />
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
