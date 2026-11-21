import React from 'react';
import { Card, Space, Typography, useAntdToken } from '../ui';
import { DatabaseOutlined } from '../ui/icon';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { OracleProfileManager } from '../ai/OracleSqlclSettingsModal';

const { Paragraph } = Typography;

export interface OracleAiToolConfigCardProps {
  db?: TaskPlannerDatabase;
  onConfigChange?: () => void;
}

export const OracleAiToolConfigCard: React.FC<OracleAiToolConfigCardProps> = ({
  db = defaultDb,
  onConfigChange,
}) => {
  const { token } = useAntdToken();

  return (
    <Card
      title={
        <Space>
          <DatabaseOutlined style={{ color: token.colorPrimary }} />
          <span>Cấu hình Oracle SQLcl (AI Tool Loop)</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        Quản lý các kết nối Oracle theo môi trường (SIT/UAT/...) cho <code>oracle_query</code> và{' '}
        <code>oracle_describe</code>. AI sẽ chạy <code>sqlcl</code> trên máy chủ SSH đã chọn và kết nối
        tới Oracle DB nội bộ, với chế độ <b>CHỈ ĐỌC</b> bắt buộc.
      </Paragraph>

      <OracleProfileManager db={db} onConfigChange={onConfigChange} />
    </Card>
  );
};
