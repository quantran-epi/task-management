import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  Typography,
  Progress,
  Table,
  Button,
  Space,
  Card,
  Tag,
  message,
  Statistic,
  Row,
  Col,
  Segmented,
  Alert,
  Spin,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  FireOutlined,
  RobotOutlined,
  BulbOutlined,
  SunOutlined,
  MoonOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getEffectiveCapacityForDate } from '../../db/repositories/capacityRepo';
import { getWorkSessionsForDate } from '../../db/repositories/workSessionRepo';
import {
  getAllocationsForDate,
  deleteAllocation,
  upsertAllocation,
  type PlannedAllocationWithTask,
} from '../../db/repositories/allocationRepo';
import { getTodayDateString } from '../../utils/date';
import { formatMinutes } from '../../utils/time';
import { renderSafeMarkdown } from '../../utils/markdown';
import {
  generateDeterministicBriefing,
  generateDeterministicDebriefing,
  buildBriefingPrompt,
  buildDebriefingPrompt,
} from '../../services/ai/dailyInsightService';
import {
  getNineRouterApiKey,
  getNineRouterConfig,
} from '../../services/ai/nineRouterTokenService';
import {
  streamChatCompletion,
  stripThinkingBlocks,
} from '../../services/ai/nineRouterClient';

const { Text, Paragraph } = Typography;

export type DailyReviewTabMode = 'briefing' | 'debriefing';

export interface DailyReviewModalProps {
  open: boolean;
  onClose: () => void;
  date?: string; // Defaults to today YYYY-MM-DD
  db?: TaskPlannerDatabase;
  initialTab?: DailyReviewTabMode;
}

export const DailyReviewModal: React.FC<DailyReviewModalProps> = ({
  open,
  onClose,
  date,
  db = defaultDb,
  initialTab = 'briefing',
}) => {
  const targetDate = date || getTodayDateString();
  const tomorrowDate = dayjs(targetDate, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD');

  const [activeTab, setActiveTab] = useState<DailyReviewTabMode>(initialTab);
  const [loading, setLoading] = useState(false);
  const [capacityMinutes, setCapacityMinutes] = useState(0);
  const [loggedMinutes, setLoggedMinutes] = useState(0);
  const [allocations, setAllocations] = useState<PlannedAllocationWithTask[]>([]);
  const [rollingOver, setRollingOver] = useState(false);

  // AI insights state
  const [briefingAiInsight, setBriefingAiInsight] = useState<string>('');
  const [debriefingAiInsight, setDebriefingAiInsight] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const abortActiveAi = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const loadData = async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [cap, sessions, allocs] = await Promise.all([
        getEffectiveCapacityForDate(targetDate, db),
        getWorkSessionsForDate(targetDate, db),
        getAllocationsForDate(targetDate, db),
      ]);

      setCapacityMinutes(cap);
      const totalLogged = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
      setLoggedMinutes(totalLogged);
      setAllocations(allocs);
    } catch (err) {
      console.error('Failed to load daily review data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadData();
      setActiveTab(initialTab);
      setBriefingAiInsight('');
      setDebriefingAiInsight('');
      setAiError(null);
    } else {
      abortActiveAi();
    }
    return () => {
      abortActiveAi();
    };
  }, [open, targetDate, db, initialTab]);

  // Deterministic metrics
  const briefingMetrics = generateDeterministicBriefing({
    date: targetDate,
    capacityMinutes,
    allocations,
  });

  const debriefingMetrics = generateDeterministicDebriefing({
    date: targetDate,
    capacityMinutes,
    loggedMinutes,
    allocations,
  });

  // Active incomplete tasks for today
  const incompleteAllocations = allocations.filter(
    (a) => a.isActive && a.task.status !== 'Done' && a.task.status !== 'Cancelled'
  );

  const completedAllocations = allocations.filter(
    (a) => !a.isActive || a.task.status === 'Done'
  );

  const activeScheduledAllocations = allocations.filter(
    (a) => a.isActive && a.task.status !== 'Cancelled'
  );

  const handleRolloverTask = async (alloc: PlannedAllocationWithTask) => {
    try {
      await upsertAllocation(alloc.taskId, tomorrowDate, alloc.allocatedMinutes, db);
      await deleteAllocation(alloc.id, db);
      message.success(`Đã chuyển "${alloc.task.name}" sang ngày mai (${tomorrowDate})`);
      await loadData();
    } catch {
      message.error('Không thể chuyển công việc');
    }
  };

  const handleRolloverAll = async () => {
    if (incompleteAllocations.length === 0) return;
    setRollingOver(true);
    try {
      for (const alloc of incompleteAllocations) {
        await upsertAllocation(alloc.taskId, tomorrowDate, alloc.allocatedMinutes, db);
        await deleteAllocation(alloc.id, db);
      }
      message.success(
        `Đã chuyển toàn bộ ${incompleteAllocations.length} công việc sang ngày mai (${tomorrowDate})`
      );
      await loadData();
    } catch {
      message.error('Không thể chuyển toàn bộ công việc');
    } finally {
      setRollingOver(false);
    }
  };

  const handleTriggerAiInsight = async (mode: DailyReviewTabMode) => {
    abortActiveAi();
    setAiLoading(true);
    setAiError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const [apiKey, config] = await Promise.all([
        getNineRouterApiKey(db),
        getNineRouterConfig(db),
      ]);

      if (!apiKey || apiKey.trim().length === 0) {
        setAiError(
          'Chưa cấu hình API Key cho Trợ lý AI. Vui lòng vào Cài đặt để thêm API Key nếu muốn sử dụng nhận xét AI.'
        );
        setAiLoading(false);
        return;
      }

      const { systemPrompt, userPrompt } =
        mode === 'briefing'
          ? buildBriefingPrompt({
              date: targetDate,
              capacityMinutes,
              allocations,
            })
          : buildDebriefingPrompt({
              date: targetDate,
              capacityMinutes,
              loggedMinutes,
              allocations,
            });

      let accumulated = '';
      if (mode === 'briefing') {
        setBriefingAiInsight('');
      } else {
        setDebriefingAiInsight('');
      }

      for await (const chunk of streamChatCompletion({
        endpoint: config.endpoint,
        apiKey,
        signal: controller.signal,
        payload: {
          model: config.defaultModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        },
      })) {
        accumulated += chunk;
        const cleanText = stripThinkingBlocks(accumulated);
        if (mode === 'briefing') {
          setBriefingAiInsight(cleanText);
        } else {
          setDebriefingAiInsight(cleanText);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định khi kết nối AI';
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const handleModalClose = () => {
    abortActiveAi();
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={handleModalClose}
      footer={[
        <Button key="close" type="primary" onClick={handleModalClose}>
          Hoàn thành đánh giá
        </Button>,
      ]}
      title={
        <Space>
          <CalendarOutlined style={{ color: '#1677ff' }} />
          <span>
            {activeTab === 'briefing' ? 'Khởi động ngày (Briefing)' : 'Tổng kết ngày (Debriefing)'}{' '}
            ({dayjs(targetDate).format('DD/MM/YYYY')})
          </span>
        </Space>
      }
      width={760}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
        {/* Tab switch */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Segmented<DailyReviewTabMode>
            size="middle"
            value={activeTab}
            onChange={(val) => {
              setActiveTab(val);
              setAiError(null);
            }}
            options={[
              {
                label: (
                  <Space size="small">
                    <SunOutlined style={{ color: '#fa8c16' }} />
                    <span>Briefing (Đầu ngày)</span>
                  </Space>
                ),
                value: 'briefing',
              },
              {
                label: (
                  <Space size="small">
                    <MoonOutlined style={{ color: '#1677ff' }} />
                    <span>Debriefing (Tổng kết)</span>
                  </Space>
                ),
                value: 'debriefing',
              },
            ]}
          />
        </div>

        {/* BRIEFING VIEW */}
        {activeTab === 'briefing' && (
          <>
            {/* Top summary cards */}
            <Row gutter={16}>
              <Col span={6}>
                <Card size="small" style={{ background: '#e6f4ff', borderColor: '#91caff' }}>
                  <Statistic
                    title="Kế hoạch (Planned)"
                    value={formatMinutes(briefingMetrics.plannedMinutes)}
                    prefix={<ClockCircleOutlined style={{ color: '#1677ff' }} />}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                  <Statistic
                    title="Công suất ngày"
                    value={formatMinutes(briefingMetrics.capacityMinutes)}
                    prefix={<FireOutlined style={{ color: '#52c41a' }} />}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card
                  size="small"
                  style={{
                    background: briefingMetrics.isOverCapacity ? '#fff2e8' : '#fafafa',
                    borderColor: briefingMetrics.isOverCapacity ? '#ffbb96' : undefined,
                  }}
                >
                  <Statistic
                    title="Mức độ tải"
                    value={`${briefingMetrics.loadPercent}%`}
                    styles={{
                      content: {
                        color: briefingMetrics.isOverCapacity ? '#fa541c' : '#1677ff',
                      },
                    }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small" style={{ background: '#fff7e6', borderColor: '#ffd591' }}>
                  <Statistic
                    title="Ưu tiên Cao"
                    value={briefingMetrics.highPriorityCount}
                    styles={{ content: { color: '#fa8c16' } }}
                  />
                </Card>
              </Col>
            </Row>

            {/* Workload progress bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text type="secondary">Phân bổ kế hoạch so với công suất</Text>
                <Text strong>
                  {formatMinutes(briefingMetrics.plannedMinutes)} /{' '}
                  {formatMinutes(briefingMetrics.capacityMinutes)}
                </Text>
              </div>
              <Progress
                percent={briefingMetrics.loadPercent}
                status={
                  briefingMetrics.isOverCapacity
                    ? 'exception'
                    : briefingMetrics.loadPercent >= 100
                    ? 'success'
                    : 'active'
                }
                {...(briefingMetrics.isOverCapacity ? { strokeColor: '#fa541c' } : {})}
              />
            </div>

            {/* Deterministic recommendations */}
            {briefingMetrics.recommendations.length > 0 && (
              <Alert
                type={briefingMetrics.isOverCapacity ? 'warning' : 'info'}
                showIcon
                icon={<BulbOutlined />}
                title="Định hướng đầu ngày (Offline Heuristic)"
                description={
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {briefingMetrics.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                }
              />
            )}

            {/* AI Streaming section */}
            <Card
              size="small"
              style={{ background: '#fcfcfc', border: '1px dashed #d9d9d9' }}
              title={
                <Space>
                  <RobotOutlined style={{ color: '#722ed1' }} />
                  <span>Gợi ý khởi động AI (On-demand)</span>
                </Space>
              }
              extra={
                <Button
                  size="small"
                  type="primary"
                  icon={aiLoading ? <ReloadOutlined spin /> : <RobotOutlined />}
                  loading={aiLoading}
                  onClick={() => handleTriggerAiInsight('briefing')}
                >
                  {briefingAiInsight ? 'Phân tích lại' : 'Nhận diện & Gợi ý AI'}
                </Button>
              }
            >
              {aiError && (
                <Alert
                  type="warning"
                  showIcon
                  message={aiError}
                  style={{ marginBottom: 8 }}
                />
              )}
              {briefingAiInsight ? (
                <div
                  className="briefing-ai-output"
                  dangerouslySetInnerHTML={{
                    __html: renderSafeMarkdown(briefingAiInsight),
                  }}
                  style={{ fontSize: 13, lineHeight: 1.6 }}
                />
              ) : !aiLoading && !aiError ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Nhấn "Nhận diện & Gợi ý AI" để nhận lời khuyên trọng tâm và tối ưu hóa thứ tự
                  thực hiện công việc cho sáng nay.
                </Text>
              ) : null}
              {aiLoading && !briefingAiInsight && (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <Spin size="small" />
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#8c8c8c' }}>
                    Đang phân tích kế hoạch ngày...
                  </span>
                </div>
              )}
            </Card>

            {/* Scheduled Tasks List */}
            <div>
              <Text strong style={{ fontSize: 14, marginBottom: 8, display: 'block' }}>
                Danh sách tác vụ dự kiến ({activeScheduledAllocations.length})
              </Text>
              {activeScheduledAllocations.length === 0 ? (
                <Card size="small" style={{ textAlign: 'center', padding: '16px 0', background: '#fafafa' }}>
                  <Paragraph style={{ margin: 0 }}>
                    Chưa có công việc nào được lên lịch cho ngày này.
                  </Paragraph>
                </Card>
              ) : (
                <Table<PlannedAllocationWithTask>
                  size="small"
                  rowKey="id"
                  loading={loading}
                  dataSource={activeScheduledAllocations}
                  pagination={false}
                  columns={[
                    {
                      title: 'Công việc',
                      dataIndex: ['task', 'name'],
                      key: 'name',
                      render: (name: string, record: PlannedAllocationWithTask) => (
                        <Space orientation="vertical" size={2}>
                          <Text strong>{name}</Text>
                          <Space size="small">
                            <Tag color={record.task.priority === 'High' ? 'red' : record.task.priority === 'Medium' ? 'orange' : 'default'}>
                              {record.task.priority}
                            </Tag>
                            <Tag color="blue">{record.task.status}</Tag>
                          </Space>
                        </Space>
                      ),
                    },
                    {
                      title: 'Thời gian dự kiến',
                      dataIndex: 'allocatedMinutes',
                      key: 'allocatedMinutes',
                      width: 140,
                      align: 'right',
                      render: (mins: number) => <Text>{formatMinutes(mins)}</Text>,
                    },
                  ]}
                />
              )}
            </div>
          </>
        )}

        {/* DEBRIEFING VIEW */}
        {activeTab === 'debriefing' && (
          <>
            {/* Top summary cards */}
            <Row gutter={16}>
              <Col span={8}>
                <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                  <Statistic
                    title="Đã ghi nhận (Actual)"
                    value={formatMinutes(loggedMinutes)}
                    prefix={<ClockCircleOutlined style={{ color: '#52c41a' }} />}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" style={{ background: '#e6f4ff', borderColor: '#91caff' }}>
                  <Statistic
                    title="Công suất mục tiêu"
                    value={formatMinutes(capacityMinutes)}
                    prefix={<FireOutlined style={{ color: '#1677ff' }} />}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card
                  size="small"
                  style={{ background: debriefingMetrics.isOverCapacity ? '#fff2e8' : '#fafafa' }}
                >
                  <Statistic
                    title="Tỉ lệ đạt"
                    value={`${debriefingMetrics.capacityPercent}%`}
                    styles={{
                      content: {
                        color: debriefingMetrics.isOverCapacity ? '#fa541c' : '#1677ff',
                      },
                    }}
                  />
                </Card>
              </Col>
            </Row>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text type="secondary">Tiến độ công suất trong ngày</Text>
                <Text strong>
                  {formatMinutes(loggedMinutes)} / {formatMinutes(capacityMinutes)}
                </Text>
              </div>
              <Progress
                percent={debriefingMetrics.capacityPercent}
                status={
                  debriefingMetrics.isOverCapacity
                    ? 'exception'
                    : debriefingMetrics.capacityPercent >= 100
                    ? 'success'
                    : 'active'
                }
                {...(debriefingMetrics.isOverCapacity ? { strokeColor: '#fa541c' } : {})}
              />
            </div>

            {/* AI Streaming section for Debriefing */}
            <Card
              size="small"
              style={{ background: '#fcfcfc', border: '1px dashed #d9d9d9' }}
              title={
                <Space>
                  <RobotOutlined style={{ color: '#722ed1' }} />
                  <span>Tổng kết & Khuyến nghị AI (On-demand)</span>
                </Space>
              }
              extra={
                <Button
                  size="small"
                  type="primary"
                  icon={aiLoading ? <ReloadOutlined spin /> : <RobotOutlined />}
                  loading={aiLoading}
                  onClick={() => handleTriggerAiInsight('debriefing')}
                >
                  {debriefingAiInsight ? 'Phân tích lại' : 'Đánh giá cuối ngày'}
                </Button>
              }
            >
              {aiError && (
                <Alert
                  type="warning"
                  showIcon
                  message={aiError}
                  style={{ marginBottom: 8 }}
                />
              )}
              {debriefingAiInsight ? (
                <div
                  className="debriefing-ai-output"
                  dangerouslySetInnerHTML={{
                    __html: renderSafeMarkdown(debriefingAiInsight),
                  }}
                  style={{ fontSize: 13, lineHeight: 1.6 }}
                />
              ) : !aiLoading && !aiError ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Nhấn "Đánh giá cuối ngày" để AI phân tích hiệu suất làm việc và chiến lược giải
                  quyết các việc tồn đọng cho ngày tiếp theo.
                </Text>
              ) : null}
              {aiLoading && !debriefingAiInsight && (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <Spin size="small" />
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#8c8c8c' }}>
                    Đang phân tích tổng kết ngày...
                  </span>
                </div>
              )}
            </Card>

            {/* Incomplete tasks for today */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <Space>
                  <Text strong style={{ fontSize: 15 }}>
                    Công việc chưa xong hôm nay ({incompleteAllocations.length})
                  </Text>
                </Space>
                {incompleteAllocations.length > 0 && (
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<ArrowRightOutlined />}
                    loading={rollingOver}
                    onClick={handleRolloverAll}
                    aria-label="Chuyển tất cả sang ngày mai"
                  >
                    Chuyển tất cả sang ngày mai ({tomorrowDate})
                  </Button>
                )}
              </div>

              {incompleteAllocations.length === 0 ? (
                <Card size="small" style={{ textAlign: 'center', padding: '16px 0', background: '#fafafa' }}>
                  <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a', marginBottom: 8 }} />
                  <Paragraph style={{ margin: 0 }}>
                    Tuyệt vời! Không còn công việc tồn đọng nào trong ngày hôm nay.
                  </Paragraph>
                </Card>
              ) : (
                <Table<PlannedAllocationWithTask>
                  size="small"
                  rowKey="id"
                  loading={loading}
                  dataSource={incompleteAllocations}
                  pagination={false}
                  columns={[
                    {
                      title: 'Công việc',
                      dataIndex: ['task', 'name'],
                      key: 'name',
                      render: (name: string, record: PlannedAllocationWithTask) => (
                        <Space orientation="vertical" size={2}>
                          <Text strong>{name}</Text>
                          <Space size="small">
                            <Tag color="blue">{record.task.status}</Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Kế hoạch: {formatMinutes(record.allocatedMinutes)}
                            </Text>
                          </Space>
                        </Space>
                      ),
                    },
                    {
                      title: 'Hành động',
                      key: 'action',
                      width: 140,
                      align: 'right',
                      render: (_: unknown, record: PlannedAllocationWithTask) => (
                        <Button
                          size="small"
                          icon={<ArrowRightOutlined />}
                          onClick={() => handleRolloverTask(record)}
                          aria-label={`Chuyển ${record.task.name} sang ngày mai`}
                        >
                          Sang mai
                        </Button>
                      ),
                    },
                  ]}
                />
              )}
            </div>

            {/* Completed tasks */}
            {completedAllocations.length > 0 && (
              <div>
                <Text type="secondary" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>
                  Đã hoàn thành ({completedAllocations.length}):
                </Text>
                <Space wrap size="small">
                  {completedAllocations.map((a) => (
                    <Tag key={a.id} color="success" icon={<CheckCircleOutlined />}>
                      {a.task.name}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
