import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Modal,
  DatePicker,
  Radio,
  Segmented,
  InputNumber,
  Button,
  Space,
  Alert,
  Typography,
  message,
} from 'antd';
import {
  ThunderboltOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs, { type Dayjs } from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { upsertAllocation } from '../../db/repositories/allocationRepo';
import { formatMinutes } from '../../utils/time';
import { createFocusRestorer } from '../../utils/focus';
import { evaluateTaskFeasibility } from '../../utils/feasibility';
import { getTodayDateString } from '../../utils/date';
import type { Task, PlannedAllocation } from '../../types/models';
import type { DistributionStrategy, CandidateAllocation } from '../../types/feasibility';
import { CandidateAllocationsTable } from './CandidateAllocationsTable';
import { DateInspectionBreakdown } from './DateInspectionBreakdown';

const { Text } = Typography;
const { RangePicker } = DatePicker;

export interface FeasibilityModalProps {
  open: boolean;
  task?: Task | undefined;
  onCancel: () => void;
  onSuccess?: (() => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
}

export const FeasibilityModal: React.FC<FeasibilityModalProps> = ({
  open,
  task,
  onCancel,
  onSuccess,
  db = defaultDb,
}) => {
  const restorerRef = useRef<(() => void) | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Compute initial date range
  const taskDeadline = task?.deadline;

  const getInitialRange = (): [Dayjs, Dayjs] => {
    const today = dayjs();
    if (taskDeadline) {
      return [today, dayjs(taskDeadline, 'YYYY-MM-DD')];
    }
    return [today, today.add(7, 'day')];
  };

  // Parameter states
  const [rangeMode, setRangeMode] = useState<'deadline' | 'custom'>(() =>
    taskDeadline ? 'deadline' : 'custom'
  );
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(getInitialRange);
  const [strategy, setStrategy] = useState<DistributionStrategy>('balanced-spread');
  const [maxMinutesPerDay, setMaxMinutesPerDay] = useState<number | undefined>(undefined);

  // In-memory candidate edits (CALC-06, T-04-03)
  const [candidateOverrides, setCandidateOverrides] = useState<
    Record<string, { included?: boolean; proposedMinutes?: number }>
  >({});

  // Sync state when open or task changes
  useEffect(() => {
    if (open) {
      restorerRef.current = createFocusRestorer();
      const today = dayjs();
      if (taskDeadline) {
        setRangeMode('deadline');
        setDateRange([today, dayjs(taskDeadline, 'YYYY-MM-DD')]);
      } else {
        setRangeMode('custom');
        setDateRange([today, today.add(7, 'day')]);
      }
      setStrategy('balanced-spread');
      setMaxMinutesPerDay(undefined);
      setCandidateOverrides({});
    }
  }, [open, task?.id, taskDeadline]);

  // Reactive DB queries
  const capacityRules = useLiveQuery(() => db.capacityRules.toArray(), [db]);
  const capacityOverrides = useLiveQuery(() => db.capacityOverrides.toArray(), [db]);
  const allAllocations = useLiveQuery(() => db.plannedAllocations.toArray(), [db]);

  // Compute other tasks active load and existing task allocations
  const { existingTaskAllocations, otherTasksLoadByDate } = useMemo(() => {
    const existing: PlannedAllocation[] = [];
    const otherLoad: Record<string, number> = {};

    if (!allAllocations) return { existingTaskAllocations: existing, otherTasksLoadByDate: otherLoad };

    for (const a of allAllocations) {
      if (a.taskId === task?.id) {
        existing.push(a);
      } else {
        otherLoad[a.date] = (otherLoad[a.date] ?? 0) + a.allocatedMinutes;
      }
    }

    return { existingTaskAllocations: existing, otherTasksLoadByDate: otherLoad };
  }, [allAllocations, task?.id]);

  // Calculate feasibility result via pure engine
  const feasibilityResult = useMemo(() => {
    if (!task || capacityRules === undefined || allAllocations === undefined) return null;

    const startDateStr = dateRange[0].format('YYYY-MM-DD');
    const endDateStr = dateRange[1].format('YYYY-MM-DD');

    return evaluateTaskFeasibility({
      task,
      existingTaskAllocations,
      startDate: startDateStr,
      endDate: endDateStr,
      rules: capacityRules ?? [],
      overrides: capacityOverrides ?? [],
      activeAllocationsByDate: otherTasksLoadByDate,
      strategy,
      maxMinutesPerDay,
      today: getTodayDateString(),
    });
  }, [
    task,
    dateRange,
    existingTaskAllocations,
    capacityRules,
    capacityOverrides,
    otherTasksLoadByDate,
    strategy,
    maxMinutesPerDay,
    allAllocations,
  ]);

  // Merge engine candidates with in-memory overrides (CALC-06, T-04-03)
  const candidates: CandidateAllocation[] = useMemo(() => {
    if (!feasibilityResult) return [];

    return feasibilityResult.candidateAllocations.map((c) => {
      const override = candidateOverrides[c.date];
      const included = override?.included !== undefined ? override.included : c.included;
      const proposedAllocatedMinutes =
        override?.proposedMinutes !== undefined ? override.proposedMinutes : c.proposedAllocatedMinutes;

      return {
        ...c,
        included,
        proposedAllocatedMinutes,
        totalResultingMinutes: c.existingAllocatedMinutes + (included ? proposedAllocatedMinutes : 0),
      };
    });
  }, [feasibilityResult, candidateOverrides]);

  const handleClose = () => {
    onCancel();
    if (restorerRef.current) {
      restorerRef.current();
    }
  };

  const handleToggleCandidate = (date: string, included: boolean) => {
    setCandidateOverrides((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        included,
      },
    }));
  };

  const handleChangeMinutes = (date: string, minutesVal: number) => {
    setCandidateOverrides((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        proposedMinutes: Math.max(0, Math.round(minutesVal)),
      },
    }));
  };

  // Action shortcut: Extend to earliest feasible date (D-12)
  const handleExtendToEarliest = () => {
    if (feasibilityResult?.earliestFeasibleDate) {
      const earliest = dayjs(feasibilityResult.earliestFeasibleDate, 'YYYY-MM-DD');
      setDateRange([dateRange[0], earliest]);
      setRangeMode('custom');
      setCandidateOverrides({});
    }
  };

  // Action shortcut: Allocate available capacity (D-10)
  const handleAllocateAvailable = () => {
    if (!feasibilityResult) return;
    setCandidateOverrides({});
    // Engine automatically fills up to available capacity on deficit
  };

  // Atomic persistence commit (D-08, D-16, T-04-03)
  const handleApply = async () => {
    if (!task) return;
    const includedCandidates = candidates.filter(
      (c) => c.included && c.proposedAllocatedMinutes > 0
    );

    if (includedCandidates.length === 0) {
      message.warning('No candidate allocations selected to apply');
      return;
    }

    setSubmitting(true);
    try {
      await db.transaction('rw', [db.plannedAllocations, db.tasks], async () => {
        for (const c of includedCandidates) {
          const newTotal = c.existingAllocatedMinutes + c.proposedAllocatedMinutes;
          await upsertAllocation(task.id, c.date, newTotal, db);
        }
      });

      const totalAppliedMinutes = includedCandidates.reduce(
        (sum, c) => sum + c.proposedAllocatedMinutes,
        0
      );
      message.success(
        `Successfully allocated ${formatMinutes(totalAppliedMinutes)} across ${includedCandidates.length} days`
      );
      onSuccess?.();
      handleClose();
    } catch {
      message.error('Failed to apply allocations');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#1677ff' }} />
          <span>Task Feasibility & Workload Distribution</span>
        </Space>
      }
      open={open}
      onCancel={handleClose}
      destroyOnClose
      width={720}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={handleClose}>Discard Allocations</Button>
          <Button
            type="primary"
            onClick={() => void handleApply()}
            loading={submitting}
          >
            Apply Allocations
          </Button>
        </div>
      }
    >
      <div style={{ marginTop: 16 }}>
        {/* Section 1: Scope & Parameters */}
        <div
          style={{
            padding: 12,
            backgroundColor: '#fafafa',
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                  Evaluation Window
                </Text>
                <Space>
                  <Radio.Group
                    value={rangeMode}
                    onChange={(e) => {
                      const mode = e.target.value;
                      setRangeMode(mode);
                      const today = dayjs();
                      if (mode === 'deadline' && taskDeadline) {
                        const due = dayjs(taskDeadline, 'YYYY-MM-DD');
                        setDateRange([today, due.isBefore(today) ? today : due]);
                      } else {
                        setDateRange([today, today.add(7, 'day')]);
                      }
                      setCandidateOverrides({});
                    }}
                  >
                    <Radio.Button value="deadline" disabled={!taskDeadline}>
                      By Deadline
                    </Radio.Button>
                    <Radio.Button value="custom">Custom Range</Radio.Button>
                  </Radio.Group>
                  <RangePicker
                    value={dateRange}
                    onChange={(val) => {
                      if (val && val[0] && val[1]) {
                        setDateRange([val[0], val[1]]);
                        setRangeMode('custom');
                        setCandidateOverrides({});
                      }
                    }}
                    allowClear={false}
                    format="YYYY-MM-DD"
                  />
                </Space>
              </div>

              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                  Distribution Strategy
                </Text>
                <Segmented
                  value={strategy}
                  onChange={(val) => {
                    setStrategy(val as DistributionStrategy);
                    setCandidateOverrides({});
                  }}
                  options={[
                    { label: 'Balanced Spread', value: 'balanced-spread' },
                    { label: 'Front-load', value: 'front-load' },
                    { label: 'Greedy Fill', value: 'greedy-fill' },
                  ]}
                />
              </div>

              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                  Max Hours/Day (Optional)
                </Text>
                <InputNumber
                  min={1}
                  max={24}
                  step={1}
                  placeholder="Uncapped"
                  value={maxMinutesPerDay !== undefined ? maxMinutesPerDay / 60 : null}
                  onChange={(v) => {
                    const num = typeof v === 'number' ? v : Number(v);
                    setMaxMinutesPerDay(!isNaN(num) && num > 0 ? num * 60 : undefined);
                    setCandidateOverrides({});
                  }}
                  suffix="h"
                  style={{ width: 110 }}
                />
              </div>
            </div>
          </Space>
        </div>

        {/* Section 2: Feasibility Result Banner (CALC-03) */}
        {feasibilityResult && (
          <div style={{ marginBottom: 16 }} data-testid="feasibility-alert">
            {feasibilityResult.isFeasible ? (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                message={
                  <span style={{ fontWeight: 600 }}>
                    Feasible: Work fits within range. Surplus capacity: +
                    {formatMinutes(feasibilityResult.surplusMinutes)}.
                  </span>
                }
                description={
                  <span>
                    The task remaining estimate ({formatMinutes(feasibilityResult.remainingTaskEstimateMinutes)}) can be fully allocated across the selected date window.
                  </span>
                }
              />
            ) : (
              <Alert
                type="warning"
                showIcon
                icon={<ExclamationCircleOutlined />}
                message={
                  <span style={{ fontWeight: 600 }}>
                    Infeasible: Deficit of -{formatMinutes(feasibilityResult.deficitMinutes)}. Earliest feasible completion date is {feasibilityResult.earliestFeasibleDate ?? 'unknown'}.
                  </span>
                }
                description={
                  <div style={{ marginTop: 8 }}>
                    <div style={{ marginBottom: 8 }}>
                      Selected range has only {formatMinutes(feasibilityResult.totalAvailableNetMinutes)} available capacity for remaining estimate {formatMinutes(feasibilityResult.remainingTaskEstimateMinutes)}.
                    </div>
                    <Space orientation="horizontal" size="small" wrap>
                      {feasibilityResult.earliestFeasibleDate && (
                        <Button
                          size="small"
                          type="primary"
                          onClick={handleExtendToEarliest}
                        >
                          Extend to {feasibilityResult.earliestFeasibleDate}
                        </Button>
                      )}
                      <Button
                        size="small"
                        onClick={handleAllocateAvailable}
                      >
                        Allocate Available ({formatMinutes(feasibilityResult.totalAvailableNetMinutes)})
                      </Button>
                    </Space>
                  </div>
                }
              />
            )}
          </div>
        )}

        {/* Section 3: Candidate Allocations Table (CALC-05, CALC-06, D-15) */}
        <div style={{ marginBottom: 16 }}>
          <CandidateAllocationsTable
            candidates={candidates}
            onToggleCandidate={handleToggleCandidate}
            onChangeMinutes={handleChangeMinutes}
            taskRemainingMinutes={feasibilityResult?.remainingTaskEstimateMinutes ?? 0}
          />
        </div>

        {/* Section 4: Date Inspection Breakdown (CALC-04, D-11) */}
        {feasibilityResult && (
          <DateInspectionBreakdown dateBreakdown={feasibilityResult.dateBreakdown} />
        )}
      </div>
    </Modal>
  );
};
