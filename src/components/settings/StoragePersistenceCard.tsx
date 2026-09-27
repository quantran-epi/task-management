import React from 'react';
import { Card, Space, Tag, Button, Typography, Progress, Alert, Empty } from 'antd';
import { HddOutlined, DatabaseOutlined } from '@ant-design/icons';
import { useStoragePersistence } from '../../hooks/useStoragePersistence';

const { Paragraph, Text } = Typography;

export const StoragePersistenceCard: React.FC = () => {
  const {
    isPersisted,
    isSupported,
    formattedQuota,
    formattedUsage,
    percentUsed,
    loading,
    requestPersistence,
  } = useStoragePersistence();

  return (
    <Card
      title={
        <span>
          <HddOutlined style={{ marginRight: 8 }} />
          Dung lượng lưu trữ & Tính bền vững
        </span>
      }
    >
      <Paragraph type="secondary">
        Thông tin dung lượng IndexedDB và tính bền vững của dữ liệu cục bộ trên thiết bị của bạn.
      </Paragraph>

      {!isSupported ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <Text strong>Không có thông tin hạn mức</Text>
              <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                Trình duyệt không hỗ trợ StorageManager API hoặc đang ở chế độ ẩn danh. Dữ liệu vẫn được bảo vệ trong IndexedDB.
              </Paragraph>
            </div>
          }
        />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>Chế độ lưu trữ: </Text>
            {isPersisted ? (
              <Tag color="success">Bền vững (Persisted)</Tag>
            ) : (
              <Tag color="gold">Tạm thời (Best-effort)</Tag>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text strong>Dung lượng ước tính:</Text>
              <Text type="secondary">
                {formattedUsage} / {formattedQuota} khả dụng
              </Text>
            </div>
            <Progress
              percent={percentUsed}
              strokeColor={percentUsed > 80 ? '#faad14' : '#1677ff'}
              status={percentUsed > 80 ? 'exception' : 'normal'}
            />
          </div>

          {!isPersisted && (
            <Alert
              type="warning"
              showIcon
              message="Khuyến nghị an toàn"
              description="Trình duyệt chưa cấp quyền lưu trữ bền vững. Hãy thường xuyên xuất tệp sao lưu JSON để phòng ngừa việc trình duyệt tự động dọn dẹp bộ nhớ."
            />
          )}

          {!isPersisted && (
            <Space wrap style={{ marginTop: 8 }}>
              <Button
                type="primary"
                icon={<DatabaseOutlined />}
                onClick={requestPersistence}
                loading={loading}
              >
                Yêu cầu lưu trữ bền vững
              </Button>
            </Space>
          )}
        </Space>
      )}
    </Card>
  );
};
