import React, { useState, useEffect } from 'react';
import { Button, Switch, Space, Typography, Grid } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { useWeeklyPlanner } from '../hooks/useWeeklyPlanner';
import { WeekNavigator } from '../components/planner/WeekNavigator';
import { DayColumn } from '../components/planner/DayColumn';
import { AllocationModal } from '../components/planner/AllocationModal';
import { CapacitySettingsModal } from '../components/planner/CapacitySettingsModal';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { getTodayDateString } from '../utils/date';

dayjs.extend(isoWeek);

const { Text } = Typography;

export interface PlannerViewProps {
  db?: TaskPlannerDatabase;
  initialDate?: string;
}

export const PlannerView: React.FC<PlannerViewProps> = ({
  db = defaultDb,
  initialDate,
}) => {
  const [currentDate, setCurrentDate] = useState<string>(
    () => initialDate ?? getTodayDateString()
  );
  const [showCompleted, setShowCompleted] = useState<boolean>(false);
  const [allocationModalOpen, setAllocationModalOpen] = useState<boolean>(false);
  const [allocationModalDate, setAllocationModalDate] = useState<string | undefined>(undefined);
  const [capacityModalOpen, setCapacityModalOpen] = useState<boolean>(false);
  const [taskDrawerTaskId, setTaskDrawerTaskId] = useState<string | undefined>(undefined);

  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;

  const weeklyState = useWeeklyPlanner(currentDate, db);

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
              aria-label="Show Completed Tasks"
            />
            <Text style={{ fontSize: 13, userSelect: 'none' }}>Show Completed</Text>
          </Space>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleOpenAllocate()}
            aria-label="Allocate Task"
          >
            + Allocate Task
          </Button>
        </Space>
      </div>

      {/* Weekly Grid (D-01, D-04) */}
      <div
        data-testid="planner-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(7, minmax(180px, 1fr))',
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
        onCancel={() => setAllocationModalOpen(false)}
        onSuccess={() => setAllocationModalOpen(false)}
        db={db}
      />

      {/* Capacity Settings Modal (D-05) */}
      <CapacitySettingsModal
        open={capacityModalOpen}
        onCancel={() => setCapacityModalOpen(false)}
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
