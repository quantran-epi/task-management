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
import { SettingsView } from './views/SettingsView';
import { DashboardView } from './views/DashboardView';
import { AnalyticsView } from './views/AnalyticsView';

const { defaultAlgorithm, darkAlgorithm } = theme;

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
        return <TasksView />;
      case 'projects':
        return <ProjectsView onNavigate={navigate} />;
      case 'planner':
        return <PlannerView targetDate={params.date} />;
      case 'analytics':
        return <AnalyticsView initialMilestoneId={params.milestoneId} onNavigate={navigate} />;
      case 'settings':
        return <SettingsView onNavigate={navigate} />;
      default:
        return <EmptyState />;
    }
  };

  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
