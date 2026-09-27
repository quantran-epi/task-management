import React from 'react';
import { Card, Badge, Button, Empty, List, Checkbox, Tag, Typography, Space, message } from 'antd';
import type { AttentionTaskItem } from '../../types/dashboard';
import type { Task, TaskPriority, TaskStatus } from '../../types/models';
import type { TaskPlannerDatabase } from '../../db';
import { updateTaskStatus } from '../../db/repositories/taskRepo';
import { InlineStatusTag } from '../tasks/InlineStatusTag';
import { formatMinutes } from '../../utils/time';

export interface AttentionTodayListProps {
  items: AttentionTaskItem[];
  onTaskClick: (taskId: string) => void;
  onViewAllTasks: () => void;
  db?: TaskPlannerDatabase;
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  Urgent: '#ff4d4f',
  High: '#fa8c16',
  Medium: '#1677ff',
  Low: '#8c8c8c',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  Urgent: 'Khẩn cấp',
  High: 'Cao',
  Medium: 'Trung bình',
  Low: 'Thấp',
};

export const AttentionTodayList: React.FC<AttentionTodayListProps> = ({
  items,
  onTaskClick,
  onViewAllTasks,
  db,
}) => {
  const handleToggleDone = async (task: Task) => {
    const nextStatus: TaskStatus = task.status === 'Done' ? 'Open' : 'Done';
    try {
      await updateTaskStatus(task.id, nextStatus, db);
      message.success({ content: 'Đã cập nhật trạng thái', duration: 1.5 });
    } catch {
      message.error({ content: 'Không thể cập nhật trạng thái', duration: 2 });
    }
  };

  return (
    <Card
      title={
        <Space size={8}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Tác vụ cần chú ý</span>
          <Badge
            count={items.length}
            overflowCount={99}
            style={{ backgroundColor: items.length > 0 ? '#1677ff' : '#d9d9d9' }}
          />
        </Space>
      }
      extra={
        <Button type="link" onClick={onViewAllTasks} style={{ padding: 0 }}>
          Xem tất cả tác vụ
        </Button>
      }
      data-testid="attention-today-card"
      styles={{ body: { padding: '8px 16px' } }}
    >
      <div
        data-testid="attention-list-body"
        style={{ maxHeight: 360, overflowY: 'auto' }}
      >
        {items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Tuyệt vời! Bạn không có tác vụ quá hạn, đến hạn hôm nay hay lịch phân bổ nào còn dở dang."
            style={{ padding: '32px 0' }}
          />
        ) : (
          <List
            dataSource={items}
            renderItem={(item) => (
              <List.Item
                key={item.task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <Checkbox
                    checked={item.task.status === 'Done'}
                    onChange={() => handleToggleDone(item.task)}
                    aria-label={`Đánh dấu hoàn thành cho ${item.task.name}`}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                    <Typography.Text
                      ellipsis
                      delete={item.task.status === 'Done' || item.task.status === 'Cancelled'}
                      style={{
                        cursor: 'pointer',
                        fontWeight: 500,
                        color: item.task.status === 'Done' ? undefined : '#1677ff',
                      }}
                      onClick={() => onTaskClick(item.task.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onTaskClick(item.task.id);
                        }
                      }}
                      aria-label={`Mở chi tiết tác vụ ${item.task.name}`}
                    >
                      {item.task.name}
                    </Typography.Text>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      {item.category === 'overdue' && (
                        <Tag color="error" style={{ margin: 0 }}>
                          Quá hạn {item.daysOverdue ?? 0} ngày
                        </Tag>
                      )}
                      {item.category === 'due-today' && (
                        <>
                          <Tag color="processing" style={{ margin: 0 }}>
                            Đến hạn hôm nay
                          </Tag>
                          {item.task.priority && (
                            <Tag
                              bordered={false}
                              style={{
                                color: PRIORITY_COLORS[item.task.priority],
                                backgroundColor: `${PRIORITY_COLORS[item.task.priority]}15`,
                                fontWeight: 600,
                                margin: 0,
                                fontSize: 11,
                              }}
                            >
                              {PRIORITY_LABELS[item.task.priority] || item.task.priority}
                            </Tag>
                          )}
                        </>
                      )}
                      {item.category === 'scheduled-today' && (
                        <Tag color="cyan" style={{ margin: 0 }}>
                          Lên lịch {formatMinutes(item.scheduledMinutes ?? 0)}
                        </Tag>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <InlineStatusTag
                    taskId={item.task.id}
                    status={item.task.status}
                    estimateMinutes={item.task.estimateMinutes}
                    db={db}
                  />
                </div>
              </List.Item>
            )}
          />
        )}
      </div>
    </Card>
  );
};
