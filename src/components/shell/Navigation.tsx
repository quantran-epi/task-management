import React from 'react';
import { Menu, Badge, type MenuProps } from 'antd';
import {
  DashboardOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
  CalendarOutlined,
  BarChartOutlined,
  FileTextOutlined,
  SettingOutlined,
  RobotOutlined,
  SendOutlined,
  CodeOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import type { AppRoute } from '../../types/navigation';
import { useGhostDevSessions } from '../../hooks/useGhostDevSessions';
import { useGhostDevNotifications } from '../../hooks/useGhostDevNotifications';
import { useTelegramPendingUsers } from '../../hooks/useTelegramPendingUsers';

export interface NavigationProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

type MenuItem = Required<MenuProps>['items'][number];

export const Navigation: React.FC<NavigationProps> = ({ currentRoute, onNavigate }) => {
  const { sessions } = useGhostDevSessions();
  useGhostDevNotifications(sessions);
  const { pendingCount } = useTelegramPendingUsers();

  const runningCount = sessions.filter(
    (s) => s.status === 'running' || s.status === 'awaiting_approval'
  ).length;

  const items: MenuItem[] = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined style={{ fontSize: 16 }} />,
      label: 'Tổng quan',
    },
    {
      key: 'tasks',
      icon: <CheckSquareOutlined style={{ fontSize: 16 }} />,
      label: 'Tác vụ',
    },
    {
      key: 'projects',
      icon: <ProjectOutlined style={{ fontSize: 16 }} />,
      label: 'Dự án',
    },
    {
      key: 'planner',
      icon: <CalendarOutlined style={{ fontSize: 16 }} />,
      label: 'Lập kế hoạch',
    },
    {
      key: 'agents',
      icon: <RobotOutlined style={{ fontSize: 16 }} />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span>Agent Control</span>
          {runningCount > 0 && (
            <Badge
              count={runningCount}
              size="small"
              style={{ backgroundColor: '#4f46e5' }}
            />
          )}
        </span>
      ),
    },
    {
      key: 'analytics',
      icon: <BarChartOutlined style={{ fontSize: 16 }} />,
      label: 'Thống kê',
    },
    {
      key: 'notes',
      icon: <FileTextOutlined style={{ fontSize: 16 }} />,
      label: 'Ghi chú',
    },
    {
      key: 'mermaid',
      icon: <ApartmentOutlined style={{ fontSize: 16 }} />,
      label: 'Diagram Studio',
    },
    {
      key: 'telegram',
      icon: <SendOutlined style={{ fontSize: 16 }} />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span>Telegram Bot</span>
          {pendingCount > 0 && (
            <Badge
              count={pendingCount}
              size="small"
              style={{ backgroundColor: '#ef4444' }}
            />
          )}
        </span>
      ),
    },
    {
      key: 'settings',
      icon: <SettingOutlined style={{ fontSize: 16 }} />,
      label: 'Cài đặt',
    },
    {
      key: '__switch_intellij__',
      icon: <CodeOutlined style={{ fontSize: 16, color: '#3871e1' }} />,
      label: <span style={{ color: '#3871e1', fontWeight: 600 }}>Giao diện IntelliJ</span>,
      onClick: () => {
        try {
          localStorage.setItem('taskmate_ui_shell', 'intellij');
        } catch {}
        window.location.reload();
      },
    },
  ];

  return (
    <Menu
      mode="inline"
      selectedKeys={[currentRoute]}
      onClick={({ key }) => {
        if (key === '__switch_intellij__') return;
        onNavigate(key as AppRoute);
      }}
      items={items}
      style={{
        borderRight: 0,
        height: '100%',
        padding: '0 8px',
        fontWeight: 500,
        background: 'transparent',
      }}
    />
  );
};

