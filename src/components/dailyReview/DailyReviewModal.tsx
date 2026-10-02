import React, { useState, useEffect } from 'react';
import { Modal, Typography, Progress, Table, Button, Space, Card, Tag, message, Statistic, Row, Col } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  FireOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getEffectiveCapacityForDate } from '../../db/repositories/capacityRepo';
import { getWorkSessionsForDate } from '../../db/repositories/workSessionRepo';
import { getAllocationsForDate, deleteAllocation, upsertAllocation, type PlannedAllocationWithTask } from '../../db/repositories/allocationRepo';
import { getTodayDateString } from '../../utils/date';
import { formatMinutes } from '../../utils/time';

const { Title, Text, Paragraph } = Typography;

export interface DailyReviewModalProps {
  open: boolean;
  onClose: () => void;
  date?: string; // Defaults to today YYYY-MM-DD
  db?: TaskPlannerDatabase;
}

export const DailyReviewModal: React.FC<DailyReviewModalProps> = ({
  open,
  onClose,
  date,
  db = defaultDb,
}) => {
  const targetDate = date || getTodayDateString();
  const tomorrowDate = dayjs(targetDate, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD');

  const [loading, setLoading] = useState(false);
  const [capacityMinutes, setCapacityMinutes] = useState(0);
  const [loggedMinutes, setLoggedMinutes] = useState(0);
  const [allocations, setAllocations] = useState<PlannedAllocationWithTask[]>([]);
  const [rollingOver, setRollingOver] = useState(false);

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
    void loadData();
  }, [open, targetDate, db]);

  // Incomplete tasks are active allocations where task is not Done/Cancelled
  const incompleteAllocations = allocations.filter(
    (a) => a.isActive && a.task.status !== 'Done' && a.task.status !== 'Cancelled'
  );

  const completedAllocations = allocations.filter(
    (a) => !a.isActive || a.task.status === 'Done'
  );

  const handleRolloverTask = async (alloc: PlannedAllocationWithTask) => {
    try {
      // Move or add allocation for tomorrow
      await upsertAllocation(alloc.taskId, tomorrowDate, alloc.allocatedMinutes, db);
      // Remove allocation for today
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
      message.success(`Đã chuyển toàn bộ ${incompleteAllocations.length} công việc sang ngày mai (${tomorrowDate})`);
      await loadData();
    } catch {
      message.error('Không thể chuyển toàn bộ công việc');
    } finally {
      setRollingOver(false);
    }
  };

  const percentCapacity = capacityMinutes > 0 ? Math.min(100, Math.round((loggedMinutes / capacityMinutes) * 100)) : 0;
  const isOverCapacity = loggedMinutes > capacityMinutes && capacityMinutes > 0;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          Hoàn thành đánh giá
        </Button>,
      ]}
      title={
        <Space>
          <CalendarOutlined style={{ color: '#1677ff' }} />
          <span>Tổng kết ngày ({dayjs(targetDate).format('DD/MM/YYYY')})</span>
        </Space>
      }
      width={700}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
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
            <Card size="small" style={{ background: isOverCapacity ? '#fff2e8' : '#fafafa' }}>
              <Statistic
                title="Tỉ lệ đạt"
                value={`${percentCapacity}%`}
                valueStyle={{ color: isOverCapacity ? '#fa541c' : '#1677ff' }}
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
            percent={percentCapacity}
            status={isOverCapacity ? 'exception' : percentCapacity >= 100 ? 'success' : 'active'}
            strokeColor={isOverCapacity ? '#fa541c' : undefined}
          />
        </div>

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
            <Table
              size="small"
              rowKey="id"
              dataSource={incompleteAllocations}
              pagination={false}
              columns={[
                {
                  title: 'Công việc',
                  dataIndex: ['task', 'name'],
                  key: 'name',
                  render: (name: string, record) => (
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
                  render: (_, record) => (
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
      </div>
    </Modal>
  );
};
