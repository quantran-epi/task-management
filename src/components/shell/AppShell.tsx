import React, { useState } from 'react';
import { Layout, Drawer, Grid, Button, Typography, Space, Badge, Tooltip, theme } from 'antd';
import { MenuOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { Navigation } from './Navigation';
import { StatusBadge } from './StatusBadge';
import { UpgradeModal } from './UpgradeModal';
import { ResetDbModal } from '../common/ResetDbModal';
import { AriaLiveRegion } from '../common/AriaLiveRegion';
import { InstallButton } from '../pwa/InstallButton';
import { UpdateBanner } from '../pwa/UpdateBanner';
import { FormGuardProvider } from '../../context/FormGuardContext';
import { ServiceWorkerProvider } from '../../context/ServiceWorkerContext';
import { GitHubAuthProvider } from '../../context/GitHubAuthContext';
import { useServiceWorkerUpdate } from '../../hooks/useServiceWorkerUpdate';
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

const AppShellInner: React.FC<AppShellProps> = ({
  currentRoute,
  onNavigate,
  children,
  isDark: explicitDark,
}) => {
  const screens = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { token } = theme.useToken();

  const { needRefresh, reloadApp } = useServiceWorkerUpdate();

  // Prefer explicit prop if provided, else check token brightness/property
  const isDark = explicitDark ?? false;

  // md breakpoint is 768px. Mobile when screens.md is false. Default to desktop when screens.md is true or uninitialized in test/SSR.
  const isMobile = screens.md === false;

  // Show banner if needRefresh is true and not dismissed by user
  const showBanner = needRefresh && !bannerDismissed;
  // Show header collapsed badge if needRefresh is true and user dismissed the banner (D-04)
  const showCollapsedBadge = needRefresh && bannerDismissed;

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
                aria-label="Mở menu"
                style={{ minHeight: 44, minWidth: 44 }}
              />
            )}
            <Title level={4} style={{ margin: 0 }}>
              Task Planner
            </Title>
          </Space>
          <Space size="middle">
            <StatusBadge />
            <InstallButton />
            {showCollapsedBadge && (
              <Tooltip title="Đã có bản cập nhật mới. Nhấn để cập nhật.">
                <Badge dot color="#1677ff">
                  <Button
                    type="text"
                    icon={<CloudDownloadOutlined style={{ fontSize: 18, color: '#1677ff' }} />}
                    onClick={() => setBannerDismissed(false)}
                    aria-label="Cập nhật ứng dụng"
                    style={{ minHeight: 32, minWidth: 32 }}
                  />
                </Badge>
              </Tooltip>
            )}
            <Button onClick={() => setResetModalOpen(true)} danger size="small">
              Đặt lại CSDL
            </Button>
          </Space>
        </Header>

        <Content style={{ margin: 16 }}>{children}</Content>
      </Layout>

      <UpgradeModal />
      <ResetDbModal open={resetModalOpen} onClose={() => setResetModalOpen(false)} />
      <AriaLiveRegion />

      <UpdateBanner
        needRefresh={showBanner}
        onUpdate={() => reloadApp(true)}
        onDismiss={() => setBannerDismissed(true)}
      />
    </Layout>
  );
};

export const AppShell: React.FC<AppShellProps> = (props) => {
  return (
    <ServiceWorkerProvider>
      <FormGuardProvider>
        <GitHubAuthProvider>
          <AppShellInner {...props} />
        </GitHubAuthProvider>
      </FormGuardProvider>
    </ServiceWorkerProvider>
  );
};
