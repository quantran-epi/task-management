import React, { useEffect } from 'react';
import { ConfigProvider, theme, Card, Typography, Descriptions } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { initializeDatabaseDefaults } from './db/seeds';
import { AppShell } from './components/shell/AppShell';
import { EmptyState } from './components/common/EmptyState';
import { useHashRoute } from './hooks/useHashRoute';
import { useThemeMode } from './hooks/useThemeMode';

const { defaultAlgorithm, darkAlgorithm } = theme;
const { Paragraph } = Typography;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const App: React.FC = () => {
  const { route, navigate } = useHashRoute('tasks');
  const isDark = useThemeMode();

  useEffect(() => {
    initializeDatabaseDefaults().catch((err) => {
      console.error('Failed to initialize database defaults:', err);
    });
  }, []);

  const capacityRules = useLiveQuery(() => db.capacityRules.toArray(), []) ?? [];

  const renderContent = () => {
    switch (route) {
      case 'planner':
      case 'tasks':
        return (
          <div style={{ maxWidth: 800 }}>
            <Card title={`${route === 'planner' ? 'Workload Planner' : 'Tasks'} - Capacity Rules`}>
              <Paragraph>Default weekly capacity allocation queried reactively from IndexedDB:</Paragraph>
              <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
                {capacityRules.map((rule) => (
                  <Descriptions.Item key={rule.id} label={DAY_NAMES[rule.dayOfWeek] ?? `Day ${rule.dayOfWeek}`}>
                    {rule.workMinutes} mins ({rule.workMinutes / 60}h)
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </Card>
          </div>
        );
      case 'projects':
        return <EmptyState heading="Projects" body="No projects created yet. Add your first project to begin." />;
      case 'settings':
        return <EmptyState heading="Settings" body="Application preferences and database management." />;
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
      <AppShell currentRoute={route} onNavigate={navigate}>
        {renderContent()}
      </AppShell>
    </ConfigProvider>
  );
};

export default App;
