import React from 'react';
import { Checkbox, Tag, Typography, Button, Space, message } from 'antd';
import {
  CalendarOutlined,
  FolderOutlined,
  FlagOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import type { AlertNotificationItem } from '../../types/notifications';
import type { TaskPlannerDatabase } from '../../db';
import type { TaskStatus } from '../../types/models';
import { updateTaskStatus } from '../../db/repositories/taskRepo';

export interface NotificationItemRowProps {
  item: AlertNotificationItem;
  onItemClick: (item: AlertNotificationItem) => void;
  onDismiss: (item: AlertNotificationItem) => void;
  db?: TaskPlannerDatabase;
}

export const NotificationItemRow: React.FC<NotificationItemRowProps> = ({
  item,
  onItemClick,
  onDismiss,
  db,
}) => {
  const handleToggleDone = async (e: any) => {
    e.stopPropagation();
    if (!item.task) return;
    const nextStatus: TaskStatus = item.task.status === 'Done' ? 'Open' : 'Done';
    try {
      await updateTaskStatus(item.task.id, nextStatus, db);
      message.success('Đã cập nhật trạng thái');
    } catch {
      message.error('Không thể cập nhật trạng thái');
    }
  };

  const renderLeading = () => {
    if (item.entityType === 'task' && item.task) {
      return (
        <Checkbox
          checked={item.task.status === 'Done'}
          onChange={handleToggleDone}
          aria-label={`Đánh dấu hoàn thành cho ${item.task.name}`}
        />
      );
    }
    if (item.entityType === 'capacity') {
      return <CalendarOutlined style={{ color: '#fa8c16', fontSize: 16 }} />;
    }
    if (item.entityType === 'project') {
      return <FolderOutlined style={{ color: '#1677ff', fontSize: 16 }} />;
    }
    if (item.entityType === 'milestone') {
      return <FlagOutlined style={{ color: '#722ed1', fontSize: 16 }} />;
    }
    return null;
  };

  const renderTrailing = () => {
    if (item.entityType === 'capacity') {
      return (
        <Button
          type="link"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onItemClick(item);
          }}
          style={{ padding: '0 4px' }}
        >
          Xem lịch
        </Button>
      );
    }
    if (item.canDismiss) {
      return (
        <Button
          type="text"
          size="small"
          icon={<EyeInvisibleOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(item);
          }}
          style={{ padding: '0 4px', color: '#8c8c8c' }}
        >
          Bỏ qua
        </Button>
      );
    }
    return null;
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        borderBottom: '1px solid #f0f0f0',
        gap: 12,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
        <div style={{ marginTop: 2, flexShrink: 0 }}>{renderLeading()}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Typography.Text
              strong
              ellipsis
              style={{
                cursor: 'pointer',
                color: item.task?.status === 'Done' ? undefined : '#262626',
              }}
              delete={item.task?.status === 'Done'}
              onClick={() => onItemClick(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onItemClick(item);
                }
              }}
              aria-label={`Chi tiết ${item.title}`}
            >
              {item.title}
            </Typography.Text>
            <Tag color={item.tagColor} style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}>
              {item.tagLabel}
            </Tag>
          </div>
          {item.subtitle && (
            <Typography.Text
              type="secondary"
              ellipsis
              style={{ fontSize: 12, lineHeight: 1.3 }}
            >
              {item.subtitle}
            </Typography.Text>
          )}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{renderTrailing()}</div>
    </div>
  );
};
