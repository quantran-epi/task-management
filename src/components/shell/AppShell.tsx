import React, { useState, useEffect } from 'react';
import { Layout, Drawer, Grid, Button, Typography, Space, Badge, Tooltip, theme, message } from 'antd';
import {
  MenuOutlined,
  CloudDownloadOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { Navigation } from './Navigation';
import { StatusBadge } from './StatusBadge';
import { UpgradeModal } from './UpgradeModal';
import { BrandLogo } from '../common/BrandLogo';
import { AriaLiveRegion } from '../common/AriaLiveRegion';
import { InstallButton } from '../pwa/InstallButton';
import { UpdateBanner } from '../pwa/UpdateBanner';
import { FormGuardProvider } from '../../context/FormGuardContext';
import { ServiceWorkerProvider } from '../../context/ServiceWorkerContext';
import { GitHubAuthProvider } from '../../context/GitHubAuthContext';
import { TimerProvider } from '../../context/TimerContext';
import { AIChatProvider, useAIChat } from '../../context/AIChatContext';
import { useServiceWorkerUpdate } from '../../hooks/useServiceWorkerUpdate';
import { useNotifications } from '../../hooks/useNotifications';
import { useDesktopNotification } from '../../hooks/useDesktopNotification';
import { useTimerAlertMonitor } from '../../hooks/useTimerAlertMonitor';
import { useLocalSqlitePersistence } from '../../hooks/useLocalSqlitePersistence';
import { useGitHubAutoSync } from '../../hooks/useGitHubAutoSync';
import { GitHubSyncStatusDot } from './GitHubSyncStatusDot';
import { ActiveTimerWidget } from '../timer/ActiveTimerWidget';
import { NotificationBell } from '../notifications/NotificationBell';
import { NotificationDrawer } from '../notifications/NotificationDrawer';
import { TaskDrawer } from '../tasks/TaskDrawer';
import { ProjectDetailModal } from '../projects/ProjectDetailModal';
import { ProjectModal } from '../projects/ProjectModal';
import { MilestoneModal } from '../projects/MilestoneModal';
import { NoteDetailModal } from '../notes/NoteDetailModal';
import { NoteEditor } from '../notes/NoteEditor';
import { CommandPaletteModal } from '../palette/CommandPaletteModal';
import { DailyReviewModal } from '../dailyReview/DailyReviewModal';
import { AIChatDrawer, DEFAULT_AI_CHAT_WIDTH, type ActiveScope } from '../ai/AIChatDrawer';
import { db } from '../../db';
import { dismissAlertToday } from '../../db/repositories/notificationRepo';
import { createTask, getTask } from '../../db/repositories/taskRepo';
import { getProject, updateProject } from '../../db/repositories/projectRepo';
import { getMilestone, updateMilestone } from '../../db/repositories/milestoneRepo';
import { getTodayDateString, isValidCalendarDate } from '../../utils/date';
import type { AppRoute, NavigateFunction } from '../../types/navigation';
import type { AlertNotificationItem } from '../../types/notifications';
import type { Project, Milestone, Note } from '../../types/models';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;
const { Title } = Typography;

export const SIDEBAR_COLLAPSED_KEY = 'planner:sidebar_collapsed';
export const AI_CHAT_OPEN_KEY = 'planner:ai_chat_open';
export const AI_CHAT_PINNED_KEY = 'planner:ai_chat_pinned';
export const AI_CHAT_WIDTH_KEY = 'planner:ai_chat_width';

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
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { token } = theme.useToken();

  // Desktop sidebar collapse persistence per D-17, D-18, D-20, T-12.2-08
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const handleCollapse = (value: boolean, type?: 'clickTrigger' | 'responsive') => {
    // Only handle user-directed collapse/expand triggers per D-17, D-18, D-19
    // Responsive auto-collapse/expand from breakpoint="lg" should not override user's persistent preference
    if (type === 'responsive') return;
    setCollapsed(value);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
    } catch (err) {
      console.warn('Failed to save sidebar collapse state:', err);
    }
  };

  const { needRefresh, reloadApp } = useServiceWorkerUpdate();
  const notifications = useNotifications();

  // Desktop Notification Startup Hook (D-18, D-19)
  useDesktopNotification({ notifications });

  // Global Running Timer Threshold & Allocation Alert Monitor
  useTimerAlertMonitor();

  // Desktop SQLite mirror persistence
  useLocalSqlitePersistence();

  // Scheduled dirty-only GitHub auto sync
  useGitHubAutoSync();

  // Notification UI & Inspection State (D-02, D-03, D-12)
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [dailyReviewOpen, setDailyReviewOpen] = useState(false);
  const [inspectingTaskId, setInspectingTaskId] = useState<string | undefined>(undefined);
  const [inspectingProject, setInspectingProject] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [inspectingMilestone, setInspectingMilestone] = useState<Milestone | null>(null);
  const [inspectingNote, setInspectingNote] = useState<Note | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  // AI Chat via context
  const {
    isOpen: aiChatOpen,
    toggleChat: toggleAiChatOpen,
    closeChat: closeAiChat,
    activeScope: contextActiveScope,
    registerActiveItem,
  } = useAIChat();

  const [aiChatPinned, setAiChatPinned] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(AI_CHAT_PINNED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [aiChatWidth, setAiChatWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_AI_CHAT_WIDTH;
    try {
      const stored = localStorage.getItem(AI_CHAT_WIDTH_KEY);
      if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val)) return val;
      }
    } catch {}
    return DEFAULT_AI_CHAT_WIDTH;
  });

  const handleToggleAiChatPinned = () => {
    setAiChatPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AI_CHAT_PINNED_KEY, String(next));
      } catch {}
      return next;
    });
  };

  // Active item tracking for AI item grounding auto-follow (D-05)
  const [activeTaskTitle, setActiveTaskTitle] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!inspectingTaskId) {
      setActiveTaskTitle(undefined);
      return;
    }
    let mounted = true;
    getTask(inspectingTaskId, db).then((t) => {
      if (mounted && t) {
        setActiveTaskTitle(t.name);
      }
    });
    return () => {
      mounted = false;
    };
  }, [inspectingTaskId]);

  // Register open inspection item with AIChatContext so Cmd+J grounds automatically
  useEffect(() => {
    if (inspectingTaskId) {
      return registerActiveItem({
        type: 'task',
        id: inspectingTaskId,
        title: activeTaskTitle || 'Tác vụ đang xem',
      });
    } else if (inspectingProject) {
      return registerActiveItem({
        type: 'project',
        id: inspectingProject.id,
        title: inspectingProject.name,
      });
    } else if (inspectingMilestone) {
      return registerActiveItem({
        type: 'milestone',
        id: inspectingMilestone.id,
        title: inspectingMilestone.name,
      });
    }
    return undefined;
  }, [inspectingTaskId, activeTaskTitle, inspectingProject, inspectingMilestone, registerActiveItem]);

  const activeScope: ActiveScope = contextActiveScope;

  // Global Cmd+K / Ctrl+K and Cmd+J / Ctrl+J keyboard shortcuts (D-04)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        toggleAiChatOpen();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [toggleAiChatOpen]);

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
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={handleCollapse}
          breakpoint="lg"
          theme={isDark ? 'dark' : 'light'}
          style={{
            borderRight: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div
            style={{
              padding: collapsed ? '16px 8px' : '16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'all 0.2s',
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              marginBottom: 8,
            }}
          >
            <BrandLogo size={collapsed ? 32 : 28} />
            {!collapsed && (
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 16,
                  letterSpacing: '-0.02em',
                  color: token.colorText,
                  whiteSpace: 'nowrap',
                }}
              >
                Task Planner
              </span>
            )}
          </div>
          <Navigation currentRoute={currentRoute} onNavigate={onNavigate} />
        </Sider>
      ) : (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{ body: { padding: 0 } }}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BrandLogo size={26} />
              <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>
                Task Planner
              </span>
            </div>
          }
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
            padding: '0 20px',
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            height: 56,
            lineHeight: '56px',
          }}
        >
          {/* Left: Brand logo & title + mobile menu hamburger */}
          <Space size="middle" align="center">
            {isMobile && (
              <Button
                icon={<MenuOutlined />}
                onClick={() => setDrawerOpen(true)}
                aria-label="Mở menu"
                style={{ minHeight: 36, minWidth: 36 }}
              />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isMobile && <BrandLogo size={26} />}
              <Title level={4} style={{ margin: 0, fontWeight: 700, letterSpacing: '-0.02em' }}>
                Task Planner
              </Title>
            </div>
          </Space>

          {/* Center: GitHub sync status dot & ActiveTimerWidget */}
          <Space size="middle" align="center">
            <GitHubSyncStatusDot />
            <ActiveTimerWidget />
          </Space>

          {/* Right: Search pill, Daily Review, AI Assistant, NotificationBell, InstallButton, UpdateBadge */}
          <Space size="small" align="center">
            <Tooltip title="Tìm kiếm & Lệnh nhanh (Cmd+K / Ctrl+K)">
              <Button
                type="default"
                onClick={() => setCommandPaletteOpen(true)}
                aria-label="Mở tìm kiếm nhanh"
                style={{
                  borderRadius: 20,
                  height: 34,
                  padding: '0 12px 0 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: token.colorFillAlter,
                  borderColor: token.colorBorderSecondary,
                }}
              >
                <SearchOutlined style={{ fontSize: 14, color: token.colorTextTertiary }} />
                {!isMobile && (
                  <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
                    Tìm kiếm & Lệnh...
                  </span>
                )}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 6,
                    background: token.colorFillSecondary,
                    color: token.colorTextTertiary,
                    lineHeight: '16px',
                  }}
                >
                  {navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘K' : 'Ctrl K'}
                </span>
              </Button>
            </Tooltip>

            <Tooltip title="Tổng kết ngày & Standup">
              <Button
                type="text"
                icon={<CheckCircleOutlined style={{ fontSize: 16, color: '#4f46e5' }} />}
                onClick={() => setDailyReviewOpen(true)}
                aria-label="Mở tổng kết ngày"
              >
                {!isMobile && <span style={{ fontSize: 13, color: token.colorTextSecondary }}>Tổng kết</span>}
              </Button>
            </Tooltip>

            <Tooltip title="Trợ lý AI (Cmd+J / Ctrl+J)">
              <Button
                type={aiChatOpen ? 'primary' : 'text'}
                icon={<RobotOutlined style={{ fontSize: 16 }} />}
                onClick={toggleAiChatOpen}
                aria-label="Trợ lý AI (Cmd+J / Ctrl+J)"
                style={{ minHeight: 34, minWidth: 34 }}
              />
            </Tooltip>

            <StatusBadge />

            <NotificationBell
              count={notifications.activeCount}
              onClick={() => setNotificationDrawerOpen(true)}
            />

            <InstallButton />

            {showCollapsedBadge && (
              <Tooltip title="Đã có bản cập nhật mới. Nhấn để cập nhật.">
                <Badge dot color="#4f46e5">
                  <Button
                    type="text"
                    icon={<CloudDownloadOutlined style={{ fontSize: 18, color: '#4f46e5' }} />}
                    onClick={() => setBannerDismissed(false)}
                    aria-label="Cập nhật ứng dụng"
                    style={{ minHeight: 34, minWidth: 34 }}
                  />
                </Badge>
              </Tooltip>
            )}
          </Space>
        </Header>

        <Content
          style={{
            margin: 16,
            marginRight: aiChatOpen && aiChatPinned && !isMobile ? aiChatWidth + 16 : 16,
            transition: 'margin-right 0.2s ease',
          }}
        >
          {children}
        </Content>
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
        <ProjectDetailModal
          open={Boolean(inspectingProject)}
          project={inspectingProject}
          onClose={() => setInspectingProject(null)}
          onEdit={(proj) => {
            setInspectingProject(null);
            setEditingProject(proj);
          }}
          onNavigateToProjects={() => {
            setInspectingProject(null);
            onNavigate('projects');
          }}
          onOpenTask={(taskId) => {
            setInspectingProject(null);
            setInspectingTaskId(taskId);
          }}
          onAddTask={async (projId) => {
            setInspectingProject(null);
            try {
              const task = await createTask(
                {
                  name: 'Tác vụ mới',
                  projectId: projId,
                  status: 'Open',
                  priority: 'Medium',
                  estimateMinutes: 0,
                },
                db
              );
              message.success('Đã tạo tác vụ cho dự án');
              setInspectingTaskId(task.id);
            } catch {
              message.error('Không thể tạo tác vụ');
            }
          }}
          db={db}
        />
      )}

      {editingProject && (
        <ProjectModal
          open={Boolean(editingProject)}
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSave={async (values) => {
            await updateProject(editingProject.id, values, db);
            setEditingProject(null);
            message.success('Đã cập nhật dự án');
          }}
          db={db}
        />
      )}

      {inspectingMilestone && (
        <MilestoneModal
          open={Boolean(inspectingMilestone)}
          projectId={inspectingMilestone.projectId}
          milestone={inspectingMilestone}
          onClose={() => setInspectingMilestone(null)}
          onSave={async (values) => {
            await updateMilestone(inspectingMilestone.id, values, db);
            setInspectingMilestone(null);
            message.success('Đã cập nhật mốc');
          }}
        />
      )}

      {inspectingNote && (
        <NoteDetailModal
          open={Boolean(inspectingNote)}
          note={inspectingNote}
          onClose={() => setInspectingNote(null)}
          onEdit={(note) => {
            setInspectingNote(null);
            setEditingNote(note);
          }}
          onNavigateToNotes={() => {
            setInspectingNote(null);
            onNavigate('notes');
          }}
          db={db}
        />
      )}

      {editingNote && (
        <NoteEditor
          open={Boolean(editingNote)}
          note={editingNote}
          onClose={() => setEditingNote(null)}
          onSaved={() => setEditingNote(null)}
          db={db}
        />
      )}

      <CommandPaletteModal
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={onNavigate}
        onOpenTask={(taskId) => setInspectingTaskId(taskId)}
        onOpenProject={(p) => setInspectingProject(p)}
        onOpenMilestone={(m) => setInspectingMilestone(m)}
        onOpenNote={(note) => setInspectingNote(note)}
        onCreateTask={async (name) => {
          try {
            const task = await createTask(
              {
                name: name || 'Tác vụ mới',
                status: 'Open',
                priority: 'Medium',
                estimateMinutes: 0,
              },
              db
            );
            message.success('Đã tạo tác vụ');
            setInspectingTaskId(task.id);
          } catch {
            message.error('Không thể tạo tác vụ');
          }
        }}
        db={db}
      />

      <DailyReviewModal
        open={dailyReviewOpen}
        onClose={() => setDailyReviewOpen(false)}
      />

      <AIChatDrawer
        open={aiChatOpen}
        onClose={closeAiChat}
        isPinned={aiChatPinned}
        onTogglePin={handleToggleAiChatPinned}
        activeScope={activeScope}
        width={aiChatWidth}
        onWidthChange={(w) => setAiChatWidth(w)}
        onOpenSettings={() => {
          closeAiChat();
          onNavigate('settings');
        }}
        isMobile={isMobile}
        db={db}
      />

      <UpgradeModal />
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
          <TimerProvider>
            <AIChatProvider>
              <AppShellInner {...props} />
            </AIChatProvider>
          </TimerProvider>
        </GitHubAuthProvider>
      </FormGuardProvider>
    </ServiceWorkerProvider>
  );
};
