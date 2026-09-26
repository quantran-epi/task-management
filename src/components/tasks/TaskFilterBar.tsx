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
  { label: 'Open', value: 'Open' },
  { label: 'In Progress', value: 'In Progress' },
  { label: 'Resolved', value: 'Resolved' },
  { label: 'In Review', value: 'In Review' },
  { label: 'Done', value: 'Done' },
  { label: 'Cancelled', value: 'Cancelled' },
];

const ALL_PRIORITIES: { label: string; value: TaskPriority }[] = [
  { label: 'Urgent', value: 'Urgent' },
  { label: 'High', value: 'High' },
  { label: 'Medium', value: 'Medium' },
  { label: 'Low', value: 'Low' },
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
            placeholder="Search tasks (Press '/' to focus)..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            style={{ minWidth: 260, maxWidth: 380, flex: 1 }}
            allowClear
            aria-label="Search tasks"
          />

          <Segmented
            options={[
              { label: 'All', value: 'all' },
              { label: 'Projects', value: 'projects' },
              { label: 'Standalone', value: 'standalone' },
            ]}
            value={filters.hierarchyScope}
            onChange={(val) => onFilterChange({ hierarchyScope: val as TaskFilterState['hierarchyScope'] })}
            aria-label="Filter scope"
          />

          <Select
            allowClear
            placeholder="Filter by Project"
            style={{ minWidth: 160 }}
            value={filters.projectId || undefined}
            onChange={(val) => onFilterChange({ projectId: val || null })}
            options={projects.map((p) => ({ label: p.name, value: p.id }))}
            aria-label="Filter by project"
          />
        </div>

        {/* Date Horizons */}
        <Radio.Group
          value={filters.horizon}
          onChange={(e) => onFilterChange({ horizon: e.target.value })}
          optionType="button"
          buttonStyle="solid"
          size="middle"
          aria-label="Filter horizon"
        >
          <Radio.Button value="all">All</Radio.Button>
          <Radio.Button value="overdue">Overdue</Radio.Button>
          <Radio.Button value="today">Today</Radio.Button>
          <Radio.Button value="this_week">This Week</Radio.Button>
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
            Status:
          </span>
          <Select
            mode="multiple"
            allowClear
            style={{ minWidth: 220 }}
            placeholder="Active statuses"
            value={filters.statuses}
            onChange={(vals) => onFilterChange({ statuses: vals as TaskStatus[] })}
            options={ALL_STATUSES}
            maxTagCount="responsive"
            aria-label="Filter by status"
          />
          <Checkbox
            checked={filters.includeClosed}
            onChange={(e) => onFilterChange({ includeClosed: e.target.checked })}
          >
            Include Done & Cancelled
          </Checkbox>
        </Space>

        <Space orientation="horizontal" size="small" style={{ alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
            Priority:
          </span>
          <Select
            mode="multiple"
            allowClear
            style={{ minWidth: 160 }}
            placeholder="All Priorities"
            value={filters.priorities}
            onChange={(vals) => onFilterChange({ priorities: vals as TaskPriority[] })}
            options={ALL_PRIORITIES}
            maxTagCount="responsive"
            aria-label="Filter by priority"
          />
        </Space>
      </div>
    </div>
  );
};
