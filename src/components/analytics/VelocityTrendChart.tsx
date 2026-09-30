import React from 'react';
import { Tooltip } from 'antd';
import type { WeeklyVelocityBucket } from '../../types/analytics';

export interface VelocityTrendChartProps {
  buckets: WeeklyVelocityBucket[];
  height?: number | undefined;
}

export const VelocityTrendChart: React.FC<VelocityTrendChartProps> = ({
  buckets,
  height = 60,
}) => {
  if (buckets.length === 0) {
    return (
      <div
        data-testid="velocity-chart-empty"
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8c8c8c',
          fontSize: 12,
        }}
      >
        Chưa có dữ liệu
      </div>
    );
  }

  const viewBoxWidth = 240;
  const viewBoxHeight = height;
  const margin = { top: 6, right: 8, bottom: 18, left: 8 };
  const chartWidth = viewBoxWidth - margin.left - margin.right;
  const chartHeight = Math.max(10, viewBoxHeight - margin.top - margin.bottom);

  const maxTasks = Math.max(
    1,
    ...buckets.map((b) => b.completedTasksCount)
  );

  const slotWidth = chartWidth / buckets.length;
  const barWidth = Math.max(6, Math.min(20, slotWidth * 0.6));

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        role="img"
        aria-label="Biểu đồ vận tốc hoàn thành theo tuần"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {/* Baseline */}
        <line
          x1={margin.left}
          y1={margin.top + chartHeight}
          x2={margin.left + chartWidth}
          y2={margin.top + chartHeight}
          stroke="#f0f0f0"
          strokeWidth={1}
        />

        {buckets.map((bucket, index) => {
          const barHeight =
            bucket.completedTasksCount > 0
              ? Math.max(4, (bucket.completedTasksCount / maxTasks) * chartHeight)
              : 2;
          const barX = margin.left + index * slotWidth + (slotWidth - barWidth) / 2;
          const barY = margin.top + chartHeight - barHeight;

          // Short label for X axis (e.g. "15/09")
          const shortDate = bucket.startDate.slice(5).replace('-', '/');

          return (
            <Tooltip
              key={bucket.startDate}
              title={
                <div>
                  <div style={{ fontWeight: 600 }}>{bucket.weekLabel}</div>
                  <div>Hoàn thành: {bucket.completedTasksCount} tác vụ</div>
                  <div>Thời gian: {bucket.completedHours}h</div>
                </div>
              }
            >
              <g style={{ cursor: 'pointer' }}>
                <rect
                  data-testid={`velocity-bar-${bucket.startDate}`}
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  rx={2}
                  fill={bucket.completedTasksCount > 0 ? '#1677ff' : '#d9d9d9'}
                />
                <text
                  x={barX + barWidth / 2}
                  y={margin.top + chartHeight + 12}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#8c8c8c"
                >
                  {shortDate}
                </text>
              </g>
            </Tooltip>
          );
        })}
      </svg>
    </div>
  );
};
