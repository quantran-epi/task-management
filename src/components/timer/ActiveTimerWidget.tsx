import React from 'react';
import { Space, Typography, Tooltip, Button, Dropdown, Badge, theme, type MenuProps } from 'antd';
import {
  PauseCircleOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type TaskPlannerDatabase } from '../../db';
import { useTimer } from '../../hooks/useTimer';
import { formatElapsedTicker } from '../../utils/time';
import { openTimerPopout } from '../../utils/timerPopout';

export interface ActiveTimerWidgetProps {
  tasksMap?: Map<string, string>;
  database?: TaskPlannerDatabase;
  compact?: boolean;
}

export function formatHierarchySubtitle(
  changeRequest?: { name: string; code?: string } | null,
  system?: { name: string } | null
): string | null {
  const crLabel = changeRequest ? changeRequest.code || changeRequest.name : undefined;
  const parts = [crLabel, system?.name].filter(Boolean);
  return parts.length > 0 ? parts.join(' › ') : null;
}

export const ActiveTimerWidget: React.FC<ActiveTimerWidgetProps> = ({
  tasksMap,
  database = db,
  compact = false,
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

  // Load CR & subsystem hierarchy for active timer tasks (D-04, D-50)
  const hierarchyMap = useLiveQuery(
    async () => {
      if (!dbTasks || dbTasks.length === 0) return new Map<string, string>();
      const crIds = Array.from(new Set(dbTasks.map((t) => t.crId).filter(Boolean))) as string[];
      const systemIds = Array.from(new Set(dbTasks.map((t) => t.systemId).filter(Boolean))) as string[];

      const [changeRequests, systems] = await Promise.all([
        crIds.length > 0 ? database.changeRequests.bulkGet(crIds) : [],
        systemIds.length > 0 ? database.systems.bulkGet(systemIds) : [],
      ]);

      const crMap = new Map(changeRequests.filter(Boolean).map((cr) => [cr!.id, cr!]));
      const systemMap = new Map(systems.filter(Boolean).map((s) => [s!.id, s!]));

      const result = new Map<string, string>();
      for (const t of dbTasks) {
        const cr = t.crId ? crMap.get(t.crId) : undefined;
        const system = t.systemId ? systemMap.get(t.systemId) : undefined;
        const subtitle = formatHierarchySubtitle(cr, system);
        if (subtitle) {
          result.set(t.id, subtitle);
        }
      }
      return result;
    },
    [dbTasks, database]
  );

  const getTaskTitle = (taskId: string): string => {
    if (tasksMap && tasksMap.has(taskId)) {
      return tasksMap.get(taskId)!;
    }
    const found = dbTasks?.find((t) => t.id === taskId);
    return found?.name || 'Tác vụ';
  };

  const getHierarchySubtitle = (taskId: string): string | null => {
    return hierarchyMap?.get(taskId) ?? null;
  };

  // UI-SPEC: When 0 timers active, return null to eliminate visual clutter
  if (!activeTimers || activeTimers.length === 0) {
    return null;
  }

  // D-01, D-02: Single active timer capsule
  if (activeTimers.length === 1) {
    const timer = activeTimers[0]!;
    const taskTitle = getTaskTitle(timer.taskId);
    const subtitle = getHierarchySubtitle(timer.taskId);
    const elapsedSec = getElapsedSeconds(timer.taskId);
    const isRunning = timer.status === 'running';

    return (
      <div
        data-testid="active-timer-capsule"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? 6 : 8,
          padding: compact ? '1px 8px' : '2px 10px',
          background: token.colorFillAlter,
          borderRadius: compact ? 12 : 16,
          border: `1px solid ${token.colorBorderSecondary}`,
          height: compact ? 20 : subtitle ? 36 : 32,
          boxSizing: 'border-box',
        }}
      >
        <span
          data-testid="timer-status-indicator"
          style={{
            width: compact ? 6 : 8,
            height: compact ? 6 : 8,
            borderRadius: '50%',
            backgroundColor: isRunning ? token.colorSuccess : token.colorWarning,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <div style={{ display: 'inline-flex', flexDirection: 'column', maxWidth: compact ? 130 : 120 }}>
          <Tooltip title={subtitle ? `${taskTitle} (${subtitle})` : taskTitle}>
            <Typography.Text
              ellipsis
              style={{
                fontSize: compact ? 11.5 : 13,
                fontWeight: 500,
                lineHeight: compact ? '14px' : 1.2,
              }}
            >
              {taskTitle}
            </Typography.Text>
          </Tooltip>
          {!compact && subtitle && (
            <Typography.Text
              ellipsis
              type="secondary"
              data-testid="capsule-hierarchy-subtitle"
              style={{
                fontSize: 11,
                lineHeight: 1.1,
              }}
            >
              {subtitle}
            </Typography.Text>
          )}
        </div>
        <Typography.Text
          data-testid="elapsed-ticker"
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontSize: compact ? 11.5 : 13,
            fontWeight: 600,
            color: isRunning ? token.colorSuccess : token.colorWarning,
            lineHeight: compact ? '14px' : 1.2,
          }}
        >
          {formatElapsedTicker(elapsedSec)}
        </Typography.Text>
        <Space orientation="horizontal" size={compact ? 1 : 2}>
          {isRunning ? (
            <Button
              type="text"
              size="small"
              icon={<PauseCircleOutlined style={{ fontSize: compact ? 12 : 16, color: token.colorWarning }} />}
              onClick={() => pauseTimer(timer.taskId)}
              aria-label="Tạm dừng"
              style={{ minWidth: compact ? 18 : 24, minHeight: compact ? 18 : 24, width: compact ? 18 : 24, height: compact ? 18 : 24, padding: 0 }}
            />
          ) : (
            <Button
              type="text"
              size="small"
              icon={<PlayCircleOutlined style={{ fontSize: compact ? 12 : 16, color: token.colorSuccess }} />}
              onClick={() => startTimer(timer.taskId)}
              aria-label="Tiếp tục"
              style={{ minWidth: compact ? 18 : 24, minHeight: compact ? 18 : 24, width: compact ? 18 : 24, height: compact ? 18 : 24, padding: 0 }}
            />
          )}
          <Button
            type="text"
            size="small"
            icon={<CheckCircleOutlined style={{ fontSize: compact ? 12 : 16, color: token.colorPrimary }} />}
            onClick={() => finishTimer(timer.taskId)}
            aria-label="Kết thúc phiên"
            style={{ minWidth: compact ? 18 : 24, minHeight: compact ? 18 : 24, width: compact ? 18 : 24, height: compact ? 18 : 24, padding: 0 }}
          />
          <Tooltip title="Mở cửa sổ nổi (Pop out)">
            <Button
              type="text"
              size="small"
              icon={<ExportOutlined style={{ fontSize: compact ? 11 : 13, color: token.colorTextSecondary }} />}
              onClick={() => openTimerPopout()}
              aria-label="Mở cửa sổ nổi"
              style={{ minWidth: compact ? 18 : 24, minHeight: compact ? 18 : 24, width: compact ? 18 : 24, height: compact ? 18 : 24, padding: 0 }}
            />
          </Tooltip>
        </Space>
      </div>
    );
  }

  // D-02, D-05: Multi-timer dropdown
  const timerItems: MenuProps['items'] = activeTimers.map((timer) => {
    const taskTitle = getTaskTitle(timer.taskId);
    const subtitle = getHierarchySubtitle(timer.taskId);
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
            minWidth: 260,
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
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, maxWidth: 130 }}>
              <Tooltip title={taskTitle}>
                <Typography.Text ellipsis style={{ fontSize: 13, lineHeight: 1.2 }}>
                  {taskTitle}
                </Typography.Text>
              </Tooltip>
              {subtitle && (
                <Typography.Text
                  ellipsis
                  type="secondary"
                  data-testid={`dropdown-hierarchy-subtitle-${timer.taskId}`}
                  style={{ fontSize: 11, lineHeight: 1.1 }}
                >
                  {subtitle}
                </Typography.Text>
              )}
            </div>
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

  const menuItems: MenuProps['items'] = [
    {
      key: '__popout_action__',
      label: (
        <div
          data-testid="timer-popout-action"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '2px 0',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            marginBottom: 4,
          }}
          onClick={(e) => {
            e.stopPropagation();
            openTimerPopout();
          }}
        >
          <Typography.Text strong style={{ fontSize: 12 }}>
            {activeTimers.length} bộ đếm đang chạy
          </Typography.Text>
          <Button
            type="link"
            size="small"
            icon={<ExportOutlined style={{ fontSize: 12 }} />}
            style={{ padding: 0, fontSize: 12 }}
            aria-label="Mở cửa sổ nổi"
          >
            Mở cửa sổ nổi
          </Button>
        </div>
      ),
    },
    ...timerItems,
  ];

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
      <Badge
        count={activeTimers.length}
        overflowCount={99}
        color={token.colorSuccess}
        offset={compact ? [-1, 2] : [-2, 4]}
        size={compact ? 'small' : 'default'}
      >
        <Button
          type="text"
          icon={<ClockCircleOutlined style={{ fontSize: compact ? 13 : 18, color: token.colorSuccess }} />}
          aria-label={`${activeTimers.length} timer đang chạy`}
          style={{
            minHeight: compact ? 20 : 36,
            minWidth: compact ? 20 : 36,
            height: compact ? 20 : 36,
            width: compact ? 20 : 36,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />
      </Badge>
    </Dropdown>
  );
};
