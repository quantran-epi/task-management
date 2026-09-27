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
  available: { color: 'success', label: 'Available' },
  full: { color: 'default', label: 'Full' },
  overloaded: { color: 'error', label: 'Overloaded' },
  'excluded-past': { color: 'default', label: 'Past' },
  'excluded-non-working': { color: 'warning', label: 'Non-working' },
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
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (d: string) => (
        <Text style={{ fontSize: 12 }}>
          {dayjs(d, 'YYYY-MM-DD').format('YYYY-MM-DD (ddd)')}
        </Text>
      ),
    },
    {
      title: 'Capacity',
      dataIndex: 'capacityMinutes',
      key: 'capacityMinutes',
      render: (m: number) => <Text style={{ fontSize: 12 }}>{formatMinutes(m)}</Text>,
    },
    {
      title: 'Active Load',
      dataIndex: 'activeLoadMinutes',
      key: 'activeLoadMinutes',
      render: (m: number) => <Text style={{ fontSize: 12 }}>{formatMinutes(m)}</Text>,
    },
    {
      title: 'Net Balance',
      dataIndex: 'netBalanceMinutes',
      key: 'netBalanceMinutes',
      render: (m: number) => <Text style={{ fontSize: 12 }}>{formatMinutes(m)}</Text>,
    },
    {
      title: 'Status',
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
              Inspect Date Details ({dateBreakdown.length} days evaluated)
            </span>
          ),
          children: (
            <div>
              <div style={{ marginBottom: 12 }}>
                <Space orientation="horizontal" size="small" wrap>
                  <Tag color="success">{counts.available} Available</Tag>
                  <Tag color="default">{counts.full} Full</Tag>
                  <Tag color="error">{counts.overloaded} Overloaded</Tag>
                  <Tag color="warning">{counts.excluded} Excluded</Tag>
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
