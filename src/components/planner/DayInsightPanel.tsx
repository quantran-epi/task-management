import React from 'react';
import { Table, Tag, Typography, Space, Empty, Alert, Progress } from 'antd';
import dayjs from 'dayjs';
import { formatMinutes } from '../../utils/time';
import type { DayInsightData, DayInsightRow } from '../../utils/dayInsight';

const { Text } = Typography;

const DELTA_TOLERANCE_PERCENT = 15; // ±15% considered on-track

export interface DayInsightPanelProps {
  data: DayInsightData;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function deltaColor(row: DayInsightRow): string | undefined {
  if (row.plannedMinutes === 0 && row.actualMinutes === 0) return undefined;
  if (row.deltaMinutes === 0) return '#52c41a';
  return row.deltaMinutes > 0 ? '#faad14' : '#ff4d4f';
}

function signedMinutes(m: number): string {
  if (m === 0) return '0m';
  const sign = m > 0 ? '+' : '-';
  return `${sign}${formatMinutes(Math.abs(m))}`;
}

export const DayInsightPanel: React.FC<DayInsightPanelProps> = ({ data }) => {
  const { date, capacityMinutes, totalPlannedMinutes, totalActualMinutes, rows, loading } = data;
  const formattedDate = dayjs(date, 'YYYY-MM-DD').format('ddd, DD/MM/YYYY');
  const totalDelta = totalActualMinutes - totalPlannedMinutes;

  const plannedPct = pct(totalPlannedMinutes, capacityMinutes);
  const actualPct = pct(totalActualMinutes, capacityMinutes);

  const tolerance = Math.max(1, Math.round((totalPlannedMinutes * DELTA_TOLERANCE_PERCENT) / 100));
  const onTrack =
    totalPlannedMinutes > 0 &&
    Math.abs(totalDelta) <= tolerance;

  const columns = [
    {
      title: 'Tác vụ',
      dataIndex: 'taskName',
      key: 'taskName',
      render: (_: string, row: DayInsightRow) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text style={{ opacity: row.isActive ? 1 : 0.55 }}>{row.taskName}</Text>
          {row.projectName && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {row.projectName}
            </Text>
          )}
          {!row.isActive && (
            <Tag color="default" style={{ marginTop: 2, fontSize: 10 }}>
              Không hoạt động
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Kế hoạch',
      dataIndex: 'plannedMinutes',
      key: 'plannedMinutes',
      width: 110,
      align: 'right' as const,
      render: (m: number) => <Text>{formatMinutes(m)}</Text>,
    },
    {
      title: 'Thực tế',
      dataIndex: 'actualMinutes',
      key: 'actualMinutes',
      width: 110,
      align: 'right' as const,
      render: (m: number) => <Text>{formatMinutes(m)}</Text>,
    },
    {
      title: 'Chênh lệch',
      dataIndex: 'deltaMinutes',
      key: 'deltaMinutes',
      width: 120,
      align: 'right' as const,
      render: (_: number, row: DayInsightRow) => (
        <Text strong style={{ color: deltaColor(row) }}>
          {signedMinutes(row.deltaMinutes)}
        </Text>
      ),
    },
  ];

  return (
    <div data-testid="day-insight-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <Text strong style={{ fontSize: 16 }}>
          {formattedDate}
        </Text>
      </div>

      {capacityMinutes === 0 && (
        <Alert
          type="info"
          showIcon
          message="Ngày nghỉ / không có sức chứa cho ngày này."
        />
      )}

      <Space wrap size="small">
        <Tag color="blue">Sức chứa: {formatMinutes(capacityMinutes)}</Tag>
        <Tag color="geekblue">
          Kế hoạch: {formatMinutes(totalPlannedMinutes)}
          {capacityMinutes > 0 && ` (${plannedPct}%)`}
        </Tag>
        <Tag color="purple">
          Thực tế: {formatMinutes(totalActualMinutes)}
          {capacityMinutes > 0 && ` (${actualPct}%)`}
        </Tag>
        <Tag color={onTrack ? 'success' : totalDelta > 0 ? 'warning' : 'error'}>
          Chênh lệch: {signedMinutes(totalDelta)}
        </Tag>
      </Space>

      {capacityMinutes > 0 && (
        <div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Kế hoạch vs Sức chứa
          </Text>
          <Progress percent={Math.min(plannedPct, 100)} size="small" showInfo={false} />
          <Text type="secondary" style={{ fontSize: 11 }}>
            Thực tế vs Sức chứa
          </Text>
          <Progress
            percent={Math.min(actualPct, 100)}
            size="small"
            showInfo={false}
            status={actualPct > 100 ? 'exception' : 'normal'}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <Empty description="Không có kế hoạch và không có thời gian log cho ngày này." />
      ) : (
        <Table<DayInsightRow>
          rowKey="taskId"
          dataSource={rows}
          columns={columns}
          pagination={false}
          size="small"
          loading={loading}
        />
      )}
    </div>
  );
};
