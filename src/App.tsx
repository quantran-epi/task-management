import React, { useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import { initializeDatabaseDefaults } from './db/seeds';
import { AppShell } from './components/shell/AppShell';
import { EmptyState } from './components/common/EmptyState';
import { useHashRoute } from './hooks/useHashRoute';
import { useThemeMode } from './hooks/useThemeMode';
import { TasksView } from './views/TasksView';
import { ProjectsView } from './views/ProjectsView';
import { PlannerView } from './views/PlannerView';
import { SettingsView } from './views/SettingsView';

const { defaultAlgorithm, darkAlgorithm } = theme;

export const App: React.FC = () => {
  const { route, navigate } = useHashRoute('tasks');
  const isDark = useThemeMode();

  useEffect(() => {
    initializeDatabaseDefaults().catch((err) => {
      console.error('Failed to initialize database defaults:', err);
    });
  }, []);

  const renderContent = () => {
    switch (route) {
      case 'tasks':
        return <TasksView />;
      case 'projects':
        return <ProjectsView />;
      case 'planner':
        return <PlannerView />;
      case 'settings':
        return <SettingsView onNavigate={navigate} />;
      default:
        return <EmptyState />;
    }
  };

  return (
    <ConfigProvider
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
