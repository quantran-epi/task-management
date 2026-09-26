import React, { useState } from 'react';
import { Layout, Drawer, Grid, Button, Typography, Space, theme } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { Navigation } from './Navigation';
import { StatusBadge } from './StatusBadge';
import { UpgradeModal } from './UpgradeModal';
import { ResetDbModal } from '../common/ResetDbModal';
import type { AppRoute } from '../../types/navigation';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;
const { Title } = Typography;

export interface AppShellProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  children: React.ReactNode;
  isDark?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({ currentRoute, onNavigate, children, isDark: explicitDark }) => {
  const screens = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const { token } = theme.useToken();

  // Prefer explicit prop if provided, else check token brightness/property
  const isDark = explicitDark ?? false;

  // md breakpoint is 768px. Mobile when screens.md is false. Default to desktop when screens.md is true or uninitialized in test/SSR.
  const isMobile = screens.md === false;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile ? (
        <Sider collapsible breakpoint="lg" theme={isDark ? 'dark' : 'light'}>
          <div style={{ padding: '16px', fontWeight: 600, fontSize: 16 }}>Menu</div>
          <Navigation currentRoute={currentRoute} onNavigate={onNavigate} />
        </Sider>
      ) : (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{ body: { padding: 0 } }}
          title="Menu"
        >
          <Navigation
            currentRoute={currentRoute}
            onNavigate={(route) => {
              onNavigate(route);
              setDrawerOpen(false);
            }}
          />
        </Drawer>
      )}

      <Layout>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Space>
            {isMobile && (
              <Button
                icon={<MenuOutlined />}
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                style={{ minHeight: 44, minWidth: 44 }}
              />
            )}
            <Title level={4} style={{ margin: 0 }}>
              Task Planner
            </Title>
          </Space>
          <Space size="middle">
            <StatusBadge />
            <Button onClick={() => setResetModalOpen(true)} danger size="small">
              Reset DB
            </Button>
          </Space>
        </Header>

        <Content style={{ margin: 16 }}>{children}</Content>
      </Layout>

      <UpgradeModal />
      <ResetDbModal open={resetModalOpen} onClose={() => setResetModalOpen(false)} />
    </Layout>
  );
};
