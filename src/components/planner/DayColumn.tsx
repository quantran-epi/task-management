import React from 'react';
import { Button, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { DayPlannerData } from '../../hooks/useWeeklyPlanner';
import { DayColumnHeader } from './DayColumnHeader';
import { TaskAllocationCard } from './TaskAllocationCard';
import type { TaskPlannerDatabase } from '../../db';

const { Text } = Typography;

export interface DayColumnProps {
  day: DayPlannerData;
  showCompleted: boolean;
  onAllocate: (date: string) => void;
  onEditCapacity: (date: string) => void;
  onTaskClick?: ((taskId: string) => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
}

export const DayColumn: React.FC<DayColumnProps> = ({
  day,
  showCompleted,
  onAllocate,
  onEditCapacity,
  onTaskClick,
  db,
}) => {
  const visibleAllocations = day.allocations.filter((item) =>
    showCompleted ? true : item.isActive
  );

  return (
    <div
      data-testid={`day-column-${day.date}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minWidth: 230,
        backgroundColor: '#fafafa',
        borderRadius: 8,
        border: '1px solid #f0f0f0',
        padding: 6,
      }}
    >
      {/* Accessible Day Column Header */}
      <DayColumnHeader day={day} onEditCapacity={onEditCapacity} />

      {/* Body: List of Task Allocation Cards */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 120,
          marginBottom: 8,
        }}
      >
        {visibleAllocations.length === 0 ? (
          <div
            style={{
              padding: '24px 8px',
              textAlign: 'center',
              border: '1px dashed #d9d9d9',
              borderRadius: 6,
              backgroundColor: '#ffffff',
              margin: '4px 0',
            }}
          >
            <Text strong style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
              Chưa có tác vụ phân bổ
            </Text>
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              Nhấn &quot;Phân bổ&quot; bên dưới để lập kế hoạch cho ngày này.
            </Text>
          </div>
        ) : (
          visibleAllocations.map((item) => (
            <TaskAllocationCard
              key={item.id}
              allocation={item}
              task={item.task}
              isActive={item.isActive}
              onEditTask={onTaskClick}
              db={db}
            />
          ))
        )}
      </div>

      {/* Footer: Phân bổ quick button (D-03) */}
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        block
        onClick={() => onAllocate(day.date)}
        aria-label={`Phân bổ tác vụ cho ${day.date}`}
        style={{ fontSize: 13 }}
      >
        Phân bổ
      </Button>
    </div>
  );
};
