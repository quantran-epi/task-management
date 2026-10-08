import React, { useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import viVN from 'antd/locale/vi_VN';
import './utils/date';
import { initializeDatabaseDefaults } from './db/seeds';
import { checkAndRequestStoragePersistence } from './services/storage/storagePersistence';
import { AppShell } from './components/shell/AppShell';
import { EmptyState } from './components/common/EmptyState';
import { useHashRoute } from './hooks/useHashRoute';
import { useThemeMode } from './hooks/useThemeMode';
import { TasksView } from './views/TasksView';
import { ProjectsView } from './views/ProjectsView';
import { PlannerView } from './views/PlannerView';
import { AnalyticsView } from './views/AnalyticsView';
import { SettingsView } from './views/SettingsView';
import { DashboardView } from './views/DashboardView';
import { NotesView } from './views/NotesView';
import { NotesPopoutView } from './views/NotesPopoutView';
import { TimerPopoutView } from './views/TimerPopoutView';
import { AIPopoutView } from './views/AIPopoutView';
import { ItemInsightView } from './views/ItemInsightView';
import { AgentControlView } from './views/AgentControlView';
import { TimerProvider } from './context/TimerContext';

const { defaultAlgorithm, darkAlgorithm } = theme;

const themeTokens = {
  colorPrimary: '#4f46e5',
  colorPrimaryHover: '#4338ca',
  colorPrimaryActive: '#3730a3',
  borderRadius: 8,
  controlHeight: 36,
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

export const App: React.FC = () => {
  const { route, params, navigate } = useHashRoute('dashboard');
  const isDark = useThemeMode();

  useEffect(() => {
    initializeDatabaseDefaults().catch((err) => {
      console.error('Failed to initialize database defaults:', err);
    });
    checkAndRequestStoragePersistence().catch((err) => {
      console.warn('Storage persistence auto-request failed on boot:', err);
    });
  }, []);

  const renderContent = () => {
    switch (route) {
      case 'dashboard':
        return <DashboardView onNavigate={navigate} />;
      case 'tasks':
        return <TasksView onNavigate={navigate} />;
      case 'projects':
        return <ProjectsView />;
      case 'planner':
        return <PlannerView targetDate={params.date} />;
      case 'analytics':
        return <AnalyticsView />;
      case 'notes':
        return <NotesView />;
      case 'settings': {
        const validTabs = ['capacity', 'data', 'jira', 'notifications', 'ai'] as const;
        const selectedTab = validTabs.includes(params.tab as any)
          ? (params.tab as 'capacity' | 'data' | 'jira' | 'notifications' | 'ai')
          : undefined;
        return <SettingsView onNavigate={navigate} defaultActiveTab={selectedTab} />;
      }
      case 'agents':
        return <AgentControlView />;
      case 'insight': {
        const validTypes = ['task', 'project', 'milestone'] as const;
        const itemType = validTypes.includes(params.type as any)
          ? (params.type as 'task' | 'project' | 'milestone')
          : 'task';
        return (
          <ItemInsightView
            itemType={itemType}
            itemId={params.id || ''}
            onNavigate={navigate}
          />
        );
      }
      default:
        return <EmptyState />;
    }
  };

  if (route === 'timer-popout') {
    return (
      <ConfigProvider
        locale={viVN}
        theme={{
          algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
          token: {
            ...themeTokens,
            ...(isDark ? {} : {
              colorBgLayout: '#f8fafc',
              boxShadowSecondary: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              wireframe: false,
            }),
          },
        }}
      >
        <TimerProvider>
          <TimerPopoutView />
        </TimerProvider>
      </ConfigProvider>
    );
  }

  if (route === 'notes-popout') {
    return (
      <ConfigProvider
        locale={viVN}
        theme={{
          algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
          token: {
            ...themeTokens,
            ...(isDark ? {} : {
              colorBgLayout: '#f8fafc',
              boxShadowSecondary: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              wireframe: false,
            }),
          },
        }}
      >
        <NotesPopoutView />
      </ConfigProvider>
    );
  }

  if (route === 'ai-popout') {
    return (
      <ConfigProvider
        locale={viVN}
        theme={{
          algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
          token: {
            ...themeTokens,
            ...(isDark ? {} : {
              colorBgLayout: '#f8fafc',
              boxShadowSecondary: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              wireframe: false,
            }),
          },
        }}
      >
        <AIPopoutView />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
        token: {
          ...themeTokens,
          ...(isDark ? {} : {
            colorBgLayout: '#f8fafc',
            boxShadowSecondary: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            wireframe: false,
          }),
        },
      }}
    >
      <AppShell currentRoute={route} onNavigate={navigate} isDark={isDark}>
        {renderContent()}
      </AppShell>
    </ConfigProvider>
  );
};

export default App;
