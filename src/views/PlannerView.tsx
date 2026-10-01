import React, { useState, useEffect, useMemo } from 'react';
import { Button, Switch, Space, Typography, Grid, Modal, Select, Segmented } from 'antd';
import { PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { useWeeklyPlanner } from '../hooks/useWeeklyPlanner';
import { WeekNavigator } from '../components/planner/WeekNavigator';
import { DayColumn } from '../components/planner/DayColumn';
import { AllocationModal } from '../components/planner/AllocationModal';
import { CapacitySettingsModal } from '../components/planner/CapacitySettingsModal';
import { FeasibilityModal } from '../components/planner/FeasibilityModal';
import { DayInsightPanel } from '../components/planner/DayInsightPanel';
import { ActualWorklogPlanner } from '../components/planner/ActualWorklogPlanner';
import { useDayInsight } from '../hooks/useDayInsight';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { getTodayDateString } from '../utils/date';
import type { Task, Project } from '../types/models';

dayjs.extend(isoWeek);

const { Text } = Typography;

export interface PlannerViewProps {
  db?: TaskPlannerDatabase | undefined;
  initialDate?: string | undefined;
  targetDate?: string | undefined;
}

export const PlannerView: React.FC<PlannerViewProps> = ({
  db = defaultDb,
  initialDate,
  targetDate,
}) => {
  const [currentDate, setCurrentDate] = useState<string>(
    () => targetDate ?? initialDate ?? getTodayDateString()
  );
  const [plannerMode, setPlannerMode] = useState<'planned' | 'actual'>('planned');
  const [showCompleted, setShowCompleted] = useState<boolean>(false);
  const [allocationModalOpen, setAllocationModalOpen] = useState<boolean>(false);
  const [allocationModalDate, setAllocationModalDate] = useState<string | undefined>(undefined);
  const [capacityModalOpen, setCapacityModalOpen] = useState<boolean>(false);
  const [taskDrawerTaskId, setTaskDrawerTaskId] = useState<string | undefined>(undefined);
  const [feasibilityTask, setFeasibilityTask] = useState<Task | null>(null);
  const [feasibilityModalOpen, setFeasibilityModalOpen] = useState<boolean>(false);
  const [taskSelectModalOpen, setTaskSelectModalOpen] = useState<boolean>(false);
  const [selectedTaskIdForFeasibility, setSelectedTaskIdForFeasibility] = useState<string | undefined>(undefined);
  const [selectedProjectIdForFilter, setSelectedProjectIdForFilter] = useState<string | undefined>(undefined);
  const [insightDate, setInsightDate] = useState<string | undefined>(undefined);

  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;

  const weeklyState = useWeeklyPlanner(currentDate, db);

  const activeTasks = useLiveQuery(
    async () => {
      const all = await db.tasks.toArray();
      return all
        .filter((t) => t.status !== 'Done' && t.status !== 'Cancelled')
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    [db],
    []
  );

  const projects = useLiveQuery(
    async () => {
      const all = await db.projects.toArray();
      return all.sort((a, b) => a.name.localeCompare(b.name));
    },
    [db],
    []
  );

  const projectMap = useMemo(() => {
    return new Map<string, Project>((projects ?? []).map((p) => [p.id, p]));
  }, [projects]);

  const filteredSelectableTasks = useMemo(() => {
    if (!activeTasks) return [];
    if (!selectedProjectIdForFilter) return activeTasks;
    return activeTasks.filter((t) => t.projectId === selectedProjectIdForFilter);
  }, [activeTasks, selectedProjectIdForFilter]);

  // Synchronize calendar date when targetDate changes via deep-link (D-13, D-16, T-05-07)
  useEffect(() => {
    if (targetDate && dayjs(targetDate, 'YYYY-MM-DD').isValid()) {
      setCurrentDate(targetDate);
    }
  }, [targetDate]);

  const handleOpenFeasibility = async (task?: Task) => {
    setSelectedProjectIdForFilter(undefined);
    if (task) {
      setFeasibilityTask(task);
      setFeasibilityModalOpen(true);
      return;
    }
    const all = await db.tasks.toArray();
    const active = all
      .filter((t) => t.status !== 'Done' && t.status !== 'Cancelled')
      .sort((a, b) => a.name.localeCompare(b.name));
    const tasksWithEst = active.filter((t) => t.estimateMinutes > 0);
    if (tasksWithEst.length === 1) {
      setFeasibilityTask(tasksWithEst[0]!);
      setFeasibilityModalOpen(true);
    } else if (tasksWithEst.length > 1) {
      setSelectedTaskIdForFeasibility(tasksWithEst[0]?.id);
      setTaskSelectModalOpen(true);
    } else if (active.length > 0) {
      setSelectedTaskIdForFeasibility(active[0]?.id);
      setTaskSelectModalOpen(true);
    }
  };

  // Keyboard navigation shortcuts: Alt+ArrowLeft, Alt+ArrowRight, Alt+T, KeyP, KeyN (D-02)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          Boolean(target.isContentEditable) ||
          target.getAttribute?.('contenteditable') === 'true' ||
          target.getAttribute?.('contenteditable') === '' ||
          Boolean(target.closest?.('[contenteditable="true"], [contenteditable=""]')) ||
          target.getAttribute?.('role') === 'textbox');

      if (isInput) return;

      const curr = dayjs(currentDate, 'YYYY-MM-DD').isValid()
        ? dayjs(currentDate, 'YYYY-MM-DD')
        : dayjs();

      if ((e.altKey && e.key === 'ArrowLeft') || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setCurrentDate(curr.subtract(1, 'week').startOf('isoWeek').format('YYYY-MM-DD'));
      } else if ((e.altKey && e.key === 'ArrowRight') || e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setCurrentDate(curr.add(1, 'week').startOf('isoWeek').format('YYYY-MM-DD'));
      } else if ((e.altKey && (e.key === 't' || e.key === 'T')) || ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        setCurrentDate(getTodayDateString());
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentDate]);

  const handleOpenAllocate = (date?: string) => {
    setAllocationModalDate(date ?? currentDate);
    setAllocationModalOpen(true);
  };

  const currentWeekStart = useMemo(() => {
    return dayjs(currentDate, 'YYYY-MM-DD').isValid()
      ? dayjs(currentDate, 'YYYY-MM-DD').startOf('isoWeek')
      : dayjs().startOf('isoWeek');
  }, [currentDate]);

  const currentWeekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) =>
      currentWeekStart.add(i, 'day').format('YYYY-MM-DD')
    );
  }, [currentWeekStart]);

  return (
    <div data-testid="planner-view" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Toolbar: Week Navigator + Segmented Subview + Controls (D-02, D-05, D-16, D-26) */}
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
          <WeekNavigator
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            onOpenCapacitySettings={() => setCapacityModalOpen(true)}
          />

          <Segmented<'planned' | 'actual'>
            value={plannerMode}
            onChange={(val) => setPlannerMode(val)}
            options={[
              { label: 'Kế hoạch', value: 'planned' },
              { label: 'Thực tế', value: 'actual' },
            ]}
          />
        </Space>

        {plannerMode === 'planned' && (
          <Space wrap size="middle">
            <Space size={6} align="center">
              <Switch
                checked={showCompleted}
                onChange={setShowCompleted}
                id="show-completed-toggle"
                aria-label="Hiện tác vụ hoàn thành"
              />
              <Text style={{ fontSize: 13, userSelect: 'none' }}>Hiện tác vụ hoàn thành</Text>
            </Space>

            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleOpenAllocate()}
              aria-label="Phân bổ tác vụ"
            >
              Phân bổ tác vụ
            </Button>

            <Button
              icon={<ThunderboltOutlined />}
              onClick={() => handleOpenFeasibility()}
              aria-label="Tự động phân bổ"
            >
              Tự động phân bổ
            </Button>
          </Space>
        )}
      </div>

      {/* Main Subview Content */}
      {plannerMode === 'actual' ? (
        <ActualWorklogPlanner
          weekStart={currentWeekStart}
          weekDates={currentWeekDates}
          db={db}
        />
      ) : (
        /* Weekly Grid (D-01, D-04) */
        <div
          data-testid="planner-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(7, minmax(230px, 1fr))',
            gap: 12,
            overflowX: isMobile ? 'visible' : 'auto',
            minHeight: 520,
            alignItems: 'stretch',
          }}
        >
          {weeklyState.days.map((day) => (
            <DayColumn
              key={day.date}
              day={day}
              showCompleted={showCompleted}
              onAllocate={(date) => handleOpenAllocate(date)}
              onEditCapacity={() => setCapacityModalOpen(true)}
              onTaskClick={(taskId) => setTaskDrawerTaskId(taskId)}
              onOpenInsight={(date) => setInsightDate(date)}
              db={db}
            />
          ))}
        </div>
      )}

      {/* Allocation Modal (D-09, D-10) */}
      <AllocationModal
        open={allocationModalOpen}
        initialDate={allocationModalDate}
        onCancel={() => {
          setAllocationModalOpen(false);
          setAllocationModalDate(undefined);
        }}
        onSuccess={() => {
          setAllocationModalOpen(false);
          setAllocationModalDate(undefined);
        }}
        db={db}
      />

      {/* Capacity Settings Modal (D-05) */}
      <CapacitySettingsModal
        open={capacityModalOpen}
        onCancel={() => setCapacityModalOpen(false)}
        db={db}
      />

      {/* Task Selector Modal for Feasibility */}
      <Modal
        title="Chọn tác vụ để tự động phân bổ"
        open={taskSelectModalOpen}
        onCancel={() => setTaskSelectModalOpen(false)}
        onOk={() => {
          const chosen = (activeTasks ?? []).find((t) => t.id === selectedTaskIdForFeasibility);
          if (chosen) {
            setFeasibilityTask(chosen);
            setTaskSelectModalOpen(false);
            setFeasibilityModalOpen(true);
          }
        }}
        okText="Tiếp tục"
        cancelText="Hủy"
        destroyOnClose
      >
        <div style={{ marginTop: 12, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Text type="secondary">
            Chọn tác vụ để đánh giá công suất và xem trước phân bổ khối lượng công việc:
          </Text>

          {/* Project combobox filter */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Dự án:
            </Text>
            <Select
              allowClear
              showSearch
              placeholder="Lọc theo dự án (Tất cả)"
              style={{ width: '100%' }}
              value={selectedProjectIdForFilter}
              onChange={(newProjId) => {
                setSelectedProjectIdForFilter(newProjId);
                // If currently selected task does not match new project filter, reset selection
                const matchingTasks = !newProjId
                  ? (activeTasks ?? [])
                  : (activeTasks ?? []).filter((t) => t.projectId === newProjId);
                if (!matchingTasks.some((t) => t.id === selectedTaskIdForFeasibility)) {
                  setSelectedTaskIdForFeasibility(matchingTasks[0]?.id);
                }
              }}
              filterOption={(input, option) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={(projects ?? []).map((p) => ({
                value: p.id,
                label: p.name,
              }))}
            />
          </div>

          {/* Task selector with project subtitle */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Tác vụ:
            </Text>
            <Select
              showSearch
              style={{ width: '100%' }}
              value={selectedTaskIdForFeasibility}
              onChange={setSelectedTaskIdForFeasibility}
              placeholder="Chọn một tác vụ"
              filterOption={(input, option) => {
                const search = input.toLowerCase();
                const task = (activeTasks ?? []).find((t) => t.id === option?.value);
                if (!task) return false;
                const taskMatch = task.name.toLowerCase().includes(search);
                const proj = task.projectId ? projectMap.get(task.projectId) : undefined;
                const projMatch = proj ? proj.name.toLowerCase().includes(search) : false;
                return taskMatch || projMatch;
              }}
              options={filteredSelectableTasks.map((t) => {
                const proj = t.projectId ? projectMap.get(t.projectId) : undefined;
                return {
                  value: t.id,
                  label: `${t.name} (${t.estimateMinutes > 0 ? `${t.estimateMinutes}m` : 'chưa ước tính'})`,
                  projectName: proj?.name,
                };
              })}
              optionRender={(option) => {
                const projName = (option.data as { projectName?: string } | undefined)?.projectName;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0' }}>
                    <Text style={{ lineHeight: 1.3 }}>{option.label}</Text>
                    {projName && (
                      <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>
                        {projName}
                      </Text>
                    )}
                  </div>
                );
              }}
            />
          </div>
        </div>
      </Modal>

      {/* Feasibility & Workload Distribution Modal (D-13, D-16) */}
      <FeasibilityModal
        open={feasibilityModalOpen}
        task={feasibilityTask ?? undefined}
        onCancel={() => setFeasibilityModalOpen(false)}
        onSuccess={() => setFeasibilityModalOpen(false)}
        db={db}
      />

      {/* Task Details Drawer when card is clicked */}
      <TaskDrawer
        taskId={taskDrawerTaskId ?? null}
        open={taskDrawerTaskId !== undefined}
        onClose={() => setTaskDrawerTaskId(undefined)}
        db={db}
      />

      {/* Day Insight Modal — planned vs actual for a single date */}
      <DayInsightModal
        date={insightDate}
        open={insightDate !== undefined}
        onClose={() => setInsightDate(undefined)}
        db={db}
      />
    </div>
  );
};

interface DayInsightModalProps {
  date: string | undefined;
  open: boolean;
  onClose: () => void;
  db: TaskPlannerDatabase;
}

const DayInsightModal: React.FC<DayInsightModalProps> = ({ date, open, onClose, db }) => {
  // Hook must be called unconditionally; feed a sentinel date when closed.
  const data = useDayInsight(date ?? '1970-01-01', db);
  return (
    <Modal
      title="Chi tiết ngày"
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnClose
    >
      {date && <DayInsightPanel data={data} />}
    </Modal>
  );
};
