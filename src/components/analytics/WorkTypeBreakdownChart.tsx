import React from 'react';
import { Pie } from '@ant-design/plots';
import { Empty } from 'antd';
import type { WorkTypeBreakdownItem } from '../../types/analytics';

export interface WorkTypeBreakdownChartProps {
  data: WorkTypeBreakdownItem[];
  height?: number;
}

export const WorkTypeBreakdownChart: React.FC<WorkTypeBreakdownChartProps> = ({
  data,
  height = 360,
}) => {
  if (data.length === 0) {
    return <Empty description="Chưa có dữ liệu phiên làm việc" />;
  }

  const config = {
    data,
    angleField: 'hours',
    colorField: 'type',
    innerRadius: 0.6,
    height,
    autoFit: true,
    legend: {
      color: {
        title: false,
        position: 'right',
        rowPadding: 5,
      },
    },
    tooltip: {
      items: [{ channel: 'y', valueFormatter: (val: number) => `${val} giờ` }],
    },
  };

  return <Pie {...config} />;
};
