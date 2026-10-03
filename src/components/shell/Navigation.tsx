import React from 'react';
import { Menu, type MenuProps, theme } from 'antd';
import {
  DashboardOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
  CalendarOutlined,
  BarChartOutlined,
  FileTextOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { AppRoute } from '../../types/navigation';

export interface NavigationProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

type MenuItem = Required<MenuProps>['items'][number];

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
    key: 'settings',
    icon: <SettingOutlined style={{ fontSize: 16 }} />,
    label: 'Cài đặt',
  },
];

export const Navigation: React.FC<NavigationProps> = ({ currentRoute, onNavigate }) => {
  const { token } = theme.useToken();

  return (
    <Menu
      mode="inline"
      selectedKeys={[currentRoute]}
      onClick={({ key }) => onNavigate(key as AppRoute)}
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

