import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Segmented, Select, Table, Tabs, Empty, Button, Space, Row, Col } from 'antd';
import dayjs from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getAllProjects } from '../db/repositories/projectRepo';
import { getAllMilestones } from '../db/repositories/milestoneRepo';
import {
  calculateMilestoneBurndown,
  calculateCompletionVelocity,
  calculateProjectStatusMetrics,
  calculateStakeholderWorkload,
} from '../utils/analytics';
import { BurndownSvgChart } from '../components/analytics/BurndownSvgChart';
import { StackedStatusBar } from '../components/analytics/StackedStatusBar';
import { VelocityTrendChart } from '../components/analytics/VelocityTrendChart';
import { WorkloadProportionBar } from '../components/analytics/WorkloadProportionBar';
import { WorkTypeBadge } from '../components/tasks/WorkTypeBadge';
import type {
  BurndownUnit,
  VelocityWindowWeeks,
  WorkloadDimension,
  WorkloadDistributionItem,
  ProjectStatusMetrics,
} from '../types/analytics';
import type { AppRoute } from '../types/navigation';
import type { Milestone } from '../types/models';

export interface AnalyticsViewProps {
  initialMilestoneId?: string | undefined;
  onNavigate?: ((route: AppRoute, params?: Record<string, string>) => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
}

/**
 * Finds default milestone: prefers open milestone with nearest deadline per D-15.
 */
function findDefaultMilestone(milestones: Milestone[], initialId?: string | undefined): string | undefined {
  if (initialId && milestones.some((m) => m.id === initialId)) {
    return initialId;
  }
  const openMilestones = milestones.filter((m) => m.status !== 'Done');
  if (openMilestones.length > 0) {
    const sorted = [...openMilestones].sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    });
    return sorted[0]?.id;
  }
  return milestones[0]?.id;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  initialMilestoneId,
  onNavigate,
  db = defaultDb,
}) => {
  const todayStr = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

  // Live queries from IndexedDB
  const projects = useLiveQuery(() => getAllProjects(db), [db]) ?? [];
  const milestones = useLiveQuery(() => getAllMilestones(db), [db]) ?? [];
  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [];

  // Local dashboard state
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | undefined>(initialMilestoneId);
  const [burndownUnit, setBurndownUnit] = useState<BurndownUnit>('hours');
  const [velocityWindowWeeks, setVelocityWindowWeeks] = useState<VelocityWindowWeeks>(4);
  const [workloadDimension, setWorkloadDimension] = useState<WorkloadDimension>('opsOwners');
  const [includeDoneWorkload, setIncludeDoneWorkload] = useState<boolean>(false);
  const prevInitialMilestoneIdRef = useRef(initialMilestoneId);

  // Sync / auto-select milestone per D-15
  useEffect(() => {
    if (initialMilestoneId !== prevInitialMilestoneIdRef.current) {
      prevInitialMilestoneIdRef.current = initialMilestoneId;
      if (initialMilestoneId && milestones.some((m) => m.id === initialMilestoneId)) {
        setSelectedMilestoneId(initialMilestoneId);
        return;
      }
    }
    if (selectedMilestoneId && milestones.some((m) => m.id === selectedMilestoneId)) {
      return;
    }
    if (milestones.length === 0) {
      setSelectedMilestoneId(undefined);
      return;
    }
    setSelectedMilestoneId(findDefaultMilestone(milestones, initialMilestoneId));
  }, [initialMilestoneId, milestones, selectedMilestoneId]);

  // T-13-05: Memoize computations to avoid DoS on frequent renders
  const selectedMilestone = useMemo(() => {
    return milestones.find((m) => m.id === selectedMilestoneId);
  }, [milestones, selectedMilestoneId]);

  const milestoneTasks = useMemo(() => {
    if (!selectedMilestoneId) return [];
    return tasks.filter((t) => t.milestoneId === selectedMilestoneId);
  }, [tasks, selectedMilestoneId]);

  const burndownSeries = useMemo(() => {
    if (!selectedMilestone) return null;
    return calculateMilestoneBurndown(selectedMilestone, milestoneTasks, {
      unit: burndownUnit,
      todayStr,
    });
  }, [selectedMilestone, milestoneTasks, burndownUnit, todayStr]);

  const overallVelocity = useMemo(() => {
    return calculateCompletionVelocity(tasks, {
      windowWeeks: velocityWindowWeeks,
      todayStr,
    });
  }, [tasks, velocityWindowWeeks, todayStr]);

  const projectMetrics = useMemo(() => {
    return calculateProjectStatusMetrics(projects, tasks, velocityWindowWeeks, todayStr);
  }, [projects, tasks, velocityWindowWeeks, todayStr]);

  const workloadItems = useMemo(() => {
    return calculateStakeholderWorkload(tasks, milestones, projects, {
      dimension: workloadDimension,
      includeDone: includeDoneWorkload,
    });
  }, [tasks, milestones, projects, workloadDimension, includeDoneWorkload]);

  const handleMilestoneChange = (value: string | undefined) => {
    if (!value) return;
    setSelectedMilestoneId(value);
    onNavigate?.('analytics', { milestoneId: value });
  };

  const projectTableColumns = useMemo(
    () => [
      {
        title: 'Dự án',
        dataIndex: 'projectName',
        key: 'projectName',
        width: 180,
        render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>,
      },
      {
        title: 'Thanh trạng thái',
        key: 'statusDistribution',
        render: (_: unknown, record: ProjectStatusMetrics) => (
          <StackedStatusBar counts={record.counts} totalTasks={record.totalTasks} height={14} />
        ),
      },
      {
        title: 'Tác vụ mở',
        dataIndex: 'openTasksCount',
        key: 'openTasksCount',
        width: 110,
        align: 'center' as const,
      },
      {
        title: 'Giờ còn lại',
        dataIndex: 'remainingHours',
        key: 'remainingHours',
        width: 120,
        align: 'center' as const,
        render: (hours: number) => `${hours}h`,
      },
      {
        title: 'Vận tốc',
        key: 'velocity',
        width: 180,
        render: (_: unknown, record: ProjectStatusMetrics) => (
          <span>
            {record.velocityTasksPerWeek} tasks/tuần, {record.velocityHoursPerWeek}h/tuần
          </span>
        ),
      },
    ],
    []
  );

  const workloadTableColumns = useMemo(
    () => [
      {
        title: 'Nhóm / Người phụ trách',
        dataIndex: 'label',
        key: 'label',
        render: (_: unknown, record: WorkloadDistributionItem) => {
          if (record.workType) {
            return <WorkTypeBadge workType={record.workType} />;
          }
          return <span style={{ fontWeight: 500 }}>{record.label}</span>;
        },
      },
      {
        title: 'Số lượng tác vụ',
        dataIndex: 'taskCount',
        key: 'taskCount',
        width: 140,
        align: 'center' as const,
      },
      {
        title: 'Tổng giờ ước lượng',
        dataIndex: 'hours',
        key: 'hours',
        width: 170,
        align: 'center' as const,
        render: (hours: number) => `${hours}h`,
      },
      {
        title: 'Tỉ lệ % tải',
        dataIndex: 'percentage',
        key: 'percentage',
        width: 130,
        align: 'center' as const,
        render: (pct: number) => `${pct}%`,
      },
    ],
    []
  );

  return (
    <div
      data-testid="analytics-view"
      style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 32 }}
    >
      {/* Section 1: Milestone Burndown Chart (ANLT-01) */}
      <Card
        data-testid="section-milestone-burndown"
        title="Tiến độ Burndown Milestone"
        extra={
          milestones.length > 0 && (
            <Space wrap size="small">
              <Select
                data-testid="milestone-select"
                style={{ minWidth: 200 }}
                placeholder="Chọn Milestone"
                value={selectedMilestoneId}
                onChange={handleMilestoneChange}
                options={milestones.map((m) => ({
                  value: m.id,
                  label: m.name,
                }))}
              />
              <Segmented
                data-testid="burndown-unit-toggle"
                value={burndownUnit}
                onChange={(val) => setBurndownUnit(val as BurndownUnit)}
                options={[
                  { label: 'Giờ ước lượng', value: 'hours' },
                  { label: 'Số tác vụ', value: 'count' },
                ]}
              />
            </Space>
          )
        }
      >
        {milestones.length === 0 || !selectedMilestone || !burndownSeries ? (
          <Empty
            description={
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
                  Chưa có dữ liệu Milestone
                </div>
                <div style={{ color: '#8c8c8c' }}>
                  Tạo milestone mới và thêm các tác vụ ước lượng để theo dõi tiến độ burndown.
                </div>
              </div>
            }
          >
            <Button type="primary" onClick={() => onNavigate?.('projects')}>
              Tạo Milestone
            </Button>
          </Empty>
        ) : (
          <BurndownSvgChart series={burndownSeries} todayStr={todayStr} unit={burndownUnit} />
        )}
      </Card>

      {/* Section 2: Project Status Distribution & Delivery Velocity (ANLT-02) */}
      <Card
        data-testid="section-project-velocity"
        title="Vận tốc bàn giao & Trạng thái Dự án"
        extra={
          projects.length > 0 && (
            <Segmented
              data-testid="velocity-window-picker"
              value={velocityWindowWeeks}
              onChange={(val) => setVelocityWindowWeeks(val as VelocityWindowWeeks)}
              options={[
                { label: '2 tuần', value: 2 },
                { label: '4 tuần', value: 4 },
                { label: '8 tuần', value: 8 },
                { label: '12 tuần', value: 12 },
              ]}
            />
          )
        }
      >
        {projects.length === 0 ? (
          <Empty
            description={
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
                  Chưa có dữ liệu vận tốc
                </div>
                <div style={{ color: '#8c8c8c' }}>
                  Hoàn thành các tác vụ đầu tiên để hệ thống bắt đầu đo lường vận tốc bàn giao theo tuần.
                </div>
              </div>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Overall Velocity Summary Metric per D-05 */}
            <div
              data-testid="velocity-metric-summary"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                padding: '12px 16px',
                backgroundColor: '#fafafa',
                borderRadius: 6,
                border: '1px solid #f0f0f0',
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 2 }}>
                  Vận tốc hoàn thành trung bình ({velocityWindowWeeks} tuần gần nhất)
                </div>
                <div style={{ fontSize: 16 }}>
                  <strong>{overallVelocity.averageTasksPerWeek} tasks / tuần</strong>{' '}
                  <span style={{ color: '#8c8c8c' }}>
                    (~{overallVelocity.averageHoursPerWeek}h / tuần)
                  </span>
                </div>
              </div>
              <div style={{ width: 240, maxWidth: '100%' }}>
                <VelocityTrendChart buckets={overallVelocity.buckets} height={50} />
              </div>
            </div>

            {/* Project Comparison Table */}
            <Table
              rowKey="projectId"
              columns={projectTableColumns}
              dataSource={projectMetrics}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              scroll={{ x: 'max-content' }}
            />
          </div>
        )}
      </Card>

      {/* Section 3: Stakeholder Workload Allocation (ANLT-03) */}
      <Card
        data-testid="section-stakeholder-workload"
        title="Phân bổ Tải Stakeholder & Hạng mục"
        extra={
          <Button
            data-testid="workload-scope-toggle"
            type={includeDoneWorkload ? 'primary' : 'default'}
            onClick={() => setIncludeDoneWorkload((prev) => !prev)}
          >
            {includeDoneWorkload ? 'Tất cả tác vụ' : 'Chỉ tác vụ mở'}
          </Button>
        }
      >
        <Tabs
          activeKey={workloadDimension}
          onChange={(key) => setWorkloadDimension(key as WorkloadDimension)}
          items={[
            { key: 'opsOwners', label: 'Ops Owner' },
            { key: 'businessAnalysts', label: 'Business Analyst' },
            { key: 'workType', label: 'Loại công việc' },
          ]}
          style={{ marginBottom: 16 }}
        />

        {workloadItems.length === 0 ? (
          <Empty
            description={
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
                  Chưa có tác vụ nào được phân công
                </div>
                <div style={{ color: '#8c8c8c' }}>
                  Thêm tác vụ hoặc gán Ops Owner / BA / Loại công việc để xem biểu đồ phân bổ tải.
                </div>
              </div>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Top: Workload Proportion Bar per D-12 */}
            <div style={{ padding: '0 4px' }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>
                Tỷ trọng phân bổ tải ({burndownUnit === 'hours' ? 'theo giờ ước lượng' : 'theo số lượng tác vụ'})
              </div>
              <WorkloadProportionBar items={workloadItems} metric={burndownUnit} height={18} />
            </div>

            {/* Bottom: Detailed Stakeholder Table per D-12 */}
            <Table
              rowKey="key"
              columns={workloadTableColumns}
              dataSource={workloadItems}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              expandable={{
                expandedRowRender: (record) => {
                  const itemTasks = tasks.filter((t) => record.taskIds.includes(t.id));
                  return (
                    <div style={{ padding: '4px 12px' }}>
                      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, color: '#595959' }}>
                        Tác vụ trực thuộc ({itemTasks.length}):
                      </div>
                      <Row gutter={[8, 8]}>
                        {itemTasks.map((t) => (
                          <Col xs={24} sm={12} key={t.id}>
                            <div
                              style={{
                                padding: '6px 10px',
                                background: '#fafafa',
                                borderRadius: 4,
                                border: '1px solid #f0f0f0',
                                fontSize: 12,
                              }}
                            >
                              <div style={{ fontWeight: 500, color: '#262626' }}>{t.name}</div>
                              <div style={{ color: '#8c8c8c', marginTop: 2 }}>
                                {t.status} • {t.estimateMinutes ? `${(t.estimateMinutes / 60).toFixed(1)}h` : '0h'}
                              </div>
                            </div>
                          </Col>
                        ))}
                      </Row>
                    </div>
                  );
                },
                rowExpandable: (record) => record.taskIds.length > 0,
              }}
            />
          </div>
        )}
      </Card>
    </div>
  );
};

export default AnalyticsView;
