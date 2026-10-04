import React, { useState } from 'react';
import { Alert, Button, Checkbox, Space, Typography } from 'antd';
import { BulbOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { DetectedEntity } from '../../utils/smartIngestion';

const { Text } = Typography;

export interface SmartIngestionBannerProps {
  detectedEntities: DetectedEntity[];
  onApplyAll: (selected: DetectedEntity[]) => Promise<void> | void;
  onDismiss: () => void;
  loading?: boolean;
}

export const SmartIngestionBanner: React.FC<SmartIngestionBannerProps> = ({
  detectedEntities,
  onApplyAll,
  onDismiss,
  loading = false,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    detectedEntities.map((e) => e.id)
  );

  if (detectedEntities.length === 0) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleApply = () => {
    const selected = detectedEntities.filter((e) => selectedIds.includes(e.id));
    onApplyAll(selected);
  };

  const renderIcon = (type: string) => {
    if (type === 'task') return '✅';
    if (type === 'project') return '📁';
    if (type === 'milestone') return '🚩';
    return '📄';
  };

  return (
    <Alert
      className="smart-ingestion-banner"
      type="info"
      showIcon
      icon={<BulbOutlined style={{ color: '#4f46e5' }} />}
      message={<Text strong>💡 Gợi ý liên kết liên quan</Text>}
      description={
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
            Phát hiện các tác vụ và dự án liên quan từ nội dung văn bản. Chọn mục cần liên kết hai chiều:
          </Text>
          <Space orientation="vertical" size={6} style={{ width: '100%', marginBottom: 12 }}>
            {detectedEntities.map((entity) => {
              const isChecked = selectedIds.includes(entity.id);
              return (
                <div key={entity.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Checkbox
                    checked={isChecked}
                    onChange={() => toggleSelect(entity.id)}
                  >
                    <span style={{ marginRight: 4 }}>{renderIcon(entity.type)}</span>
                    <Text strong={isChecked}>{entity.title}</Text>
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                      ({entity.matchReason})
                    </Text>
                  </Checkbox>
                </div>
              );
            })}
          </Space>
          <Space size={8}>
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              onClick={handleApply}
              loading={loading}
              disabled={selectedIds.length === 0}
              style={{ backgroundColor: '#4f46e5' }}
            >
              Áp dụng tất cả
            </Button>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={onDismiss}
              disabled={loading}
            >
              Bỏ qua
            </Button>
          </Space>
        </div>
      }
      style={{ marginBottom: 16, border: '1px solid #c7d2fe', backgroundColor: '#eef2ff' }}
    />
  );
};
