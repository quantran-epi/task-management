import React, { useState, useEffect } from 'react';
import { Button, Switch, Space, Typography, Grid, Modal, Select } from 'antd';
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
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { getTodayDateString } from '../utils/date';
import type { Task } from '../types/models';

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
  const [showCompleted, setShowCompleted] = useState<boolean>(false);
  const [allocationModalOpen, setAllocationModalOpen] = useState<boolean>(false);
  const [allocationModalDate, setAllocationModalDate] = useState<string | undefined>(undefined);
  const [capacityModalOpen, setCapacityModalOpen] = useState<boolean>(false);
  const [taskDrawerTaskId, setTaskDrawerTaskId] = useState<string | undefined>(undefined);
  const [feasibilityTask, setFeasibilityTask] = useState<Task | null>(null);
  const [feasibilityModalOpen, setFeasibilityModalOpen] = useState<boolean>(false);
  const [taskSelectModalOpen, setTaskSelectModalOpen] = useState<boolean>(false);
  const [selectedTaskIdForFeasibility, setSelectedTaskIdForFeasibility] = useState<string | undefined>(undefined);

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

  // Synchronize calendar date when targetDate changes via deep-link (D-13, D-16, T-05-07)
  useEffect(() => {
    if (targetDate && dayjs(targetDate, 'YYYY-MM-DD').isValid()) {
      setCurrentDate(targetDate);
    }
  }, [targetDate]);

  const handleOpenFeasibility = async (task?: Task) => {
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

  return (
    <div data-testid="planner-view" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Toolbar: Week Navigator + Controls (D-02, D-05, D-16) */}
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
        <WeekNavigator
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          onOpenCapacitySettings={() => setCapacityModalOpen(true)}
        />

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
      </div>

      {/* Weekly Grid (D-01, D-04) */}
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
            db={db}
          />
        ))}
      </div>

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
        <div style={{ marginTop: 12, marginBottom: 8 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Chọn tác vụ để đánh giá công suất và xem trước phân bổ khối lượng công việc:
          </Text>
          <Select
            style={{ width: '100%' }}
            value={selectedTaskIdForFeasibility}
            onChange={setSelectedTaskIdForFeasibility}
            options={(activeTasks ?? []).map((t) => ({
              value: t.id,
              label: `${t.name} (${t.estimateMinutes > 0 ? `${t.estimateMinutes}m` : 'chưa ước tính'})`,
            }))}
            placeholder="Chọn một tác vụ"
          />
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
    </div>
  );
};
