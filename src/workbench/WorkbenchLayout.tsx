import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PanelGroup, Panel } from 'react-resizable-panels';
import { AntdThemeAdapter } from './AntdThemeAdapter';
import { TitleBar } from './TitleBar';
import { Stripe, type ToolWindowItem } from './toolwindows/Stripe';
import { StatusBar } from './StatusBar';
import { EditorArea } from './EditorArea';
import { LeftToolWindow } from './toolwindows/LeftToolWindow';
import { RightToolWindow } from './toolwindows/RightToolWindow';
import { BottomToolWindow } from './toolwindows/BottomToolWindow';
import { WorkbenchResizeHandle } from './WorkbenchResizeHandle';
import { useLayoutStore } from './store/layoutStore';
import { useGlobalKeymap } from './hooks/useGlobalKeymap';
import { useDoubleShift } from './hooks/useDoubleShift';
import { SearchEverywhereModal } from './search/SearchEverywhereModal';
import { useNotifications } from '../hooks/useNotifications';
import { useAIChat } from '../context/AIChatContext';
import { InlineAISelectionBar } from '../components/ai/InlineAISelectionBar';
import { GlobalDiagramViewer } from '../components/common/GlobalDiagramViewer';
import type { TaskPlannerDatabase } from '../db';
import {
  JetBrainsProjectIcon,
  JetBrainsDocsIcon,
  JetBrainsDiagramIcon,
  JetBrainsAIIcon,
  JetBrainsNotificationIcon,
} from '../components/icons/JetBrainsIcons';
import { CloudServerOutlined, ApartmentOutlined } from '@ant-design/icons';
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
  { id: 'projects', name: 'CR Explorer', icon: <JetBrainsProjectIcon size={16} />, shortcut: 'Alt+1' },
  { id: 'docs', name: 'Docs Explorer', icon: <JetBrainsDocsIcon size={16} />, shortcut: 'Alt+2' },
  { id: 'diagrams', name: 'Diagram Explorer', icon: <JetBrainsDiagramIcon size={16} />, shortcut: 'Alt+5' },
  {
    id: 'systems',
    name: 'Systems Explorer',
    icon: <ApartmentOutlined style={{ fontSize: 13, color: '#722ed1' }} />,
    shortcut: 'Alt+6',
  },
  {
    id: 'remote_explorer',
    name: 'Remote Git Explorer',
    icon: <CloudServerOutlined style={{ fontSize: 13, color: '#f59e0b' }} />,
    shortcut: 'Alt+4',
  },
];

export function WorkbenchLayout({
  children,
  leftPanelContent,
  rightPanelContent,
  bottomPanelContent,
  onSelectProject,
  onOpenSearch,
  onOpenSettings,
  db,
}: WorkbenchLayoutProps) {
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const notifications = useNotifications(db);

  const rightItems = useMemo<ToolWindowItem[]>(() => {
    return [
      { id: 'ai_chat', name: 'AI Assistant', icon: <JetBrainsAIIcon size={16} />, shortcut: 'Alt+3' },
      {
        id: 'notifications',
        name: 'Notifications',
        icon: <JetBrainsNotificationIcon size={16} />,
        shortcut: 'Alt+4',
        badge: notifications.activeCount,
      },
    ];
  }, [notifications.activeCount]);

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
  const setToolWindowActive = useLayoutStore((s) => s.setToolWindowActive);
  const openTab = useLayoutStore((s) => s.openTab);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const openTabs = useLayoutStore((s) => s.openTabs);

  const { isOpen: isAIChatOpen } = useAIChat();

  useEffect(() => {
    const handleOpenMermaidStudio = (e: Event) => {
      const customEvent = e as CustomEvent<{ code?: string }>;
      openTab({
        id: 'mermaid',
        title: 'Diagram Studio',
        viewType: 'mermaid',
        closable: true,
        ...(customEvent.detail?.code ? { params: { code: customEvent.detail.code } } : {}),
      });
    };
    window.addEventListener('taskmate:open-mermaid-studio', handleOpenMermaidStudio);
    return () => {
      window.removeEventListener('taskmate:open-mermaid-studio', handleOpenMermaidStudio);
    };
  }, [openTab]);

  // Sync AIChatContext.isOpen with layoutStore rightActiveId
  useEffect(() => {
    if (isAIChatOpen && rightActiveId !== 'ai_chat') {
      setToolWindowActive('right', 'ai_chat');
    }
  }, [isAIChatOpen, rightActiveId, setToolWindowActive]);

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const leftPanelSize = useLayoutStore((s) => s.leftPanelSize);
  const rightPanelSize = useLayoutStore((s) => s.rightPanelSize);
  const bottomPanelSize = useLayoutStore((s) => s.bottomPanelSize);
  const isBottomMaximized = useLayoutStore((s) => s.isBottomMaximized);
  const setPanelSize = useLayoutStore((s) => s.setPanelSize);

  const handleOpenSettingsTab = useCallback(() => {
    openTab({
      id: 'settings',
      title: 'Settings',
      viewType: 'settings',
      closable: true,
    });
    onOpenSettings?.();
  }, [openTab, onOpenSettings]);

  const handleOpenView = useCallback(
    (viewKey: string) => {
      const titles: Record<string, string> = {
        dashboard: 'Dashboard',
        planner: 'Capacity Planner',
        analytics: 'Analytics',
        tasks: 'Tasks',
        notes: 'Docs',
        projects: 'Projects',
        agents: 'Ghost Dev Agents',
        telegram: 'Telegram Bot',
        mermaid: 'Diagram Studio',
        sdlc: 'SDLC Studio',
        systems: 'System Catalog',
      };
      openTab({
        id: viewKey,
        title: titles[viewKey] || viewKey,
        viewType: viewKey as any,
        closable: true,
      });
    },
    [openTab]
  );

  return (
    <AntdThemeAdapter>
      <div
        className="workbench-root workbench-islands-frame"
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100vw',
          height: '100vh',
          maxHeight: '100vh',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Top Title Bar */}
        <TitleBar
          onOpenSearch={handleOpenSearchUnified}
          onOpenSettings={handleOpenSettingsTab}
          onOpenView={handleOpenView}
          activeView={activeTab?.viewType}
        />

        {/* Middle Body with Stripes and Splitters (padded for Tauri window bounds) */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden', position: 'relative', padding: '0 4px' }}>
          {/* Left Tool Window Stripe */}
          <Stripe slot="left" items={DEFAULT_LEFT_ITEMS} />

          {/* Master Resizable Panel Group (Horizontal: Left Panel | Center Editor | Right Panel) */}
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', overflow: 'hidden', padding: '0 4px 6px 4px' }}>
            <PanelGroup
              direction="horizontal"
              style={{ width: '100%', height: '100%' }}
            >
              {/* Left Docked Explorer Panel */}
              {leftActiveId && (
                <>
                  <Panel
                    id="left-panel"
                    order={1}
                    defaultSize={leftPanelSize}
                    minSize={14}
                    maxSize={45}
                    onResize={(size) => setPanelSize('left', size)}
                    style={{
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div className="workbench-island-card workbench-island-card-toolwindow" style={{ height: '100%', width: '100%' }}>
                      {leftPanelContent || (
                        <LeftToolWindow
                          {...(db ? { db } : {})}
                          {...(onSelectProject ? { onSelectProject } : {})}
                        />
                      )}
                    </div>
                  </Panel>
                  <WorkbenchResizeHandle direction="horizontal" id="left-resizer" />
                </>
              )}

              {/* Center Column: Editor Area and Bottom Tool Window */}
              <Panel id="center-column" order={2} minSize={30} style={{ position: 'relative' }}>
                <PanelGroup direction="vertical" style={{ width: '100%', height: '100%' }}>
                  <Panel
                    id="center-editor-panel"
                    order={1}
                    defaultSize={bottomActiveId ? 100 - bottomPanelSize : 100}
                    minSize={bottomActiveId ? 30 : 100}
                    style={{
                      overflow: 'hidden',
                      display: isBottomMaximized ? 'none' : 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div className="workbench-island-card workbench-island-card-center" style={{ height: '100%', width: '100%' }}>
                      {children || <EditorArea {...(db ? { db } : {})} />}
                    </div>
                  </Panel>
                  {bottomActiveId && !isBottomMaximized && (
                    <WorkbenchResizeHandle direction="vertical" id="bottom-resizer" />
                  )}
                  <Panel
                    id="bottom-panel"
                    order={2}
                    defaultSize={bottomActiveId ? bottomPanelSize : 0}
                    minSize={bottomActiveId ? 15 : 0}
                    maxSize={100}
                    onResize={(size) => {
                      if (!isBottomMaximized && bottomActiveId) setPanelSize('bottom', size);
                    }}
                    style={
                      isBottomMaximized
                        ? {
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 10,
                            display: 'flex',
                            flexDirection: 'column',
                            width: '100%',
                            height: '100%',
                            background: 'var(--bg-island, #ffffff)',
                          }
                        : {
                            overflow: 'hidden',
                            display: bottomActiveId ? 'flex' : 'none',
                            flexDirection: 'column',
                          }
                    }
                  >
                    <div className="workbench-island-card workbench-island-card-toolwindow" style={{ height: '100%', width: '100%' }}>
                      {bottomPanelContent || <BottomToolWindow db={db} />}
                    </div>
                  </Panel>
                </PanelGroup>
              </Panel>

              {/* Right Docked Tool Window (AI Assistant, Ghost Dev & Telegram) */}
              {rightActiveId && (
                <>
                  <WorkbenchResizeHandle direction="horizontal" id="right-resizer" />
                  <Panel
                    id="right-panel"
                    order={3}
                    defaultSize={rightPanelSize}
                    minSize={18}
                    maxSize={50}
                    onResize={(size) => setPanelSize('right', size)}
                    style={{
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div className="workbench-island-card workbench-island-card-toolwindow" style={{ height: '100%', width: '100%' }}>
                      {rightPanelContent || (
                        <RightToolWindow
                          {...(db ? { db } : {})}
                        />
                      )}
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </div>

          {/* Right Tool Window Stripe */}
          <Stripe slot="right" items={rightItems} />
        </div>

        {/* Bottom Status Bar */}
        <StatusBar />

        {/* Search Everywhere Floating Modal */}
        <SearchEverywhereModal
          open={searchModalOpen}
          onClose={() => setSearchModalOpen(false)}
          {...(db ? { db } : {})}
        />

        {/* Global Inline AI Selection Bar for document text selection */}
        <InlineAISelectionBar {...(db ? { db } : {})} />
        <GlobalDiagramViewer />
      </div>
    </AntdThemeAdapter>
  );
}
export default WorkbenchLayout;
