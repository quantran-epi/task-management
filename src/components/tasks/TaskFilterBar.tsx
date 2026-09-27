import React from 'react';
import {
  Input,
  Select,
  Segmented,
  Checkbox,
  Radio,
  Space,
  theme,
  type InputRef,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { TaskFilterState } from '../../utils/filter';
import type { Project, TaskStatus, TaskPriority } from '../../types/models';

export interface TaskFilterBarProps {
  filters: TaskFilterState;
  onFilterChange: (patch: Partial<TaskFilterState>) => void;
  projects?: Project[];
  searchInputRef?: React.Ref<InputRef>;
}

const ALL_STATUSES: { label: string; value: TaskStatus }[] = [
  { label: 'Mở', value: 'Open' },
  { label: 'Đang làm', value: 'In Progress' },
  { label: 'Đã giải quyết', value: 'Resolved' },
  { label: 'Đang duyệt', value: 'In Review' },
  { label: 'Hoàn thành', value: 'Done' },
  { label: 'Đã hủy', value: 'Cancelled' },
];

const ALL_PRIORITIES: { label: string; value: TaskPriority }[] = [
  { label: 'Khẩn cấp', value: 'Urgent' },
  { label: 'Cao', value: 'High' },
  { label: 'Trung bình', value: 'Medium' },
  { label: 'Thấp', value: 'Low' },
];

export const TaskFilterBar: React.FC<TaskFilterBarProps> = ({
  filters,
  onFilterChange,
  projects = [],
  searchInputRef,
}) => {
  const { token } = theme.useToken();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '12px 16px',
        backgroundColor: token.colorFillAlter,
        borderRadius: 8,
        border: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      {/* Top row: Search, Scope, Project */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', flex: 1 }}>
          <Input
            ref={searchInputRef}
            id="task-search-input"
            data-shortcut-id="task-search-input"
            prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
            placeholder="Tìm kiếm tác vụ (Nhấn '/' để tìm)..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            style={{ minWidth: 260, maxWidth: 380, flex: 1 }}
            allowClear
            aria-label="Tìm kiếm tác vụ"
          />

          <Segmented
            options={[
              { label: 'Tất cả', value: 'all' },
              { label: 'Dự án', value: 'projects' },
              { label: 'Độc lập', value: 'standalone' },
            ]}
            value={filters.hierarchyScope}
            onChange={(val) => onFilterChange({ hierarchyScope: val as TaskFilterState['hierarchyScope'] })}
            aria-label="Phạm vi lọc"
          />

          <Select
            allowClear
            placeholder="Lọc theo Dự án"
            style={{ minWidth: 160 }}
            value={filters.projectId || undefined}
            onChange={(val) => onFilterChange({ projectId: val || null })}
            options={projects.map((p) => ({ label: p.name, value: p.id }))}
            aria-label="Lọc theo dự án"
          />
        </div>

        {/* Date Horizons */}
        <Radio.Group
          value={filters.horizon}
          onChange={(e) => onFilterChange({ horizon: e.target.value })}
          optionType="button"
          buttonStyle="solid"
          size="middle"
          aria-label="Khoảng thời gian"
        >
          <Radio.Button value="all">Tất cả</Radio.Button>
          <Radio.Button value="overdue">Quá hạn</Radio.Button>
          <Radio.Button value="today">Hôm nay</Radio.Button>
          <Radio.Button value="this_week">Tuần này</Radio.Button>
        </Radio.Group>
      </div>

      {/* Bottom row: Status multiselect, include closed toggle, Priority filter */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'center',
        }}
      >
        <Space orientation="horizontal" size="small" style={{ alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
            Trạng thái:
          </span>
          <Select
            mode="multiple"
            allowClear
            style={{ minWidth: 220 }}
            placeholder="Trạng thái đang hoạt động"
            value={filters.statuses}
            onChange={(vals) => onFilterChange({ statuses: vals as TaskStatus[] })}
            options={ALL_STATUSES}
            maxTagCount="responsive"
            aria-label="Lọc theo trạng thái"
          />
          <Checkbox
            checked={filters.includeClosed}
            onChange={(e) => onFilterChange({ includeClosed: e.target.checked })}
          >
            Bao gồm Hoàn thành & Đã hủy
          </Checkbox>
        </Space>

        <Space orientation="horizontal" size="small" style={{ alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
            Độ ưu tiên:
          </span>
          <Select
            mode="multiple"
            allowClear
            style={{ minWidth: 160 }}
            placeholder="Tất cả độ ưu tiên"
            value={filters.priorities}
            onChange={(vals) => onFilterChange({ priorities: vals as TaskPriority[] })}
            options={ALL_PRIORITIES}
            maxTagCount="responsive"
            aria-label="Lọc theo độ ưu tiên"
          />
        </Space>
      </div>
    </div>
  );
};
