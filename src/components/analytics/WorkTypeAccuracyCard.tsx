import React from 'react';
import { Card, Table, Tag, Progress, Alert, Empty, Row, Col, Typography, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Column } from '@ant-design/plots';
import { BulbOutlined } from '@ant-design/icons';
import type { WorkTypeAccuracyItem, WorkTypeAccuracySummary } from '../../types/analytics';

const { Text } = Typography;

export interface WorkTypeAccuracyCardProps {
  summary: WorkTypeAccuracySummary;
  height?: number;
}

const getBiasTag = (item: WorkTypeAccuracyItem) => {
  switch (item.bias) {
    case 'underestimate':
      return <Tag color="volcano">{item.biasLabel}</Tag>;
    case 'overestimate':
      return <Tag color="blue">{item.biasLabel}</Tag>;
    case 'accurate':
      return <Tag color="success">{item.biasLabel}</Tag>;
    case 'no_estimate':
    case 'no_actual':
    default:
      return <Tag>{item.biasLabel}</Tag>;
  }
};

const getProgressStatus = (item: WorkTypeAccuracyItem) => {
  if (item.bias === 'accurate') return 'success';
  if (item.bias === 'underestimate') return 'exception';
  return 'normal';
};

export const WorkTypeAccuracyCard: React.FC<WorkTypeAccuracyCardProps> = ({
  summary,
  height = 280,
}) => {
  const { items, chartData, insightTip, overallBias } = summary;

  if (items.length === 0) {
    return (
      <Card title="Độ chính xác ước tính theo Loại công việc">
        <Empty description="Chưa có dữ liệu tác vụ và phiên làm việc để đánh giá độ chính xác" />
      </Card>
    );
  }

  const columns: ColumnsType<WorkTypeAccuracyItem> = [
    {
      title: 'Loại công việc',
      dataIndex: 'workTypeLabel',
      key: 'workTypeLabel',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Số task',
      dataIndex: 'taskCount',
      key: 'taskCount',
      align: 'center',
      render: (count: number) => <Tag>{count}</Tag>,
    },
    {
      title: 'Dự tính',
      dataIndex: 'estimateHours',
      key: 'estimateHours',
      align: 'right',
      render: (h: number) => `${h}h`,
    },
    {
      title: 'Thực tế',
      dataIndex: 'actualHours',
      key: 'actualHours',
      align: 'right',
      render: (h: number) => `${h}h`,
    },
    {
      title: 'Chênh lệch',
      key: 'variance',
      align: 'right',
      render: (_: unknown, record: WorkTypeAccuracyItem) => {
        const sign = record.varianceHours > 0 ? '+' : '';
        const color =
          record.bias === 'underestimate'
            ? '#cf1322'
            : record.bias === 'overestimate'
              ? '#0958d9'
              : '#389e0d';
        return (
          <span style={{ color, fontWeight: 500 }}>
            {sign}
            {record.varianceHours}h ({sign}
            {record.variancePercent}%)
          </span>
        );
      },
    },
    {
      title: 'Độ chính xác',
      dataIndex: 'accuracyPercent',
      key: 'accuracyPercent',
      render: (pct: number, record: WorkTypeAccuracyItem) => (
        <Progress
          percent={pct}
          size="small"
          status={getProgressStatus(record)}
          format={(val) => `${val}%`}
          style={{ minWidth: 100 }}
        />
      ),
    },
    {
      title: 'Đánh giá xu hướng',
      key: 'bias',
      render: (_: unknown, record: WorkTypeAccuracyItem) => getBiasTag(record),
    },
  ];

  const chartConfig = {
    data: chartData,
    xField: 'workType',
    yField: 'hours',
    colorField: 'type',
    group: true,
    height,
    autoFit: true,
    axis: {
      y: { title: 'Giờ (h)' },
      x: { title: 'Loại công việc' },
    },
    tooltip: {
      items: [{ channel: 'y', valueFormatter: (val: number) => `${val} giờ` }],
    },
  };

  const alertType =
    overallBias === 'accurate' ? 'success' : overallBias === 'underestimate' ? 'warning' : 'info';

  return (
    <Card
      title={
        <Space vertical size={2}>
          <span>Độ chính xác ước tính theo Loại công việc</span>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
            So sánh ước tính vs thực tế để nhận diện thói quen estimate non hay già cho từng mảng
          </Text>
        </Space>
      }
      extra={
        <Space>
          <Text type="secondary">Xu hướng tổng thể:</Text>
          <Tag
            color={
              overallBias === 'underestimate'
                ? 'volcano'
                : overallBias === 'overestimate'
                  ? 'blue'
                  : 'success'
            }
          >
            {summary.overallBiasLabel}
          </Tag>
          <Tag color="cyan">
            Độ chính xác TB: {summary.overallAccuracyPercent}%
          </Tag>
        </Space>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Alert
          description={insightTip}
          type={alertType}
          showIcon
          icon={<BulbOutlined />}
          style={{ fontSize: 13 }}
        />

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={10}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Biểu đồ so sánh (giờ)</div>
            {chartData.length > 0 ? (
              <Column {...chartConfig} />
            ) : (
              <Empty description="Chưa có dữ liệu biểu đồ" />
            )}
          </Col>
          <Col xs={24} lg={14}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Bảng chi tiết & Đánh giá</div>
            <Table
              dataSource={items}
              columns={columns}
              rowKey="workType"
              pagination={false}
              size="small"
              scroll={{ x: 500 }}
            />
          </Col>
        </Row>
      </div>
    </Card>
  );
};
