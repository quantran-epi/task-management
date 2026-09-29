import React from 'react';
import { Space, Typography, Tooltip, Button, Dropdown, Badge, theme, type MenuProps } from 'antd';
import {
  PauseCircleOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type TaskPlannerDatabase } from '../../db';
import { useTimer } from '../../hooks/useTimer';
import { formatElapsedTicker } from '../../utils/time';

export interface ActiveTimerWidgetProps {
  tasksMap?: Map<string, string>;
  database?: TaskPlannerDatabase;
}

export const ActiveTimerWidget: React.FC<ActiveTimerWidgetProps> = ({
  tasksMap,
  database = db,
}) => {
  const { token } = theme.useToken();
  const {
    activeTimers,
    getElapsedSeconds,
    pauseTimer,
    startTimer,
    finishTimer,
  } = useTimer();

  // Load tasks dynamically from DB if tasksMap not passed or incomplete
  const dbTasks = useLiveQuery(
    async () => {
      if (activeTimers.length === 0) return [];
      const ids = activeTimers.map((t) => t.taskId);
      const results = await database.tasks.bulkGet(ids);
      return results.filter((t): t is NonNullable<typeof t> => Boolean(t));
    },
    [activeTimers, database]
  );

  const getTaskTitle = (taskId: string): string => {
    if (tasksMap && tasksMap.has(taskId)) {
      return tasksMap.get(taskId)!;
    }
    const found = dbTasks?.find((t) => t.id === taskId);
    return found?.name || 'Tác vụ';
  };

  // UI-SPEC: When 0 timers active, return null to eliminate visual clutter
  if (!activeTimers || activeTimers.length === 0) {
    return null;
  }

  // D-01, D-02: Single active timer capsule
  if (activeTimers.length === 1) {
    const timer = activeTimers[0]!;
    const taskTitle = getTaskTitle(timer.taskId);
    const elapsedSec = getElapsedSeconds(timer.taskId);
    const isRunning = timer.status === 'running';

    return (
      <div
        data-testid="active-timer-capsule"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '2px 10px',
          background: token.colorFillAlter,
          borderRadius: 16,
          border: `1px solid ${token.colorBorderSecondary}`,
          height: 32,
        }}
      >
        <span
          data-testid="timer-status-indicator"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: isRunning ? token.colorSuccess : token.colorWarning,
            display: 'inline-block',
          }}
        />
        <Tooltip title={taskTitle}>
          <Typography.Text
            ellipsis
            style={{
              maxWidth: 120,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {taskTitle}
          </Typography.Text>
        </Tooltip>
        <Typography.Text
          data-testid="elapsed-ticker"
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontSize: 13,
            fontWeight: 600,
            color: isRunning ? token.colorSuccess : token.colorWarning,
          }}
        >
          {formatElapsedTicker(elapsedSec)}
        </Typography.Text>
        <Space orientation="horizontal" size={2}>
          {isRunning ? (
            <Button
              type="text"
              size="small"
              icon={<PauseCircleOutlined style={{ fontSize: 16, color: token.colorWarning }} />}
              onClick={() => pauseTimer(timer.taskId)}
              aria-label="Tạm dừng"
              style={{ minWidth: 24, minHeight: 24, padding: 0 }}
            />
          ) : (
            <Button
              type="text"
              size="small"
              icon={<PlayCircleOutlined style={{ fontSize: 16, color: token.colorSuccess }} />}
              onClick={() => startTimer(timer.taskId)}
              aria-label="Tiếp tục"
              style={{ minWidth: 24, minHeight: 24, padding: 0 }}
            />
          )}
          <Button
            type="text"
            size="small"
            icon={<CheckCircleOutlined style={{ fontSize: 16, color: token.colorPrimary }} />}
            onClick={() => finishTimer(timer.taskId)}
            aria-label="Kết thúc phiên"
            style={{ minWidth: 24, minHeight: 24, padding: 0 }}
          />
        </Space>
      </div>
    );
  }

  // D-02, D-05: Multi-timer dropdown
  const menuItems: MenuProps['items'] = activeTimers.map((timer) => {
    const taskTitle = getTaskTitle(timer.taskId);
    const elapsedSec = getElapsedSeconds(timer.taskId);
    const isRunning = timer.status === 'running';

    return {
      key: timer.taskId,
      label: (
        <div
          data-testid={`timer-row-${timer.taskId}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            minWidth: 240,
            padding: '4px 0',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: isRunning ? token.colorSuccess : token.colorWarning,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <Tooltip title={taskTitle}>
              <Typography.Text ellipsis style={{ maxWidth: 110, fontSize: 13 }}>
                {taskTitle}
              </Typography.Text>
            </Tooltip>
          </div>
          <Typography.Text
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontSize: 13,
              fontWeight: 600,
              color: isRunning ? token.colorSuccess : token.colorWarning,
            }}
          >
            {formatElapsedTicker(elapsedSec)}
          </Typography.Text>
          <Space orientation="horizontal" size={2}>
            {isRunning ? (
              <Button
                type="text"
                size="small"
                icon={<PauseCircleOutlined style={{ fontSize: 14, color: token.colorWarning }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  pauseTimer(timer.taskId);
                }}
                aria-label="Tạm dừng"
                style={{ minWidth: 24, minHeight: 24, padding: 0 }}
              />
            ) : (
              <Button
                type="text"
                size="small"
                icon={<PlayCircleOutlined style={{ fontSize: 14, color: token.colorSuccess }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  startTimer(timer.taskId);
                }}
                aria-label="Tiếp tục"
                style={{ minWidth: 24, minHeight: 24, padding: 0 }}
              />
            )}
            <Button
              type="text"
              size="small"
              icon={<CheckCircleOutlined style={{ fontSize: 14, color: token.colorPrimary }} />}
              onClick={(e) => {
                e.stopPropagation();
                finishTimer(timer.taskId);
              }}
              aria-label="Kết thúc phiên"
              style={{ minWidth: 24, minHeight: 24, padding: 0 }}
            />
          </Space>
        </div>
      ),
    };
  });

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
      <Badge count={activeTimers.length} overflowCount={99} color={token.colorSuccess} offset={[-2, 4]}>
        <Button
          type="text"
          icon={<ClockCircleOutlined style={{ fontSize: 18, color: token.colorSuccess }} />}
          aria-label={`${activeTimers.length} timer đang chạy`}
          style={{ minHeight: 36, minWidth: 36 }}
        />
      </Badge>
    </Dropdown>
  );
};
