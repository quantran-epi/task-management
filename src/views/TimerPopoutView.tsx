import React, { useEffect, useState } from 'react';
import { Space, Typography, Tooltip, Button, theme, Badge } from 'antd';
import {
  PauseCircleOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  PushpinOutlined,
  PushpinFilled,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type TaskPlannerDatabase } from '../db';
import { useTimer } from '../hooks/useTimer';
import { formatElapsedTicker } from '../utils/time';
import {
  isTauriApp,
  isWindowAlwaysOnTop,
  setWindowAlwaysOnTop,
} from '../utils/timerPopout';

export interface TimerPopoutViewProps {
  database?: TaskPlannerDatabase;
}

export const TimerPopoutView: React.FC<TimerPopoutViewProps> = ({
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

  const [pinned, setPinned] = useState<boolean>(true);
  const [isTauri] = useState<boolean>(() => isTauriApp());

  // Check initial alwaysOnTop state if in Tauri
  useEffect(() => {
    if (isTauri) {
      isWindowAlwaysOnTop().then((state) => {
        setPinned(state);
      });
    }
  }, [isTauri]);

  const handleTogglePin = async () => {
    const next = !pinned;
    setPinned(next);
    if (isTauri) {
      await setWindowAlwaysOnTop(next);
    }
  };

  // Load task names for active timers
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
    const found = dbTasks?.find((t) => t.id === taskId);
    return found?.name || 'Tác vụ';
  };

  return (
    <div
      data-testid="timer-popout-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100%',
        padding: '8px 12px',
        boxSizing: 'border-box',
        background: token.colorBgContainer,
        color: token.colorText,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Top Header Bar */}
      <div
        data-testid="timer-popout-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 6,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          marginBottom: 6,
          flexShrink: 0,
        }}
      >
        <Space orientation="horizontal" size={6} style={{ alignItems: 'center' }}>
          <ClockCircleOutlined style={{ color: token.colorPrimary, fontSize: 14 }} />
          <Typography.Text strong style={{ fontSize: 13 }}>
            Bộ đếm thời gian
          </Typography.Text>
          {activeTimers.length > 0 && (
            <Badge
              count={activeTimers.length}
              size="small"
              style={{ backgroundColor: token.colorPrimary }}
            />
          )}
        </Space>

        <Space orientation="horizontal" size={4}>
          <Tooltip title={pinned ? 'Bỏ ghim trên cùng' : 'Ghim trên cùng (Always on top)'}>
            <Button
              type={pinned ? 'primary' : 'text'}
              size="small"
              icon={pinned ? <PushpinFilled /> : <PushpinOutlined />}
              onClick={handleTogglePin}
              aria-label={pinned ? 'Bỏ ghim' : 'Ghim trên cùng'}
              style={{
                width: 26,
                height: 26,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </Tooltip>
        </Space>
      </div>

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: activeTimers.length <= 1 ? 'center' : 'flex-start',
          gap: 6,
        }}
      >
        {activeTimers.length === 0 ? (
          <div
            data-testid="timer-popout-empty"
            style={{
              textAlign: 'center',
              padding: '16px 8px',
              color: token.colorTextSecondary,
            }}
          >
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Không có bộ đếm nào đang chạy
            </Typography.Text>
          </div>
        ) : activeTimers.length === 1 ? (
          /* Single Timer Prominent Layout */
          (() => {
            const timer = activeTimers[0]!;
            const taskTitle = getTaskTitle(timer.taskId);
            const elapsedSec = getElapsedSeconds(timer.taskId);
            const isRunning = timer.status === 'running';

            return (
              <div
                data-testid={`popout-timer-row-${timer.taskId}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: token.colorFillAlter,
                  borderRadius: token.borderRadiusLG,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                  <span
                    data-testid="popout-status-indicator"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: isRunning ? token.colorSuccess : token.colorWarning,
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  <Tooltip title={taskTitle}>
                    <Typography.Text
                      ellipsis
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        maxWidth: 130,
                      }}
                    >
                      {taskTitle}
                    </Typography.Text>
                  </Tooltip>
                </div>

                <Typography.Text
                  data-testid="popout-elapsed-ticker"
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 15,
                    fontWeight: 700,
                    color: isRunning ? token.colorSuccess : token.colorWarning,
                    flexShrink: 0,
                  }}
                >
                  {formatElapsedTicker(elapsedSec)}
                </Typography.Text>

                <Space orientation="horizontal" size={2} style={{ flexShrink: 0 }}>
                  {isRunning ? (
                    <Button
                      type="text"
                      size="small"
                      icon={<PauseCircleOutlined style={{ fontSize: 18, color: token.colorWarning }} />}
                      onClick={() => pauseTimer(timer.taskId)}
                      aria-label="Tạm dừng"
                      style={{ minWidth: 26, minHeight: 26, padding: 0 }}
                    />
                  ) : (
                    <Button
                      type="text"
                      size="small"
                      icon={<PlayCircleOutlined style={{ fontSize: 18, color: token.colorSuccess }} />}
                      onClick={() => startTimer(timer.taskId)}
                      aria-label="Tiếp tục"
                      style={{ minWidth: 26, minHeight: 26, padding: 0 }}
                    />
                  )}
                  <Button
                    type="text"
                    size="small"
                    icon={<CheckCircleOutlined style={{ fontSize: 18, color: token.colorPrimary }} />}
                    onClick={() => finishTimer(timer.taskId)}
                    aria-label="Kết thúc phiên"
                    style={{ minWidth: 26, minHeight: 26, padding: 0 }}
                  />
                </Space>
              </div>
            );
          })()
        ) : (
          /* Multi-Timer Stacked List Layout */
          <div
            data-testid="popout-multi-timer-list"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {activeTimers.map((timer) => {
              const taskTitle = getTaskTitle(timer.taskId);
              const elapsedSec = getElapsedSeconds(timer.taskId);
              const isRunning = timer.status === 'running';

              return (
                <div
                  key={timer.taskId}
                  data-testid={`popout-timer-row-${timer.taskId}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    background: token.colorFillAlter,
                    borderRadius: token.borderRadiusSM,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
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
                      <Typography.Text
                        ellipsis
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          maxWidth: 110,
                        }}
                      >
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
                      flexShrink: 0,
                    }}
                  >
                    {formatElapsedTicker(elapsedSec)}
                  </Typography.Text>

                  <Space orientation="horizontal" size={2} style={{ flexShrink: 0 }}>
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
            })}
          </div>
        )}
      </div>
    </div>
  );
};
