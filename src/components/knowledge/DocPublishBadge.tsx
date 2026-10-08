import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudOutlined,
  EditOutlined,
  LoadingOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Space, Tag, Tooltip, Typography } from 'antd';
import type { DocumentPublishStatus } from '../../db/repositories/documentSetRepo';
import type { PublishPrimaryState } from '../../types/models';

const { Text } = Typography;

const STATE_UI = {
  'Never published': { label: 'Chưa xuất bản', icon: <CloudOutlined />, color: 'default' },
  'In sync': { label: 'Đã đồng bộ', icon: <CheckCircleOutlined />, color: 'success' },
  'Local changes': { label: 'Có thay đổi cục bộ', icon: <EditOutlined />, color: 'processing' },
  Publishing: { label: 'Đang xuất bản', icon: <LoadingOutlined spin />, color: 'processing' },
  Warning: { label: 'Cảnh báo', icon: <WarningOutlined />, color: 'warning' },
  Failed: { label: 'Thất bại', icon: <CloseCircleOutlined />, color: 'error' },
} as const;

export function publishStateLabel(state: PublishPrimaryState): string {
  return STATE_UI[state].label;
}

export interface DocPublishBadgeProps {
  status?: DocumentPublishStatus | undefined;
  compact?: boolean | undefined;
}

export function DocPublishBadge({ status, compact = false }: DocPublishBadgeProps) {
  const state = status?.aggregateState ?? 'Never published';
  const stateUi = STATE_UI[state];
  const details = status?.containingSets.length
    ? (
        <Space direction="vertical" size={4}>
          {status.containingSets.map((set) => (
            <Text key={set.setId}>{set.setName}: {publishStateLabel(set.state)}</Text>
          ))}
        </Space>
      )
    : stateUi.label;

  return (
    <Tooltip title={details}>
      <Tag
        aria-label={`Trạng thái xuất bản: ${stateUi.label}`}
        color={stateUi.color}
        icon={stateUi.icon}
        style={{ marginInlineEnd: 0, fontSize: 12 }}
      >
        {!compact && stateUi.label}
      </Tag>
    </Tooltip>
  );
}
