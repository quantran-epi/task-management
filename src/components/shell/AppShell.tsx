import React, { useState } from 'react';
import { Layout, Drawer, Grid, Button, Typography, Space, Badge, Tooltip, theme, message } from 'antd';
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
import { useNotifications } from '../../hooks/useNotifications';
import { useDesktopNotification } from '../../hooks/useDesktopNotification';
import { NotificationBell } from '../notifications/NotificationBell';
import { NotificationDrawer } from '../notifications/NotificationDrawer';
import { TaskDrawer } from '../tasks/TaskDrawer';
import { ProjectModal } from '../projects/ProjectModal';
import { MilestoneModal } from '../projects/MilestoneModal';
import { dismissAlertToday } from '../../db/repositories/notificationRepo';
import { getProject, updateProject } from '../../db/repositories/projectRepo';
import { getMilestone, updateMilestone } from '../../db/repositories/milestoneRepo';
import { getTodayDateString, isValidCalendarDate } from '../../utils/date';
import type { AppRoute, NavigateFunction } from '../../types/navigation';
import type { AlertNotificationItem } from '../../types/notifications';
import type { Project, Milestone } from '../../types/models';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;
const { Title } = Typography;

export interface AppShellProps {
  currentRoute: AppRoute;
  onNavigate: NavigateFunction;
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
  const notifications = useNotifications();

  // Desktop Notification Startup Hook (D-18, D-19)
  useDesktopNotification({ notifications });

  // Notification UI & Inspection State (D-02, D-03, D-12)
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [inspectingTaskId, setInspectingTaskId] = useState<string | undefined>(undefined);
  const [inspectingProject, setInspectingProject] = useState<Project | null>(null);
  const [inspectingMilestone, setInspectingMilestone] = useState<Milestone | null>(null);

  // Prefer explicit prop if provided, else check token brightness/property
  const isDark = explicitDark ?? false;

  // md breakpoint is 768px. Mobile when screens.md is false. Default to desktop when screens.md is true or uninitialized in test/SSR.
  const isMobile = screens.md === false;

  // Show banner if needRefresh is true and not dismissed by user
  const showBanner = needRefresh && !bannerDismissed;
  // Show header collapsed badge if needRefresh is true and user dismissed the banner (D-04)
  const showCollapsedBadge = needRefresh && bannerDismissed;

  const handleNotificationClick = async (item: AlertNotificationItem) => {
    setNotificationDrawerOpen(false);

    if (item.entityType === 'task' && item.entityId) {
      setInspectingTaskId(item.entityId);
    } else if (item.entityType === 'project' && item.entityId) {
      const p = await getProject(item.entityId);
      if (p) setInspectingProject(p);
    } else if (item.entityType === 'milestone' && item.entityId) {
      const m = await getMilestone(item.entityId);
      if (m) setInspectingMilestone(m);
    } else if (item.entityType === 'capacity' && item.date) {
      // T-12-09: Sanitize date parameter before routing
      if (isValidCalendarDate(item.date)) {
        onNavigate('planner', { date: item.date });
      }
    }
  };

  const handleDismissNotification = async (item: AlertNotificationItem) => {
    try {
      await dismissAlertToday(item.id, getTodayDateString());
      message.success('Đã ẩn cảnh báo cho đến hết ngày hôm nay.');
    } catch (err: any) {
      message.error(err?.message || 'Không thể bỏ qua cảnh báo.');
    }
  };

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
            <NotificationBell
              count={notifications.activeCount}
              onClick={() => setNotificationDrawerOpen(true)}
            />
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

      <NotificationDrawer
        open={notificationDrawerOpen}
        onClose={() => setNotificationDrawerOpen(false)}
        items={notifications.items}
        onItemClick={handleNotificationClick}
        onDismiss={handleDismissNotification}
      />

      <TaskDrawer
        taskId={inspectingTaskId ?? null}
        open={Boolean(inspectingTaskId)}
        onClose={() => setInspectingTaskId(undefined)}
      />

      {inspectingProject && (
        <ProjectModal
          open={Boolean(inspectingProject)}
          project={inspectingProject}
          onClose={() => setInspectingProject(null)}
          onSave={async (values) => {
            await updateProject(inspectingProject.id, values);
            setInspectingProject(null);
            message.success('Đã cập nhật dự án');
          }}
        />
      )}

      {inspectingMilestone && (
        <MilestoneModal
          open={Boolean(inspectingMilestone)}
          projectId={inspectingMilestone.projectId}
          milestone={inspectingMilestone}
          onClose={() => setInspectingMilestone(null)}
          onSave={async (values) => {
            await updateMilestone(inspectingMilestone.id, values);
            setInspectingMilestone(null);
            message.success('Đã cập nhật mốc');
          }}
        />
      )}

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
