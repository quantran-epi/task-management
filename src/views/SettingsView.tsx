import React from 'react';
import { Typography, Button, Tabs, Space } from 'antd';
import { ArrowLeftOutlined, ScheduleOutlined, DatabaseOutlined } from '@ant-design/icons';
import { WeeklyCapacityForm } from '../components/settings/WeeklyCapacityForm';
import { OverridesTable } from '../components/settings/OverridesTable';
import { BackupExportCard } from '../components/settings/BackupExportCard';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { AppRoute } from '../types/navigation';

const { Title, Paragraph } = Typography;

export interface SettingsViewProps {
  db?: TaskPlannerDatabase;
  onNavigate?: (route: AppRoute) => void;
  defaultActiveTab?: 'capacity' | 'data';
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  db = defaultDb,
  onNavigate,
  defaultActiveTab = 'capacity',
}) => {
  const items = [
    {
      key: 'capacity',
      label: (
        <span>
          <ScheduleOutlined style={{ marginRight: 8 }} />
          Công suất làm việc
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <WeeklyCapacityForm db={db} />
          <OverridesTable db={db} />
        </Space>
      ),
    },
    {
      key: 'data',
      label: (
        <span>
          <DatabaseOutlined style={{ marginRight: 8 }} />
          Sao lưu & Dữ liệu
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <BackupExportCard db={db} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '16px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Cài đặt & Cấu hình công suất
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Cấu hình công suất làm việc hàng tuần tiêu chuẩn và lên lịch ngoại lệ cho các ngày cụ thể.
          </Paragraph>
        </div>

        {onNavigate && (
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => onNavigate('tasks')}
            aria-label="Quay lại Tác vụ"
          >
            Quay lại Tác vụ
          </Button>
        )}
      </div>

      <Tabs defaultActiveKey={defaultActiveTab} items={items} />
    </div>
  );
};
