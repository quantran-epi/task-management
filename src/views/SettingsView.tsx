import React from 'react';
import { Space, Typography, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { WeeklyCapacityForm } from '../components/settings/WeeklyCapacityForm';
import { OverridesTable } from '../components/settings/OverridesTable';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { AppRoute } from '../types/navigation';

const { Title, Paragraph } = Typography;

export interface SettingsViewProps {
  db?: TaskPlannerDatabase;
  onNavigate?: (route: AppRoute) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ db = defaultDb, onNavigate }) => {
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

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <WeeklyCapacityForm db={db} />
        <OverridesTable db={db} />
      </Space>
    </div>
  );
};
