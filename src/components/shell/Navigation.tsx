import React from 'react';
import { Menu, type MenuProps } from 'antd';
import {
  CheckSquareOutlined,
  ProjectOutlined,
  CalendarOutlined,
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
    key: 'tasks',
    icon: <CheckSquareOutlined />,
    label: 'Tasks',
  },
  {
    key: 'projects',
    icon: <ProjectOutlined />,
    label: 'Projects',
  },
  {
    key: 'planner',
    icon: <CalendarOutlined />,
    label: 'Planner',
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: 'Settings',
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
