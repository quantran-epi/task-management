import React, { useState, useMemo } from 'react';
import {
  Table,
  Button,
  Select,
  Popover,
  InputNumber,
  Tag,
  Typography,
  Space,
  Empty,
  Card,
  message,
} from 'antd';
import { PlusOutlined, FieldTimeOutlined, EditOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Task, PlannedAllocation, WorkSession, Project, Milestone } from '../../types/models';
import {
  aggregateTaskActualMinutesByDate,
  computeVariance,
  formatMinutes,
} from '../../utils/worklog';
import { createWorkSession } from '../../db/repositories/workSessionRepo';
import { WorkSessionDetailModal } from './WorkSessionDetailModal';

const { Text } = Typography;

export interface ActualWorklogPlannerProps {
  weekStart: Dayjs;
  weekDates: string[]; // 7 calendar dates YYYY-MM-DD (Mon - Sun)
  db?: TaskPlannerDatabase | undefined;
}

interface TableRowData {
  taskId: string;
  task: Task;
  project?: Project | undefined;
  milestone?: Milestone | undefined;
}

export const ActualWorklogPlanner: React.FC<ActualWorklogPlannerProps> = ({
  weekStart,
  weekDates,
  db = defaultDb,
}) => {
  const [adHocTaskIds, setAdHocTaskIds] = useState<string[]>([]);
  const [selectedTaskIdToAdd, setSelectedTaskIdToAdd] = useState<string | undefined>(undefined);

  // Quick entry popover state: key is `${taskId}_${date}`
  const [popoverOpenKey, setPopoverOpenKey] = useState<string | null>(null);
  const [quickMinutes, setQuickMinutes] = useState<number>(30);
  const [submittingQuick, setSubmittingQuick] = useState<boolean>(false);

  // Detail modal state
  const [detailModalProps, setDetailModalProps] = useState<{
    open: boolean;
    taskId: string;
    taskName?: string;
    date: string;
  }>({
    open: false,
    taskId: '',
    date: '',
  });

  // Query planned allocations, work sessions, tasks, projects, milestones for the week
  const startDateStr = weekDates[0] ?? weekStart.format('YYYY-MM-DD');
  const endDateStr = weekDates[6] ?? weekStart.add(6, 'day').format('YYYY-MM-DD');

  const allocations = useLiveQuery(
    async () => {
      return await db.plannedAllocations
        .where('date')
        .between(startDateStr, endDateStr, true, true)
        .toArray();
    },
    [db, startDateStr, endDateStr],
    []
  );

  const workSessions = useLiveQuery(
    async () => {
      // Find all work sessions whose date or startTime falls in the week
      return await db.workSessions
        .where('date')
        .between(startDateStr, endDateStr, true, true)
        .toArray();
    },
    [db, startDateStr, endDateStr],
    []
  );

  const allTasks = useLiveQuery(
    async () => {
      return await db.tasks.toArray();
    },
    [db],
    []
  );

  const allProjects = useLiveQuery(
    async () => {
      return await db.projects.toArray();
    },
    [db],
    []
  );

  const allMilestones = useLiveQuery(
    async () => {
      return await db.milestones.toArray();
    },
    [db],
    []
  );

  const taskMap = useMemo(() => {
    return new Map<string, Task>((allTasks ?? []).map((t) => [t.id, t]));
  }, [allTasks]);

  const projectMap = useMemo(() => {
    return new Map<string, Project>((allProjects ?? []).map((p) => [p.id, p]));
  }, [allProjects]);

  const milestoneMap = useMemo(() => {
    return new Map<string, Milestone>((allMilestones ?? []).map((m) => [m.id, m]));
  }, [allMilestones]);

  // Aggregate actual minutes by taskId and date (D-28, D-30)
  const actualMinutesByTaskDate = useMemo(() => {
    return aggregateTaskActualMinutesByDate(workSessions ?? []);
  }, [workSessions]);

  // Planned minutes lookup: taskId -> (date -> plannedMinutes)
  const plannedMinutesByTaskDate = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const alloc of allocations ?? []) {
      if (!map.has(alloc.taskId)) {
        map.set(alloc.taskId, new Map<string, number>());
      }
      const taskDateMap = map.get(alloc.taskId)!;
      taskDateMap.set(alloc.date, (taskDateMap.get(alloc.date) ?? 0) + alloc.allocatedMinutes);
    }
    return map;
  }, [allocations]);

  // Determine all distinct task IDs that have planned allocations or work sessions during the week (D-27)
  // Plus any ad-hoc added tasks
  const distinctTaskIds = useMemo(() => {
    const set = new Set<string>();
    for (const alloc of allocations ?? []) {
      set.add(alloc.taskId);
    }
    for (const session of workSessions ?? []) {
      set.add(session.taskId);
    }
    for (const id of adHocTaskIds) {
      set.add(id);
    }
    return Array.from(set);
  }, [allocations, workSessions, adHocTaskIds]);

  const tableData: TableRowData[] = useMemo(() => {
    const rows: TableRowData[] = [];
    for (const taskId of distinctTaskIds) {
      const task = taskMap.get(taskId);
      if (!task) continue;
      const project = task.projectId ? projectMap.get(task.projectId) : undefined;
      const milestone = task.milestoneId ? milestoneMap.get(task.milestoneId) : undefined;
      rows.push({
        taskId,
        task,
        project,
        milestone,
      });
    }
    return rows.sort((a, b) => a.task.name.localeCompare(b.task.name));
  }, [distinctTaskIds, taskMap, projectMap, milestoneMap]);

  // Candidates for "Thêm công việc" dropdown: active tasks not already in distinctTaskIds
  const candidateTasksToAdd = useMemo(() => {
    return (allTasks ?? [])
      .filter((t) => t.status !== 'Done' && t.status !== 'Cancelled')
      .filter((t) => !distinctTaskIds.includes(t.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allTasks, distinctTaskIds]);

  const handleAddTask = (taskId: string) => {
    if (!taskId) return;
    setAdHocTaskIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
    setSelectedTaskIdToAdd(undefined);
  };

  // Quick minute entry submit (D-29)
  const handleSaveQuickMinutes = async (taskId: string, date: string) => {
    if (!quickMinutes || quickMinutes < 1 || quickMinutes > 1440) {
      message.error('Số phút phải là số nguyên từ 1 đến 1440 (T-13.1-10)');
      return;
    }

    setSubmittingQuick(true);
    try {
      const targetDate = dayjs(date, 'YYYY-MM-DD');
      const now = dayjs();
      // Use current hour/minute on the target date or default to 09:00
      const startDayjs = targetDate
        .hour(now.hour())
        .minute(now.minute())
        .second(0);
      const endDayjs = startDayjs.add(quickMinutes, 'minute');

      await createWorkSession(
        {
          taskId,
          startTime: startDayjs.toISOString(),
          endTime: endDayjs.toISOString(),
          durationMinutes: Math.floor(quickMinutes),
          note: 'Quick entry từ bảng công việc thực tế',
        },
        db
      );

      message.success('Đã lưu thời gian thực tế');
      setPopoverOpenKey(null);
    } catch (err: any) {
      message.error(err?.message || 'Không thể lưu thời gian');
    } finally {
      setSubmittingQuick(false);
    }
  };

  // Calculate week totals for Planned, Actual, and Variance
  const weekTotals = useMemo(() => {
    let plannedTotal = 0;
    let actualTotal = 0;

    for (const alloc of allocations ?? []) {
      plannedTotal += alloc.allocatedMinutes;
    }

    for (const [, dateMap] of actualMinutesByTaskDate) {
      for (const date of weekDates) {
        actualTotal += dateMap.get(date) ?? 0;
      }
    }

    const variance = computeVariance(actualTotal, plannedTotal);
    return {
      planned: plannedTotal,
      actual: actualTotal,
      variance,
    };
  }, [allocations, actualMinutesByTaskDate, weekDates]);

  // Table columns: Task name, 7 weekdays, Total
  const columns = [
    {
      title: 'Tác vụ',
      dataIndex: 'task',
      key: 'task',
      fixed: 'left' as const,
      width: 240,
      render: (_: unknown, record: TableRowData) => {
        const subtitleParts: string[] = [];
        if (record.project?.name) subtitleParts.push(record.project.name);
        if (record.milestone?.name) subtitleParts.push(record.milestone.name);
        const subtitle = subtitleParts.join(' › ');

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Text strong style={{ fontSize: 13, lineHeight: 1.3 }}>
              {record.task.name}
            </Text>
            {subtitle && (
              <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>
                {subtitle}
              </Text>
            )}
          </div>
        );
      },
    },
    ...weekDates.map((date) => {
      const dayDate = dayjs(date, 'YYYY-MM-DD');
      const dayLabel = dayDate.format('ddd (DD/MM)');

      return {
        title: (
          <div style={{ textAlign: 'center' }}>
            <div>{dayLabel}</div>
          </div>
        ),
        key: date,
        width: 140,
        render: (_: unknown, record: TableRowData) => {
          const plannedMins = plannedMinutesByTaskDate.get(record.taskId)?.get(date) ?? 0;
          const actualMins = actualMinutesByTaskDate.get(record.taskId)?.get(date) ?? 0;
          const variance = computeVariance(actualMins, plannedMins);
          const cellKey = `${record.taskId}_${date}`;
          const isPopoverOpen = popoverOpenKey === cellKey;

          return (
            <Popover
              trigger="click"
              open={isPopoverOpen}
              onOpenChange={(visible) => {
                if (visible) {
                  setPopoverOpenKey(cellKey);
                  setQuickMinutes(actualMins > 0 ? actualMins : 30);
                } else {
                  setPopoverOpenKey(null);
                }
              }}
              content={
                <div style={{ width: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Text strong style={{ fontSize: 13 }}>
                    Nhập số phút thực tế
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {record.task.name} — {date}
                  </Text>
                  <InputNumber
                    min={1}
                    max={1440}
                    value={quickMinutes}
                    onChange={(val) => setQuickMinutes(val ?? 30)}
                    style={{ width: '100%' }}
                    placeholder="Số phút..."
                    addonAfter="phút"
                    autoFocus
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setPopoverOpenKey(null);
                        setDetailModalProps({
                          open: true,
                          taskId: record.taskId,
                          taskName: record.task.name,
                          date,
                        });
                      }}
                    >
                      Chi tiết...
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      loading={submittingQuick}
                      onClick={() => handleSaveQuickMinutes(record.taskId, date)}
                    >
                      Lưu thời gian
                    </Button>
                  </div>
                </div>
              }
            >
              <div
                style={{
                  cursor: 'pointer',
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: '1px solid #f0f0f0',
                  backgroundColor: actualMins > 0 ? '#fafafa' : '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  minHeight: 52,
                }}
              >
                {/* Line 1: Planned vs Actual */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <Text type="secondary">
                    {plannedMins > 0 ? `P: ${formatMinutes(plannedMins)}` : 'P: —'}
                  </Text>
                  <Text strong style={{ color: actualMins > 0 ? '#1677ff' : '#8c8c8c' }}>
                    {actualMins > 0 ? `A: ${formatMinutes(actualMins)}` : 'A: —'}
                  </Text>
                </div>

                {/* Line 2: Variance tag */}
                {(plannedMins > 0 || actualMins > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Tag
                      color={
                        variance.status === 'warning'
                          ? 'orange'
                          : variance.varianceMinutes === 0
                          ? 'green'
                          : 'default'
                      }
                      style={{ margin: 0, fontSize: 11, padding: '0 4px', lineHeight: '18px' }}
                    >
                      {variance.formatted}
                    </Tag>
                  </div>
                )}
              </div>
            </Popover>
          );
        },
      };
    }),
    {
      title: 'Tổng tuần',
      key: 'weekTotal',
      fixed: 'right' as const,
      width: 140,
      render: (_: unknown, record: TableRowData) => {
        let taskPlanned = 0;
        let taskActual = 0;

        for (const date of weekDates) {
          taskPlanned += plannedMinutesByTaskDate.get(record.taskId)?.get(date) ?? 0;
          taskActual += actualMinutesByTaskDate.get(record.taskId)?.get(date) ?? 0;
        }

        const variance = computeVariance(taskActual, taskPlanned);

        return (
          <div
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              backgroundColor: '#f5f5f5',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <Text type="secondary">P: {formatMinutes(taskPlanned)}</Text>
              <Text strong>A: {formatMinutes(taskActual)}</Text>
            </div>
            {(taskPlanned > 0 || taskActual > 0) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Tag
                  color={
                    variance.status === 'warning'
                      ? 'orange'
                      : variance.varianceMinutes === 0
                      ? 'green'
                      : 'default'
                  }
                  style={{ margin: 0, fontSize: 11 }}
                >
                  {variance.formatted}
                </Tag>
              </div>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Actual Worklog Toolbar: Searchable Add Task & Week Total Chips */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          backgroundColor: '#ffffff',
          borderRadius: 8,
          border: '1px solid #f0f0f0',
        }}
      >
        <Space wrap size="middle">
          <Select
            showSearch
            allowClear
            value={selectedTaskIdToAdd}
            onChange={setSelectedTaskIdToAdd}
            placeholder="Thêm tác vụ vào bảng..."
            style={{ width: 280 }}
            filterOption={(input, option) =>
              (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={candidateTasksToAdd.map((t) => ({
              value: t.id,
              label: t.name,
            }))}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!selectedTaskIdToAdd}
            onClick={() => selectedTaskIdToAdd && handleAddTask(selectedTaskIdToAdd)}
          >
            Thêm tác vụ
          </Button>
        </Space>

        <Space wrap size="middle">
          <Tag color="blue" style={{ fontSize: 13, padding: '4px 10px' }}>
            Kế hoạch: {formatMinutes(weekTotals.planned)}
          </Tag>
          <Tag color="purple" style={{ fontSize: 13, padding: '4px 10px' }}>
            Thực tế: {formatMinutes(weekTotals.actual)}
          </Tag>
          <Tag
            color={
              weekTotals.variance.status === 'warning'
                ? 'orange'
                : weekTotals.variance.varianceMinutes === 0
                ? 'green'
                : 'default'
            }
            style={{ fontSize: 13, padding: '4px 10px' }}
          >
            Chênh lệch: {weekTotals.variance.formatted}
          </Tag>
        </Space>
      </div>

      {/* Grid Table */}
      {tableData.length === 0 ? (
        <Card>
          <Empty
            description={
              <div>
                <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>
                  Chưa có kế hoạch hoặc thời gian thực tế trong tuần này
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Các tác vụ có kế hoạch hoặc phiên làm việc sẽ tự xuất hiện tại đây. Dùng "Thêm tác vụ" để ghi thời gian cho tác vụ khác.
                </Text>
              </div>
            }
          />
        </Card>
      ) : (
        <Table
          columns={columns}
          dataSource={tableData}
          rowKey="taskId"
          pagination={false}
          scroll={{ x: 1200 }}
          bordered
          size="middle"
          style={{ backgroundColor: '#ffffff', borderRadius: 8 }}
        />
      )}

      {/* Work Session Detail Modal */}
      <WorkSessionDetailModal
        open={detailModalProps.open}
        taskId={detailModalProps.taskId}
        taskName={detailModalProps.taskName}
        date={detailModalProps.date}
        onClose={() =>
          setDetailModalProps((prev) => ({
            ...prev,
            open: false,
          }))
        }
        db={db}
      />
    </div>
  );
};
