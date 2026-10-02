import React from 'react';
import { Heatmap } from '@ant-design/plots';
import { Empty } from 'antd';
import type { ProductivityHeatmapItem } from '../../types/analytics';

export interface ProductivityHeatmapChartProps {
  data: ProductivityHeatmapItem[];
  height?: number;
}

export const ProductivityHeatmapChart: React.FC<ProductivityHeatmapChartProps> = ({
  data,
  height = 360,
}) => {
  if (data.length === 0) {
    return <Empty description="Chưa có dữ liệu phiên làm việc trong khoảng thời gian này" />;
  }

  const config = {
    data,
    xField: 'hour',
    yField: 'day',
    colorField: 'hours',
    mark: 'cell' as const,
    height,
    autoFit: true,
    legend: {
      color: {
        title: 'Thời gian (giờ)',
        position: 'top',
      },
    },
    style: {
      inset: 0.5,
    },
    tooltip: {
      title: (d: ProductivityHeatmapItem) => `${d.day} - ${d.hour}`,
      items: [
        {
          channel: 'color',
          name: 'Thời gian làm việc',
          valueFormatter: (val: number) => `${val} giờ (${Math.round(val * 60)} phút)`,
        },
      ],
    },
  };

  return <Heatmap {...config} />;
};
