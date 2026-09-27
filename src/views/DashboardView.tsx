import React, { useState } from 'react';
import { Row, Col } from 'antd';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { useDashboardForecast } from '../hooks/useDashboardForecast';
import { TodaySummaryCard } from '../components/dashboard/TodaySummaryCard';
import { AttentionTodayList } from '../components/dashboard/AttentionTodayList';
import { WorkloadForecast } from '../components/dashboard/WorkloadForecast';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import type { AppRoute } from '../types/navigation';

export interface DashboardViewProps {
  db?: TaskPlannerDatabase;
  onNavigate?: (route: AppRoute, params?: Record<string, string>) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  db = defaultDb,
  onNavigate,
}) => {
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const forecast = useDashboardForecast(db);

  const handleDateClick = (date: string) => {
    onNavigate?.('planner', { date });
  };

  const scheduledTodayCount = forecast.attentionTasks.filter(
    (t) => t.category === 'scheduled-today'
  ).length;

  return (
    <div
      data-testid="dashboard-view"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {/* Top Tier: Today Summary (left) & Attention List (right) per D-01 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <TodaySummaryCard
            metrics={forecast.todayMetrics}
            scheduledCount={scheduledTodayCount}
            todayDate={forecast.todayDate}
            onOpenPlanner={() => handleDateClick(forecast.todayDate)}
          />
        </Col>
        <Col xs={24} lg={16}>
          <AttentionTodayList
            items={forecast.attentionTasks}
            onTaskClick={(taskId) => setDrawerTaskId(taskId)}
            onViewAllTasks={() => onNavigate?.('tasks')}
            db={db}
          />
        </Col>
      </Row>

      {/* Bottom Tier: Multi-Horizon Workload Forecast per D-01, D-05 */}
      <WorkloadForecast
        horizon={forecast.horizon}
        onHorizonChange={forecast.setHorizon}
        horizonDays={forecast.horizonDays}
        overloadedDays={forecast.overloadedDays}
        onDateClick={handleDateClick}
      />

      {/* In-place Task Inspection Drawer per D-14 */}
      <TaskDrawer
        taskId={drawerTaskId}
        open={drawerTaskId !== null}
        onClose={() => setDrawerTaskId(null)}
        db={db}
      />
    </div>
  );
};
