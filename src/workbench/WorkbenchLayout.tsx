import React from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { AntdThemeAdapter } from './AntdThemeAdapter';
import { TitleBar } from './TitleBar';
import { Stripe, type ToolWindowItem } from './toolwindows/Stripe';
import { StatusBar } from './StatusBar';
import { useLayoutStore } from './store/layoutStore';
import {
  ProjectOutlined,
  CheckSquareOutlined,
  CommentOutlined,
  FileTextOutlined,
  CalendarOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import '../styles/workbench-tokens.css';

export interface WorkbenchLayoutProps {
  children?: React.ReactNode;
  leftPanelContent?: React.ReactNode;
  rightPanelContent?: React.ReactNode;
  bottomPanelContent?: React.ReactNode;
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string | null) => void;
  onOpenSearch?: () => void;
}

const DEFAULT_LEFT_ITEMS: ToolWindowItem[] = [
  { id: 'projects', name: 'Projects', icon: <ProjectOutlined />, shortcut: 'Alt+1' },
  { id: 'tasks', name: 'Tasks', icon: <CheckSquareOutlined />, shortcut: 'Alt+2' },
];

const DEFAULT_RIGHT_ITEMS: ToolWindowItem[] = [
  { id: 'calendar', name: 'Calendar', icon: <CalendarOutlined />, shortcut: 'Alt+5' },
];

const DEFAULT_BOTTOM_ITEMS: ToolWindowItem[] = [
  { id: 'ai_chat', name: 'AI Chat', icon: <CommentOutlined />, shortcut: 'Alt+3' },
  { id: 'docs', name: 'Docs', icon: <FileTextOutlined />, shortcut: 'Alt+4' },
  { id: 'logs', name: 'Logs', icon: <CodeOutlined /> },
];

export function WorkbenchLayout({
  children,
  leftPanelContent,
  rightPanelContent,
  bottomPanelContent,
  selectedProjectId,
  onSelectProject,
  onOpenSearch,
}: WorkbenchLayoutProps) {
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
        className="workbench-root"
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          background: 'var(--bg-app, #ffffff)',
          color: 'var(--fg, #000000)',
          fontFamily: 'var(--font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
          fontSize: 'var(--font-size-ui, 12.5px)',
        }}
      >
        {/* Top Title Bar */}
        <TitleBar
          selectedProjectId={selectedProjectId}
          onSelectProject={onSelectProject}
          onOpenSearch={onOpenSearch}
        />

        {/* Middle Body with Stripes and Splitters */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          {/* Left Stripe */}
          <Stripe slot="left" items={DEFAULT_LEFT_ITEMS} />

          {/* Master Resizable Panel Group (Horizontal: Left Panel | Center Column | Right Panel) */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
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
                      background: 'var(--bg-island, #f7f8f9)',
                      overflow: 'auto',
                    }}
                  >
                    {leftPanelContent || (
                      <div style={{ padding: 12, color: 'var(--fg-secondary, #5f6269)' }}>
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>{leftActiveId.toUpperCase()}</div>
                        <div>Tool window content placeholder</div>
                      </div>
                    )}
                  </Panel>
                  <PanelResizeHandle
                    style={{
                      width: 3,
                      background: 'var(--border, #e9eaee)',
                      cursor: 'col-resize',
                      transition: 'background 0.15s ease',
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
                  <Panel id="editor-area" minSize={30} style={{ overflow: 'auto', background: 'var(--bg-app, #ffffff)' }}>
                    {children || (
                      <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted, #6c707e)' }}>
                        <h3>No Tool Window Open</h3>
                        <p>Press Double Shift to search everywhere, or press Alt+1 through Alt+5 to open tool windows.</p>
                      </div>
                    )}
                  </Panel>

                  {bottomActiveId && (
                    <>
                      <PanelResizeHandle
                        style={{
                          height: 3,
                          background: 'var(--border, #e9eaee)',
                          cursor: 'row-resize',
                          transition: 'background 0.15s ease',
                        }}
                      />
                      <Panel
                        id="bottom-panel"
                        defaultSize={bottomPanelSize}
                        minSize={15}
                        maxSize={60}
                        onResize={(size) => setPanelSize('bottom', size)}
                        style={{
                          background: 'var(--bg-island, #f7f8f9)',
                          overflow: 'auto',
                        }}
                      >
                        {bottomPanelContent || (
                          <div style={{ padding: 12, color: 'var(--fg-secondary, #5f6269)' }}>
                            <div style={{ fontWeight: 600, marginBottom: 8 }}>{bottomActiveId.toUpperCase()}</div>
                            <div>Bottom tool window content placeholder</div>
                          </div>
                        )}
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
                      width: 3,
                      background: 'var(--border, #e9eaee)',
                      cursor: 'col-resize',
                      transition: 'background 0.15s ease',
                    }}
                  />
                  <Panel
                    id="right-panel"
                    defaultSize={rightPanelSize}
                    minSize={12}
                    maxSize={40}
                    onResize={(size) => setPanelSize('right', size)}
                    style={{
                      background: 'var(--bg-island, #f7f8f9)',
                      overflow: 'auto',
                    }}
                  >
                    {rightPanelContent || (
                      <div style={{ padding: 12, color: 'var(--fg-secondary, #5f6269)' }}>
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>{rightActiveId.toUpperCase()}</div>
                        <div>Right tool window content placeholder</div>
                      </div>
                    )}
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
      </div>
    </AntdThemeAdapter>
  );
}
