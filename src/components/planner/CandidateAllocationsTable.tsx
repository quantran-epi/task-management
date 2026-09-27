import React from 'react';
import { Table, Checkbox, InputNumber, Typography, Empty } from 'antd';
import dayjs from 'dayjs';
import { formatMinutes } from '../../utils/time';
import type { CandidateAllocation } from '../../types/feasibility';

const { Text } = Typography;

export interface CandidateAllocationsTableProps {
  candidates: CandidateAllocation[];
  onToggleCandidate: (date: string, included: boolean) => void;
  onChangeMinutes: (date: string, minutes: number) => void;
  taskRemainingMinutes: number;
  isMobile?: boolean;
}

export const CandidateAllocationsTable: React.FC<CandidateAllocationsTableProps> = ({
  candidates,
  onToggleCandidate,
  onChangeMinutes,
  taskRemainingMinutes,
  isMobile,
}) => {
  const totalProposed = candidates.reduce(
    (sum, c) => sum + (c.included ? c.proposedAllocatedMinutes : 0),
    0
  );

  const columns = [
    {
      title: 'Chọn',
      key: 'included',
      width: 70,
      render: (_: unknown, record: CandidateAllocation) => (
        <Checkbox
          checked={record.included}
          onChange={(e) => onToggleCandidate(record.date, e.target.checked)}
          aria-label={`Chọn ${record.date}`}
          style={{ minHeight: isMobile ? 44 : undefined, display: 'inline-flex', alignItems: 'center' }}
        />
      ),
    },
    {
      title: 'Ngày',
      dataIndex: 'date',
      key: 'date',
      render: (d: string) => (
        <Text strong style={{ fontSize: 13 }}>
          {dayjs(d, 'YYYY-MM-DD').format('YYYY-MM-DD (ddd)')}
        </Text>
      ),
    },
    {
      title: 'Hiện có',
      dataIndex: 'existingAllocatedMinutes',
      key: 'existing',
      render: (m: number) => (
        <Text type="secondary">{m > 0 ? formatMinutes(m) : '-'}</Text>
      ),
    },
    {
      title: 'Đề xuất',
      key: 'proposed',
      render: (_: unknown, record: CandidateAllocation) => (
        <InputNumber
          min={0}
          max={record.maxAvailableMinutes}
          step={15}
          value={record.proposedAllocatedMinutes}
          disabled={!record.included}
          onChange={(v) => onChangeMinutes(record.date, Math.max(0, Math.round(v ?? 0)))}
          suffix="m"
          style={{ width: 90 }}
          aria-label={`Số phút đề xuất cho ${record.date}`}
        />
      ),
    },
    {
      title: 'Tổng kết quả',
      key: 'total',
      render: (_: unknown, record: CandidateAllocation) => {
        const resulting =
          record.existingAllocatedMinutes +
          (record.included ? record.proposedAllocatedMinutes : 0);
        return <Text strong>{formatMinutes(resulting)}</Text>;
      },
    },
  ];

  if (candidates.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <Text strong style={{ display: 'block', fontSize: 16, marginBottom: 4 }}>
              Không tìm thấy ngày phù hợp
            </Text>
            <Text type="secondary" style={{ fontSize: 14 }}>
              Tất cả các ngày trong khoảng đã chọn là ngày nghỉ, đã kín lịch hoặc đã qua. Hãy điều chỉnh khoảng ngày hoặc thêm ngày ngoại lệ.
            </Text>
          </div>
        }
        style={{ margin: '24px 0' }}
      />
    );
  }

  return (
    <div>
      <Table
        rowKey="date"
        dataSource={candidates}
        columns={columns}
        pagination={false}
        size="small"
        scroll={{ x: 480 }}
        footer={() => (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            <span>Tổng đề xuất: {formatMinutes(totalProposed)}</span>
            <Text type={totalProposed < taskRemainingMinutes ? 'warning' : 'secondary'}>
              Ước tính còn lại của tác vụ: {formatMinutes(taskRemainingMinutes)}
            </Text>
          </div>
        )}
      />
    </div>
  );
};
