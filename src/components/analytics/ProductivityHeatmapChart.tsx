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
    scale: {
      x: {
        domain: Array.from(new Set(data.map((d) => d.hour))).sort(),
      },
      y: {
        domain: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'],
      },
    },
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
