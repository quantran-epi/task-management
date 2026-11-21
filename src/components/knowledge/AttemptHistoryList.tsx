import { Empty, List, Space, Tag, Typography, useAntdToken, EmptyImageSimple, ListItem } from '../ui';
import type { PublishAttemptCache } from '../../types/models';

const { Text } = Typography;

export interface AttemptHistoryListProps {
  attempts: readonly PublishAttemptCache[];
}

export function AttemptHistoryList({ attempts }: AttemptHistoryListProps) {
  const { token } = useAntdToken();
  const recent = [...attempts]
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
    .slice(0, 10);

  if (recent.length === 0) return <Empty image={EmptyImageSimple} description="Chưa có lần xuất bản nào." />;

  return (
    <List
      dataSource={recent}
      renderItem={(attempt) => (
        <ListItem data-testid="attempt-history-item">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Space wrap>
              <Text>{attempt.startedAt}</Text>
              <Tag>{attempt.status}</Tag>
              {attempt.durationMs !== undefined && <Text type="secondary">{Math.round(attempt.durationMs / 1000)} giây</Text>}
            </Space>
            <Text type="secondary">
              Thêm {attempt.addedCount} · Thay đổi {attempt.changedCount} · Gỡ {attempt.removedCount} · Không đổi {attempt.unchangedCount} · Cảnh báo DLP {attempt.warningCount}
            </Text>
            {(attempt.errorCode || attempt.errorMessage) && (
              <Text style={{ color: token.colorError }}>
                {[attempt.errorCode, attempt.errorMessage].filter(Boolean).join(': ').slice(0, 300)}
              </Text>
            )}
          </Space>
        </ListItem>
      )}
    />
  );
}
