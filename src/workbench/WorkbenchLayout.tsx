import React, { useState, useEffect, useCallback } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { AntdThemeAdapter } from './AntdThemeAdapter';
import { TitleBar } from './TitleBar';
import { Stripe, type ToolWindowItem } from './toolwindows/Stripe';
import { StatusBar } from './StatusBar';
import { EditorArea } from './EditorArea';
import { LeftToolWindow } from './toolwindows/LeftToolWindow';
import { BottomToolWindow } from './toolwindows/BottomToolWindow';
import { RightToolWindow } from './toolwindows/RightToolWindow';
import { useLayoutStore } from './store/layoutStore';
import { useGlobalKeymap } from './hooks/useGlobalKeymap';
import { useDoubleShift } from './hooks/useDoubleShift';
import { SearchEverywhereModal } from './search/SearchEverywhereModal';
import type { TaskPlannerDatabase } from '../db';
import {
  ProjectOutlined,
  CheckSquareOutlined,
  CommentOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import '../styles/workbench-tokens.css';

export interface WorkbenchLayoutProps {
  children?: React.ReactNode;
  leftPanelContent?: React.ReactNode;
  rightPanelContent?: React.ReactNode;
  bottomPanelContent?: React.ReactNode;
  selectedProjectId?: string | null | undefined;
  onSelectProject?: ((projectId: string | null) => void) | undefined;
  onOpenSearch?: (() => void) | undefined;
  onOpenSettings?: (() => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
}

const DEFAULT_LEFT_ITEMS: ToolWindowItem[] = [
  { id: 'projects', name: 'Projects', icon: <ProjectOutlined />, shortcut: 'Alt+1' },
  { id: 'tasks', name: 'Tasks', icon: <CheckSquareOutlined />, shortcut: 'Alt+2' },
];

const DEFAULT_RIGHT_ITEMS: ToolWindowItem[] = [
  { id: 'calendar', name: 'Calendar', icon: <CalendarOutlined />, shortcut: 'Alt+5' },
];

const DEFAULT_BOTTOM_ITEMS: ToolWindowItem[] = [
  { id: 'ai_chat', name: 'AI Assistant', icon: <CommentOutlined />, shortcut: 'Alt+3' },
];

export function WorkbenchLayout({
  children,
  leftPanelContent,
  rightPanelContent,
  bottomPanelContent,
  selectedProjectId,
  onSelectProject,
  onOpenSearch,
  onOpenSettings,
  db,
}: WorkbenchLayoutProps) {
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // Mount global keymap listener
  useGlobalKeymap();

  // Mount double-shift detector
  const handleDoubleShift = useCallback(() => {
    setSearchModalOpen(true);
  }, []);
  useDoubleShift(handleDoubleShift);

  // Listen to custom events from actionRegistry
  useEffect(() => {
    const handleOpenSearch = () => setSearchModalOpen(true);
    window.addEventListener('taskmate:open-search-everywhere', handleOpenSearch);
    return () => {
      window.removeEventListener('taskmate:open-search-everywhere', handleOpenSearch);
    };
  }, []);

  const handleOpenSearchUnified = useCallback(() => {
    setSearchModalOpen(true);
    onOpenSearch?.();
  }, [onOpenSearch]);

  const leftActiveId = useLayoutStore((s) => s.leftActiveId);
  const rightActiveId = useLayoutStore((s) => s.rightActiveId);
  const bottomActiveId = useLayoutStore((s) => s.bottomActiveId);

  const leftPanelSize = useLayoutStore((s) => s.leftPanelSize);
  const rightPanelSize = useLayoutStore((s) => s.rightPanelSize);
  const bottomPanelSize = useLayoutStore((s) => s.bottomPanelSize);

  const setPanelSize = useLayoutStore((s) => s.setPanelSize);

  return (
    <AntdThemeAdapter>
      <div
        className="workbench-root workbench-islands-frame"
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        {/* Top Title Bar */}
        <TitleBar
          selectedProjectId={selectedProjectId}
          onSelectProject={onSelectProject}
          onOpenSearch={handleOpenSearchUnified}
        />

        {/* Middle Body with Stripes and Splitters */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          {/* Left Stripe */}
          <Stripe slot="left" items={DEFAULT_LEFT_ITEMS} />

          {/* Master Resizable Panel Group (Horizontal: Left Panel | Center Column | Right Panel) */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0 6px 6px 0' }}>
            <PanelGroup
              direction="horizontal"
              autoSaveId="taskmate_workbench_hgroup"
              style={{ width: '100%', height: '100%' }}
            >
              {/* Left Docked Panel */}
              {leftActiveId && (
                <>
                  <Panel
                    id="left-panel"
                    defaultSize={leftPanelSize}
                    minSize={12}
                    maxSize={40}
                    onResize={(size) => setPanelSize('left', size)}
                    style={{
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      paddingRight: 3,
                    }}
                  >
                    <div className="workbench-island-card" style={{ height: '100%', width: '100%' }}>
                      {leftPanelContent || (
                        <LeftToolWindow
                          {...(db ? { db } : {})}
                          {...(onSelectProject ? { onSelectProject } : {})}
                          {...(onOpenSettings ? { onOpenSettings } : {})}
                        />
                      )}
                    </div>
                  </Panel>
                  <PanelResizeHandle
                    style={{
                      width: 6,
                      background: 'transparent',
                      cursor: 'col-resize',
                    }}
                  />
                </>
              )}

              {/* Center Column (Vertical: Editor Area (Top) & Bottom Panel) */}
              <Panel id="center-column" minSize={30}>
                <PanelGroup
                  direction="vertical"
                  autoSaveId="taskmate_workbench_vgroup"
                  style={{ width: '100%', height: '100%' }}
                >
                  <Panel
                    id="editor-area"
                    minSize={30}
                    style={{
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      paddingBottom: bottomActiveId ? 3 : 0,
                    }}
                  >
                    <div className="workbench-island-card" style={{ height: '100%', width: '100%' }}>
                      {children || <EditorArea {...(db ? { db } : {})} />}
                    </div>
                  </Panel>

                  {bottomActiveId && (
                    <>
                      <PanelResizeHandle
                        style={{
                          height: 6,
                          background: 'transparent',
                          cursor: 'row-resize',
                        }}
                      />
                      <Panel
                        id="bottom-panel"
                        defaultSize={bottomPanelSize}
                        minSize={15}
                        maxSize={60}
                        onResize={(size) => setPanelSize('bottom', size)}
                        style={{
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          paddingTop: 3,
                        }}
                      >
                        <div className="workbench-island-card" style={{ height: '100%', width: '100%' }}>
                          {bottomPanelContent || <BottomToolWindow {...(db ? { db } : {})} />}
                        </div>
                      </Panel>
                    </>
                  )}
                </PanelGroup>
              </Panel>

              {/* Right Docked Panel */}
              {rightActiveId && (
                <>
                  <PanelResizeHandle
                    style={{
                      width: 6,
                      background: 'transparent',
                      cursor: 'col-resize',
                    }}
                  />
                  <Panel
                    id="right-panel"
                    defaultSize={rightPanelSize}
                    minSize={12}
                    maxSize={40}
                    onResize={(size) => setPanelSize('right', size)}
                    style={{
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      paddingLeft: 3,
                    }}
                  >
                    <div className="workbench-island-card" style={{ height: '100%', width: '100%' }}>
                      {rightPanelContent || <RightToolWindow title={rightActiveId.toUpperCase()} />}
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </div>

          {/* Right Stripe */}
          <Stripe slot="right" items={DEFAULT_RIGHT_ITEMS} />
        </div>

        {/* Bottom Stripe (Tool windows shortcut strip above status bar) */}
        <Stripe slot="bottom" items={DEFAULT_BOTTOM_ITEMS} />

        {/* Bottom Status Bar */}
        <StatusBar />

        {/* Search Everywhere Floating Modal */}
        <SearchEverywhereModal
          open={searchModalOpen}
          onClose={() => setSearchModalOpen(false)}
          {...(db ? { db } : {})}
        />
      </div>
    </AntdThemeAdapter>
  );
}
