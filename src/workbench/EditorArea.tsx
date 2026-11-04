import { CloseOutlined, InboxOutlined } from '@ant-design/icons';
import { AntdThemeAdapter } from './AntdThemeAdapter';
import { useLayoutStore, type EditorTab } from './store/layoutStore';
import { TasksView } from '../views/TasksView';
import { NotesView } from '../views/NotesView';
import { PlannerView } from '../views/PlannerView';
import { AnalyticsView } from '../views/AnalyticsView';
import { SettingsView } from '../views/SettingsView';
import { ProjectsView } from '../views/ProjectsView';
import { DashboardView } from '../views/DashboardView';
import { AgentControlView } from '../views/AgentControlView';
import { TelegramMonitorView } from '../views/TelegramMonitorView';
import { ItemInsightView } from '../views/ItemInsightView';
import { ProjectSdlcView } from '../views/ProjectSdlcView';
import type { TaskPlannerDatabase } from '../db';

export interface EditorAreaProps {
  db?: TaskPlannerDatabase | undefined;
}

export function EditorArea({ db }: EditorAreaProps) {
  const openTabs = useLayoutStore((state) => state.openTabs);
  const activeTabId = useLayoutStore((state) => state.activeTabId);
  const setActiveTabId = useLayoutStore((state) => state.setActiveTabId);
  const closeTab = useLayoutStore((state) => state.closeTab);
  const openTab = useLayoutStore((state) => state.openTab);

  const activeTab = openTabs.find((tab) => tab.id === activeTabId) || openTabs[0];

  const dbProp = db ? { db } : {};

  const renderViewContent = (tab: EditorTab) => {
    switch (tab.viewType) {
      case 'tasks':
        return <TasksView {...dbProp} />;
      case 'notes':
        return <NotesView {...dbProp} initialDocId={tab.params?.doc} hideFolderTree={true} />;
      case 'planner':
        return <PlannerView {...dbProp} targetDate={tab.params?.date} />;
      case 'analytics':
        return <AnalyticsView {...dbProp} />;
      case 'settings':
        return <SettingsView {...dbProp} />;
      case 'projects':
        return <ProjectsView {...dbProp} />;
      case 'dashboard':
        return <DashboardView onNavigate={(route) => openTab({ id: route, title: route.toUpperCase(), viewType: route as any })} />;
      case 'agents':
        return <AgentControlView />;
      case 'telegram':
        return <TelegramMonitorView />;
      case 'sdlc':
        return (
          <ProjectSdlcView
            projectId={tab.params?.projectId || ''}
            onBack={() => closeTab(tab.id)}
            {...dbProp}
          />
        );
      case 'insight':
        return (
          <ItemInsightView
            itemType={tab.params?.itemType || 'task'}
            itemId={tab.params?.itemId || ''}
            onNavigate={(route, params) => {
              const titles: Record<string, string> = {
                dashboard: 'Dashboard',
                tasks: 'Tasks',
                projects: 'Projects',
                planner: 'Planner',
                analytics: 'Analytics',
                notes: 'Docs',
                settings: 'Settings',
                agents: 'Ghost Dev',
                telegram: 'Telegram',
              };
              const tabId = params?.doc
                ? `doc-${params.doc}`
                : params?.project
                ? `project-${params.project}`
                : route;
              openTab({
                id: tabId,
                title: titles[route] || route,
                viewType: route as any,
                ...(params ? { params } : {}),
              });
            }}
            {...dbProp}
          />
        );
      default:
        return <TasksView {...dbProp} />;
    }
  };

  return (
    <div
      className="workbench-editor-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-app, #ffffff)',
      }}
    >
      {/* Editor Tab Bar */}
      <div
        role="tablist"
        aria-label="Editor tabs"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          height: 'var(--tabbar-height, 36px)',
          minHeight: 'var(--tabbar-height, 36px)',
          background: 'var(--bg-elev, #f7f8fa)',
          borderBottom: '1px solid var(--border-strong, #d1d3d9)',
          padding: '0 8px',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          gap: 3,
        }}
      >
        {openTabs.map((tab) => {
          const isActive = tab.id === activeTab?.id;

          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => setActiveTabId(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setActiveTabId(tab.id);
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0 14px',
                height: 32,
                background: isActive ? 'var(--bg-island, #ffffff)' : 'transparent',
                borderRadius: '6px 6px 0 0',
                borderTop: isActive ? '1px solid var(--border-strong, #d1d3d9)' : '1px solid transparent',
                borderLeft: isActive ? '1px solid var(--border-strong, #d1d3d9)' : '1px solid transparent',
                borderRight: isActive ? '1px solid var(--border-strong, #d1d3d9)' : '1px solid transparent',
                borderBottom: isActive ? '1px solid var(--bg-island, #ffffff)' : '1px solid transparent',
                marginBottom: isActive ? -1 : 0,
                color: isActive ? 'var(--fg-strong, #000000)' : 'var(--fg-secondary, #5f6269)',
                fontWeight: isActive ? 600 : 400,
                fontSize: 'var(--font-size-ui, 13.5px)',
                cursor: 'pointer',
                userSelect: 'none',
                position: 'relative',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ marginRight: tab.closable !== false ? 8 : 0 }}>{tab.title}</span>

              {tab.closable !== false && (
                <button
                  type="button"
                  aria-label={`Close ${tab.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    padding: 2,
                    borderRadius: 3,
                    cursor: 'pointer',
                    color: 'var(--fg-muted, #6c707e)',
                    lineHeight: 1,
                  }}
                >
                  <CloseOutlined style={{ fontSize: 11 }} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Active Tab View Body inside AntdThemeAdapter */}
      <div
        className="workbench-editor-body"
        style={{
          flex: 1,
          minHeight: 0,
          height: '100%',
          overflow: activeTab?.viewType === 'notes' ? 'hidden' : 'auto',
          position: 'relative',
          padding: activeTab?.viewType === 'notes' ? 0 : '16px 20px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <AntdThemeAdapter>
          {activeTab ? (
            renderViewContent(activeTab)
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--fg-muted, #6c707e)',
              }}
            >
              <InboxOutlined style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg, #000000)' }}>
                No Tool Window Open
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Press Double Shift to search everywhere, or press Alt+1 through Alt+5 to open tool windows.
              </div>
            </div>
          )}
        </AntdThemeAdapter>
      </div>
    </div>
  );
}
