import React from 'react';
import { Menu, type MenuProps } from 'antd';
import {
  DashboardOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
  CalendarOutlined,
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
    icon: <DashboardOutlined />,
    label: 'Tổng quan',
  },
  {
    key: 'tasks',
    icon: <CheckSquareOutlined />,
    label: 'Tác vụ',
  },
  {
    key: 'projects',
    icon: <ProjectOutlined />,
    label: 'Dự án',
  },
  {
    key: 'planner',
    icon: <CalendarOutlined />,
    label: 'Lập kế hoạch',
  },
  {
    key: 'notes',
    icon: <FileTextOutlined />,
    label: 'Ghi chú',
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: 'Cài đặt',
  },
];

export const Navigation: React.FC<NavigationProps> = ({ currentRoute, onNavigate }) => {
  return (
    <Menu
      mode="inline"
      selectedKeys={[currentRoute]}
      onClick={({ key }) => onNavigate(key as AppRoute)}
      items={items}
      style={{ borderRight: 0, height: '100%' }}
    />
  );
};
