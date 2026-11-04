import React from 'react';
import { CloseOutlined, InboxOutlined } from '@ant-design/icons';
import { AntdThemeAdapter } from './AntdThemeAdapter';
import { useLayoutStore, type EditorTab } from './store/layoutStore';
import { TasksView } from '../views/TasksView';
import { NotesView } from '../views/NotesView';
import { PlannerView } from '../views/PlannerView';
import { AnalyticsView } from '../views/AnalyticsView';
import { SettingsView } from '../views/SettingsView';
import { ProjectsView } from '../views/ProjectsView';
import type { TaskPlannerDatabase } from '../db';

export interface EditorAreaProps {
  db?: TaskPlannerDatabase;
}

export function EditorArea({ db }: EditorAreaProps) {
  const openTabs = useLayoutStore((state) => state.openTabs);
  const activeTabId = useLayoutStore((state) => state.activeTabId);
  const setActiveTabId = useLayoutStore((state) => state.setActiveTabId);
  const closeTab = useLayoutStore((state) => state.closeTab);

  const activeTab = openTabs.find((tab) => tab.id === activeTabId) || openTabs[0];

  const renderViewContent = (tab: EditorTab) => {
    switch (tab.viewType) {
      case 'tasks':
        return <TasksView db={db} />;
      case 'notes':
        return <NotesView db={db} initialDocId={tab.params?.doc} />;
      case 'planner':
        return <PlannerView db={db} targetDate={tab.params?.date} />;
      case 'analytics':
        return <AnalyticsView db={db} />;
      case 'settings':
        return <SettingsView db={db} />;
      case 'projects':
        return <ProjectsView db={db} />;
      default:
        return <TasksView db={db} />;
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
          alignItems: 'stretch',
          height: 'var(--tabbar-height, 32px)',
          minHeight: 'var(--tabbar-height, 32px)',
          background: 'var(--bg-elev, #f7f8f9)',
          borderBottom: '1px solid var(--border, #e9eaee)',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
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
                padding: '0 10px',
                height: '100%',
                background: isActive ? 'var(--bg-app, #ffffff)' : 'transparent',
                borderRight: '1px solid var(--border, #e9eaee)',
                borderBottom: isActive ? '2px solid var(--accent, #3871e1)' : '2px solid transparent',
                color: isActive ? 'var(--fg, #000000)' : 'var(--fg-secondary, #5f6269)',
                fontWeight: isActive ? 600 : 400,
                fontSize: 'var(--font-size-ui, 12.5px)',
                cursor: 'pointer',
                userSelect: 'none',
                position: 'relative',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
                transition: 'background 0.1s ease',
              }}
            >
              <span style={{ marginRight: tab.closable !== false ? 6 : 0 }}>{tab.title}</span>

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
                    borderRadius: 2,
                    cursor: 'pointer',
                    color: 'var(--fg-muted, #6c707e)',
                    lineHeight: 1,
                  }}
                >
                  <CloseOutlined style={{ fontSize: 10 }} />
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
          overflow: 'auto',
          position: 'relative',
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
