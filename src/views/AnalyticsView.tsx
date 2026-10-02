import React, { useState } from 'react';
import { Card, Col, Row, Radio, Typography, Spin, Space } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { AnalyticsPeriod } from '../types/analytics';
import {
  aggregateEstimateVsActual,
  aggregateWorkTypeBreakdown,
  aggregateProductivityHeatmap,
  calculateWorkTypeAccuracy,
  filterSessionsByPeriod,
} from '../utils/analytics';
import { EstimateVsActualChart } from '../components/analytics/EstimateVsActualChart';
import { WorkTypeBreakdownChart } from '../components/analytics/WorkTypeBreakdownChart';
import { ProductivityHeatmapChart } from '../components/analytics/ProductivityHeatmapChart';
import { WorkTypeAccuracyCard } from '../components/analytics/WorkTypeAccuracyCard';

const { Title, Text } = Typography;

export interface AnalyticsViewProps {
  db?: TaskPlannerDatabase;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ db = defaultDb }) => {
  const [period, setPeriod] = useState<AnalyticsPeriod>('7d');

  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]);
  const sessions = useLiveQuery(() => db.workSessions.toArray(), [db]);

  if (!tasks || !sessions) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Spin size="large" />
      </div>
    );
  }

  const filteredSessions = filterSessionsByPeriod(sessions, period);

  const estimateVsActualData = aggregateEstimateVsActual(tasks, filteredSessions);
  const workTypeData = aggregateWorkTypeBreakdown(tasks, filteredSessions);
  const heatmapData = aggregateProductivityHeatmap(filteredSessions);
  const accuracySummary = calculateWorkTypeAccuracy(tasks, filteredSessions, period);

  return (
    <div data-testid="analytics-view" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Thống kê hiệu suất & Thời gian làm việc
          </Title>
          <Text type="secondary">
            Phân tích thời gian ước tính, thời gian thực tế và nhịp độ năng suất
          </Text>
        </div>
        <Space>
          <Radio.Group
            value={period}
            onChange={(e) => setPeriod(e.target.value as AnalyticsPeriod)}
            buttonStyle="solid"
          >
            <Radio.Button value="7d">7 ngày qua</Radio.Button>
            <Radio.Button value="14d">14 ngày qua</Radio.Button>
            <Radio.Button value="30d">30 ngày qua</Radio.Button>
            <Radio.Button value="all">Tất cả</Radio.Button>
          </Radio.Group>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Ước tính vs Thực tế (giờ)">
            <EstimateVsActualChart data={estimateVsActualData} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Phân bố theo Loại công việc">
            <WorkTypeBreakdownChart data={workTypeData} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <WorkTypeAccuracyCard summary={accuracySummary} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="Bản đồ nhiệt năng suất (Thứ trong tuần × Khung giờ)">
            <ProductivityHeatmapChart data={heatmapData} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
