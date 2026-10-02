import React from 'react';
import { Column } from '@ant-design/plots';
import { Empty } from 'antd';
import type { EstimateVsActualItem } from '../../types/analytics';

export interface EstimateVsActualChartProps {
  data: EstimateVsActualItem[];
  height?: number;
}

export const EstimateVsActualChart: React.FC<EstimateVsActualChartProps> = ({
  data,
  height = 360,
}) => {
  if (data.length === 0) {
    return <Empty description="Chưa có dữ liệu ước tính hoặc thực tế" />;
  }

  const config = {
    data,
    xField: 'task',
    yField: 'hours',
    colorField: 'type',
    group: true,
    height,
    autoFit: true,
    axis: {
      y: { title: 'Giờ (h)' },
      x: { title: 'Tác vụ' },
    },
    tooltip: {
      items: [{ channel: 'y', valueFormatter: (val: number) => `${val} giờ` }],
    },
  };

  return <Column {...config} />;
};
