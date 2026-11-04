import { useMemo, type CSSProperties } from 'react';
import { Dropdown, Button, Tooltip, Typography, type MenuProps } from 'antd';
import {
  FolderOutlined,
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
    height: 'var(--titlebar-height, 34px)',
    minHeight: 'var(--titlebar-height, 34px)',
    background: 'var(--bg-elev, #f7f8f9)',
    borderBottom: '1px solid var(--border, #e9eaee)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 8,
    paddingRight: 4,
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
      {/* Left: App Logo & Project Switcher Dropdown */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          ...noDragStyle,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: 0.3,
            color: 'var(--fg, #000000)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ color: 'var(--accent, #3871e1)', fontWeight: 700 }}>TM</span>
          {title}
        </span>

        <span style={{ color: 'var(--border-strong, #d1d3d9)', margin: '0 2px' }}>/</span>

        <Dropdown menu={{ items: projectMenuItems }} trigger={['click']} placement="bottomLeft">
          <Button
            type="text"
            size="small"
            style={{
              height: 24,
              padding: '0 6px',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--fg-secondary, #5f6269)',
              border: '1px solid transparent',
              borderRadius: 3,
            }}
            aria-label="Switch project"
          >
            <FolderOutlined style={{ fontSize: 12 }} />
            <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentProject ? currentProject.name : 'All Projects'}
            </span>
            <DownOutlined style={{ fontSize: 9, opacity: 0.7 }} />
          </Button>
        </Dropdown>
      </div>

      {/* Center: Search Everywhere Button */}
      <div
        style={{
          flex: 1,
          maxWidth: 380,
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
            height: 24,
            background: 'var(--bg-app, #ffffff)',
            border: '1px solid var(--border, #e9eaee)',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            fontSize: 11.5,
            color: 'var(--fg-muted, #6c707e)',
            cursor: 'pointer',
            outline: 'none',
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
              padding: '1px 4px',
              borderRadius: 2,
              background: 'var(--bg-island, #f7f8f9)',
              border: '1px solid var(--border, #e9eaee)',
              color: 'var(--fg-secondary, #5f6269)',
            }}
          >
            Double ⇧ / ⌘K
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
