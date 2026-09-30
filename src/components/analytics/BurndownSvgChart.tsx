import React, { useState, useRef, useMemo } from 'react';
import type { MilestoneBurndownSeries, BurndownUnit, BurndownDayPoint } from '../../types/analytics';

export interface BurndownSvgChartProps {
  series: MilestoneBurndownSeries;
  todayStr: string;
  height?: number | undefined;
  unit: BurndownUnit;
}

interface ScaledPoint extends BurndownDayPoint {
  x: number;
  idealY: number;
  actualY: number | null;
}

export const BurndownSvgChart: React.FC<BurndownSvgChartProps> = ({
  series,
  todayStr,
  height = 260,
  unit,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  const unitSuffix = unit === 'hours' ? 'h' : 'tác vụ';

  const viewBoxWidth = 600;
  const viewBoxHeight = height;
  const margin = { top: 20, right: 30, bottom: 35, left: 45 };
  const chartWidth = viewBoxWidth - margin.left - margin.right;
  const chartHeight = viewBoxHeight - margin.top - margin.bottom;

  const points = series.points;

  const maxScope = useMemo(() => {
    let max = series.totalScope;
    for (const p of points) {
      if (p.idealRemaining > max) max = p.idealRemaining;
      if (p.actualRemaining !== null && p.actualRemaining > max) max = p.actualRemaining;
    }
    return Math.max(max, 1);
  }, [series.totalScope, points]);

  const scaledPoints: ScaledPoint[] = useMemo(() => {
    if (points.length === 0) return [];
    const len = points.length;

    return points.map((p, idx) => {
      const x =
        len === 1
          ? margin.left + chartWidth / 2
          : margin.left + (idx / (len - 1)) * chartWidth;
      const idealY = margin.top + chartHeight - (p.idealRemaining / maxScope) * chartHeight;
      const actualY =
        p.actualRemaining !== null
          ? margin.top + chartHeight - (p.actualRemaining / maxScope) * chartHeight
          : null;

      return {
        ...p,
        x,
        idealY,
        actualY,
      };
    });
  }, [points, chartWidth, chartHeight, margin.left, margin.top, maxScope]);

  const idealPolyline = useMemo(() => {
    return scaledPoints.map((p) => `${p.x.toFixed(1)},${p.idealY.toFixed(1)}`).join(' ');
  }, [scaledPoints]);

  const actualPoints = useMemo(() => {
    return scaledPoints.filter(
      (p): p is ScaledPoint & { actualY: number; actualRemaining: number } =>
        p.actualY !== null && p.actualRemaining !== null
    );
  }, [scaledPoints]);

  const actualPolyline = useMemo(() => {
    return actualPoints.map((p) => `${p.x.toFixed(1)},${p.actualY.toFixed(1)}`).join(' ');
  }, [actualPoints]);

  // Today marker calculation per D-03
  const todayPoint = useMemo(() => {
    const match = scaledPoints.find((p) => p.date === todayStr);
    if (match) return match;
    // Fallback: point closest to todayStr or last actual point
    return actualPoints.length > 0 ? actualPoints[actualPoints.length - 1] : undefined;
  }, [scaledPoints, todayStr, actualPoints]);

  const handlePointerMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    if (scaledPoints.length === 0) return;

    let clientX = 0;
    if ('touches' in e) {
      const touch = e.touches[0];
      if (!touch) return;
      clientX = touch.clientX;
    } else {
      clientX = e.clientX;
    }

    let svgX = clientX;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0) {
        svgX = ((clientX - rect.left) / rect.width) * viewBoxWidth;
      }
    }

    // Find nearest point index
    let closestIndex = 0;
    let minDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < scaledPoints.length; i++) {
      const p = scaledPoints[i];
      if (!p) continue;
      const diff = Math.abs(p.x - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }

    setActivePointIndex(closestIndex);
  };

  const handlePointerLeave = () => {
    setActivePointIndex(null);
  };

  const activePoint = activePointIndex !== null ? scaledPoints[activePointIndex] : undefined;

  // Compute tooltip position
  const tooltipStyle = useMemo<React.CSSProperties | null>(() => {
    if (!activePoint) return null;
    const isRightHalf = activePoint.x > viewBoxWidth / 2;
    const leftPercent = (activePoint.x / viewBoxWidth) * 100;

    return {
      position: 'absolute',
      top: 16,
      left: isRightHalf ? undefined : `${Math.min(leftPercent + 3, 75)}%`,
      right: isRightHalf ? `${Math.max(100 - leftPercent + 3, 5)}%` : undefined,
      pointerEvents: 'none',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      border: '1px solid #e8e8e8',
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 12,
      zIndex: 10,
      maxWidth: 220,
    };
  }, [activePoint, viewBoxWidth]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', userSelect: 'none' }}
    >
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        role="img"
        aria-label="Milestone burndown chart"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerLeave}
      >
        {/* Background axes & grid */}
        <line
          x1={margin.left}
          y1={margin.top + chartHeight}
          x2={margin.left + chartWidth}
          y2={margin.top + chartHeight}
          stroke="#d9d9d9"
          strokeWidth={1}
        />
        <line
          x1={margin.left}
          y1={margin.top}
          x2={margin.left}
          y2={margin.top + chartHeight}
          stroke="#d9d9d9"
          strokeWidth={1}
        />

        {/* 50% horizontal guide */}
        <line
          x1={margin.left}
          y1={margin.top + chartHeight / 2}
          x2={margin.left + chartWidth}
          y2={margin.top + chartHeight / 2}
          stroke="#f0f0f0"
          strokeDasharray="2 2"
          strokeWidth={1}
        />

        {/* Y-axis labels */}
        <text
          x={margin.left - 6}
          y={margin.top + 4}
          textAnchor="end"
          fontSize={10}
          fill="#8c8c8c"
        >
          {maxScope.toFixed(0)} {unitSuffix}
        </text>
        <text
          x={margin.left - 6}
          y={margin.top + chartHeight / 2 + 4}
          textAnchor="end"
          fontSize={10}
          fill="#8c8c8c"
        >
          {(maxScope / 2).toFixed(0)}
        </text>
        <text
          x={margin.left - 6}
          y={margin.top + chartHeight + 4}
          textAnchor="end"
          fontSize={10}
          fill="#8c8c8c"
        >
          0
        </text>

        {/* X-axis date labels */}
        {scaledPoints.length > 0 && scaledPoints[0] && (
          <text
            x={scaledPoints[0].x}
            y={margin.top + chartHeight + 18}
            textAnchor="start"
            fontSize={10}
            fill="#8c8c8c"
          >
            {scaledPoints[0].date.slice(5)}
          </text>
        )}
        {scaledPoints.length > 1 && scaledPoints[scaledPoints.length - 1] && (
          <text
            x={scaledPoints[scaledPoints.length - 1]!.x}
            y={margin.top + chartHeight + 18}
            textAnchor="end"
            fontSize={10}
            fill="#8c8c8c"
          >
            {scaledPoints[scaledPoints.length - 1]!.date.slice(5)}
          </text>
        )}

        {/* Ideal pace line (dashed) */}
        {scaledPoints.length > 0 && (
          <polyline
            data-testid="ideal-pace-line"
            points={idealPolyline}
            fill="none"
            stroke="#8c8c8c"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          />
        )}

        {/* Today vertical line per D-03 */}
        {todayPoint && (
          <line
            data-testid="today-vertical-line"
            x1={todayPoint.x}
            y1={margin.top}
            x2={todayPoint.x}
            y2={margin.top + chartHeight}
            stroke="#1677ff"
            strokeDasharray="3 3"
            strokeWidth={1.5}
          />
        )}

        {/* Actual burndown line */}
        {actualPoints.length > 0 && (
          <polyline
            data-testid="actual-burndown-line"
            points={actualPolyline}
            fill="none"
            stroke="#1677ff"
            strokeWidth={2.5}
          />
        )}

        {/* Actual points markers */}
        {actualPoints.map((p) => (
          <circle
            key={p.date}
            data-testid={`actual-point-${p.date}`}
            cx={p.x}
            cy={p.actualY}
            r={3}
            fill="#1677ff"
          />
        ))}

        {/* Highlighted Today marker point per D-03 */}
        {todayPoint && todayPoint.actualY !== null && (
          <circle
            data-testid="today-marker-point"
            cx={todayPoint.x}
            cy={todayPoint.actualY}
            r={4.5}
            fill="#1677ff"
            stroke="#ffffff"
            strokeWidth={2}
          />
        )}

        {/* Interactive crosshair line per D-04 */}
        {activePoint && (
          <line
            data-testid="crosshair-line"
            x1={activePoint.x}
            y1={margin.top}
            x2={activePoint.x}
            y2={margin.top + chartHeight}
            stroke="#d9d9d9"
            strokeDasharray="2 2"
            strokeWidth={1.5}
          />
        )}
      </svg>

      {/* Interactive Tooltip Card per D-04 */}
      {activePoint && tooltipStyle && (
        <div data-testid="burndown-tooltip" style={tooltipStyle}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: '#262626' }}>
            {activePoint.date}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: '#8c8c8c' }}>Lý tưởng:</span>
            <span style={{ fontWeight: 500 }}>
              {activePoint.idealRemaining} {unitSuffix}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: '#1677ff' }}>Thực tế:</span>
            <span style={{ fontWeight: 500 }}>
              {activePoint.actualRemaining !== null
                ? `${activePoint.actualRemaining} ${unitSuffix}`
                : 'Chưa có'}
            </span>
          </div>
          {activePoint.actualRemaining !== null && (
            <div
              style={{
                marginTop: 4,
                paddingTop: 4,
                borderTop: '1px solid #f0f0f0',
                fontSize: 11,
              }}
            >
              {(() => {
                const delta = activePoint.actualRemaining - activePoint.idealRemaining;
                if (Math.abs(delta) < 0.05) {
                  return <span style={{ color: '#52c41a' }}>Đúng tiến độ</span>;
                }
                if (delta > 0) {
                  return (
                    <span style={{ color: '#fa8c16' }}>
                      Chậm {delta.toFixed(1)} {unitSuffix}
                    </span>
                  );
                }
                return (
                  <span style={{ color: '#52c41a' }}>
                    Nhanh {Math.abs(delta).toFixed(1)} {unitSuffix}
                  </span>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
