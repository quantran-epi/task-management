import React from 'react';
import { Collapse, Table, Tag, Typography, Space } from 'antd';
import dayjs from 'dayjs';
import { formatMinutes } from '../../utils/time';
import type { DateInspectionItem, DateInspectionStatus } from '../../types/feasibility';

const { Text } = Typography;

export interface DateInspectionBreakdownProps {
  dateBreakdown: DateInspectionItem[];
}

const STATUS_TAG_CONFIG: Record<DateInspectionStatus, { color: string; label: string }> = {
  available: { color: 'success', label: 'Khả dụng' },
  full: { color: 'default', label: 'Đã đầy' },
  overloaded: { color: 'error', label: 'Quá tải' },
  'excluded-past': { color: 'default', label: 'Đã qua' },
  'excluded-non-working': { color: 'warning', label: 'Ngày nghỉ' },
};

export const DateInspectionBreakdown: React.FC<DateInspectionBreakdownProps> = ({
  dateBreakdown,
}) => {
  const counts = dateBreakdown.reduce(
    (acc, item) => {
      if (item.status === 'available') acc.available++;
      else if (item.status === 'full') acc.full++;
      else if (item.status === 'overloaded') acc.overloaded++;
      else acc.excluded++;
      return acc;
    },
    { available: 0, full: 0, overloaded: 0, excluded: 0 }
  );

  const columns = [
    {
      title: 'Ngày',
      dataIndex: 'date',
      key: 'date',
      render: (d: string) => (
        <Text style={{ fontSize: 12 }}>
          {dayjs(d, 'YYYY-MM-DD').format('YYYY-MM-DD (ddd)')}
        </Text>
      ),
    },
    {
      title: 'Công suất',
      dataIndex: 'capacityMinutes',
      key: 'capacityMinutes',
      render: (m: number) => <Text style={{ fontSize: 12 }}>{formatMinutes(m)}</Text>,
    },
    {
      title: 'Đang dùng',
      dataIndex: 'activeLoadMinutes',
      key: 'activeLoadMinutes',
      render: (m: number) => <Text style={{ fontSize: 12 }}>{formatMinutes(m)}</Text>,
    },
    {
      title: 'Còn lại',
      dataIndex: 'netBalanceMinutes',
      key: 'netBalanceMinutes',
      render: (m: number) => <Text style={{ fontSize: 12 }}>{formatMinutes(m)}</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s: DateInspectionStatus) => {
        const config = STATUS_TAG_CONFIG[s] ?? { color: 'default', label: s };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
  ];

  return (
    <Collapse
      size="small"
      style={{ marginTop: 16 }}
      items={[
        {
          key: 'breakdown',
          label: (
            <span style={{ fontWeight: 600 }}>
              Chi tiết kiểm tra theo ngày ({dateBreakdown.length} ngày được đánh giá)
            </span>
          ),
          children: (
            <div>
              <div style={{ marginBottom: 12 }}>
                <Space orientation="horizontal" size="small" wrap>
                  <Tag color="success">{counts.available} Khả dụng</Tag>
                  <Tag color="default">{counts.full} Đã đầy</Tag>
                  <Tag color="error">{counts.overloaded} Quá tải</Tag>
                  <Tag color="warning">{counts.excluded} Loại trừ</Tag>
                </Space>
              </div>
              <Table
                rowKey="date"
                dataSource={dateBreakdown}
                columns={columns}
                pagination={false}
                size="small"
                scroll={{ x: 420 }}
              />
            </div>
          ),
        },
      ]}
    />
  );
};
