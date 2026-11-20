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
import { useGhostDevSessions } from './hooks/useGhostDevSessions';
import { useGhostDevNotifications } from './hooks/useGhostDevNotifications';
import { TasksView } from './views/TasksView';
import { PlannerView } from './views/PlannerView';
import { AnalyticsView } from './views/AnalyticsView';
import { SettingsView } from './views/SettingsView';
import { ConfigProfilesView } from './views/ConfigProfilesView';
import { DashboardView } from './views/DashboardView';
import { NotesView } from './views/NotesView';
import { NotesPopoutView } from './views/NotesPopoutView';
import { TimerPopoutView } from './views/TimerPopoutView';
import { AIPopoutView } from './views/AIPopoutView';
import { CodingZonePopoutView } from './views/CodingZonePopoutView';
import { ItemInsightView } from './views/ItemInsightView';
import { TeamWorkspaceView } from './views/TeamWorkspaceView';
import { TelegramMonitorView } from './views/TelegramMonitorView';
import { MermaidAssistantView } from './views/MermaidAssistantView';
import { TimerProvider } from './context/TimerContext';
import { AIChatProvider } from './context/AIChatContext';
import { KnowledgeConfigProvider } from './services/knowledge/knowledgeConfig';
import { startNotificationDeepLinkListener } from './utils/notificationDeepLink';
import { attachGlobalToolTaskListener } from './components/ai/runtime/toolTaskStore';
import { isTauriApp } from './utils/timerPopout';

const { defaultAlgorithm, darkAlgorithm } = theme;

const themeTokens = {
  colorPrimary: '#5b4fe8',
  colorPrimaryHover: '#4f40dc',
  colorPrimaryActive: '#4333c8',
  colorInfo: '#22d3ee',
  borderRadius: 8,
  controlHeight: 36,
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

const getAppTheme = (isDark: boolean) => ({
  algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
  token: {
    ...themeTokens,
    ...(isDark
      ? {
          colorBgBase: '#0a0d14',
          colorBgLayout: '#0d1018',
        }
      : {
          colorBgLayout: '#f8fafc',
          boxShadowSecondary: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          wireframe: false,
        }),
  },
});

export const App: React.FC = () => {
  const { route, params, navigate } = useHashRoute('dashboard');
  const isDark = useThemeMode();
  // Ghost-dev sessions outlive the retired agents page. Mount their OS notifications at the
  // app root so both the default shell and the IntelliJ/Tauri workbench receive them.
  const { sessions: ghostDevSessions } = useGhostDevSessions();
  useGhostDevNotifications(ghostDevSessions);

  useEffect(() => {
    initializeDatabaseDefaults().catch((err) => {
      console.error('Failed to initialize database defaults:', err);
    });
    checkAndRequestStoragePersistence().catch((err) => {
      console.warn('Storage persistence auto-request failed on boot:', err);
    });
    // Clicking an OS notification focuses the window and navigates to its target page.
    const stopDeepLinks = startNotificationDeepLinkListener();

    // ONE global tool-task listener for the whole app lifetime — it must not live in a
    // chat tab, otherwise closing the tab would stop observing still-running tasks.
    let stopToolTasks: (() => void) | undefined;
    let cancelled = false;
    if (isTauriApp()) {
      void import('@tauri-apps/api/event').then(async ({ listen }) => {
        if (cancelled) return;
        const detach = await attachGlobalToolTaskListener(listen);
        if (cancelled) detach();
        else stopToolTasks = detach;
      });
    }
    return () => {
      cancelled = true;
      stopDeepLinks();
      // Detach only on real app teardown; drawer/tab unmounts never reach App's cleanup.
      stopToolTasks?.();
    };
  }, []);

  const renderContent = () => {
    switch (route) {
      case 'dashboard':
        return <DashboardView onNavigate={navigate} />;
      case 'tasks':
        return <TasksView />;
      case 'planner':
        return <PlannerView targetDate={params.date} />;
      case 'analytics':
        return <AnalyticsView />;
      case 'notes':
        return <NotesView initialDocId={params.doc} />;
      case 'settings': {
        const validTabs = ['capacity', 'data', 'jira', 'notifications', 'ai', 'ssh'] as const;
        const selectedTab = validTabs.includes(params.tab as any)
          ? (params.tab as 'capacity' | 'data' | 'jira' | 'notifications' | 'ai' | 'ssh')
          : undefined;
        return <SettingsView onNavigate={navigate} defaultActiveTab={selectedTab} />;
      }
      case 'config-profiles':
        return <ConfigProfilesView onNavigate={navigate} />;
      case 'team':
        return (
          <TeamWorkspaceView
            teamId={params.teamId || ''}
            targetMessageId={params.messageId || undefined}
          />
        );
      case 'telegram':
        return <TelegramMonitorView />;
      case 'mermaid':
        return <MermaidAssistantView initialCode={params.code} />;
      case 'insight': {
        const validTypes = ['task', 'cr', 'system'] as const;
        const itemType = validTypes.includes(params.type as any)
          ? (params.type as 'task' | 'cr' | 'system')
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
        theme={getAppTheme(isDark)}
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
        theme={getAppTheme(isDark)}
      >
        <NotesPopoutView />
      </ConfigProvider>
    );
  }

  if (route === 'ai-popout') {
    return (
      <ConfigProvider
        locale={viVN}
        theme={getAppTheme(isDark)}
      >
        <AIChatProvider>
          <AIPopoutView />
        </AIChatProvider>
      </ConfigProvider>
    );
  }

  if (route === 'coding-zone-popout') {
    return (
      <ConfigProvider
        locale={viVN}
        theme={getAppTheme(isDark)}
      >
        <CodingZonePopoutView />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider
      locale={viVN}
      theme={getAppTheme(isDark)}
    >
      <KnowledgeConfigProvider>
        <AppShell currentRoute={route} onNavigate={navigate} isDark={isDark}>
          {renderContent()}
        </AppShell>
      </KnowledgeConfigProvider>
    </ConfigProvider>
  );
};

export default App;
