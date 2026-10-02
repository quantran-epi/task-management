import React, { useState } from 'react';
import { Button, Checkbox, Input, List, Typography, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { TaskChecklistItem } from '../../types/models';

const { Text } = Typography;

export interface TaskChecklistSectionProps {
  value?: TaskChecklistItem[];
  onChange?: (items: TaskChecklistItem[]) => void;
  onSyncProgress?: (percentage: number) => void;
}

export const TaskChecklistSection: React.FC<TaskChecklistSectionProps> = ({
  value = [],
  onChange,
  onSyncProgress,
}) => {
  const [newText, setNewText] = useState('');

  const completedCount = value.filter((item) => item.done).length;
  const totalCount = value.length;
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleAddItem = () => {
    const trimmed = newText.trim();
    if (!trimmed) return;

    const newItem: TaskChecklistItem = {
      id: crypto.randomUUID(),
      text: trimmed,
      done: false,
    };

    const next = [...value, newItem];
    onChange?.(next);
    setNewText('');
  };

  const handleToggleDone = (id: string, checked: boolean) => {
    const next = value.map((item) => (item.id === id ? { ...item, done: checked } : item));
    onChange?.(next);
  };

  const handleTextChange = (id: string, text: string) => {
    const next = value.map((item) => (item.id === id ? { ...item, text } : item));
    onChange?.(next);
  };

  const handleDeleteItem = (id: string) => {
    const next = value.filter((item) => item.id !== id);
    onChange?.(next);
  };

  const handleSync = () => {
    if (onSyncProgress && totalCount > 0) {
      onSyncProgress(percentage);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          {totalCount > 0 ? `Đã hoàn thành ${completedCount}/${totalCount} (${percentage}%)` : 'Chưa có mục nào'}
        </Text>
        {totalCount > 0 && onSyncProgress && (
          <Tooltip title={`Đồng bộ ${percentage}% vào tiến độ công việc`}>
            <Button
              size="small"
              type="link"
              icon={<CheckCircleOutlined />}
              onClick={handleSync}
              style={{ padding: 0 }}
            >
              Cập nhật tiến độ ({percentage}%)
            </Button>
          </Tooltip>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Input
          placeholder="Thêm việc cần làm / checklist..."
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onPressEnter={handleAddItem}
          aria-label="Nội dung mục kiểm tra mới"
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddItem}
          aria-label="Thêm mục checklist"
        >
          Thêm
        </Button>
      </div>

      {value.length > 0 && (
        <List
          size="small"
          bordered
          dataSource={value}
          renderItem={(item) => (
            <List.Item
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                background: item.done ? '#fafafa' : undefined,
              }}
            >
              <Checkbox
                checked={item.done}
                onChange={(e) => handleToggleDone(item.id, e.target.checked)}
                aria-label={`Hoàn thành: ${item.text}`}
              />
              <Input
                variant="borderless"
                value={item.text}
                onChange={(e) => handleTextChange(item.id, e.target.value)}
                style={{
                  flex: 1,
                  padding: '2px 4px',
                  textDecoration: item.done ? 'line-through' : 'none',
                  color: item.done ? '#8c8c8c' : undefined,
                }}
                aria-label="Chỉnh sửa nội dung mục"
              />
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => handleDeleteItem(item.id)}
                aria-label={`Xóa mục ${item.text}`}
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
};
