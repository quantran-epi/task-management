import React from 'react';
import { Tag } from 'antd';
import {
  CodeOutlined,
  FileTextOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  BugOutlined,
  SettingOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import type { WorkType } from '../../types/models';

export interface WorkTypeConfig {
  label: string;
  color: string;
  icon: React.ReactElement;
}

export const WORK_TYPE_CONFIG: Record<WorkType, WorkTypeConfig> = {
  code: {
    label: 'Lập trình',
    color: 'blue',
    icon: <CodeOutlined />,
  },
  document: {
    label: 'Tài liệu',
    color: 'green',
    icon: <FileTextOutlined />,
  },
  meeting: {
    label: 'Họp hành',
    color: 'purple',
    icon: <TeamOutlined />,
  },
  support_testing: {
    label: 'Hỗ trợ SIT / UAT',
    color: 'orange',
    icon: <CheckCircleOutlined />,
  },
  investigate: {
    label: 'Điều tra lỗi / R&D',
    color: 'magenta',
    icon: <BugOutlined />,
  },
  configuration: {
    label: 'Cấu hình hệ thống',
    color: 'cyan',
    icon: <SettingOutlined />,
  },
  review_code: {
    label: 'Review code',
    color: 'gold',
    icon: <EyeOutlined />,
  },
};

export interface WorkTypeBadgeProps {
  workType?: WorkType | undefined;
  style?: React.CSSProperties | undefined;
}

export const WorkTypeBadge: React.FC<WorkTypeBadgeProps> = ({
  workType = 'code',
  style,
}) => {
  const config = WORK_TYPE_CONFIG[workType] ?? WORK_TYPE_CONFIG.code;

  return (
    <Tag
      color={config.color}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        margin: 0,
        ...style,
      }}
    >
      {config.icon}
      <span>{config.label}</span>
    </Tag>
  );
};
