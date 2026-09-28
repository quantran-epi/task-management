import React, { useState } from 'react';
import {
  Input,
  Select,
  Segmented,
  Checkbox,
  Radio,
  Space,
  Button,
  Badge,
  DatePicker,
  Row,
  Col,
  theme,
  type InputRef,
} from 'antd';
import { SearchOutlined, FilterOutlined, ClearOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { TaskFilterState } from '../../utils/filter';
import { countActiveAdvancedFilters } from '../../utils/filter';
import type { Project, Milestone, TaskStatus, TaskPriority, WorkType } from '../../types/models';
import { WORK_TYPES } from '../../types/models';
import { WORK_TYPE_CONFIG } from './WorkTypeBadge';

export interface TaskFilterBarProps {
  filters: TaskFilterState;
  onFilterChange: (patch: Partial<TaskFilterState>) => void;
  onResetFilters?: () => void;
  projects?: Project[];
  milestones?: Milestone[];
  availableOpsOwners?: string[];
  availableBAs?: string[];
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
  onResetFilters,
  projects = [],
  milestones = [],
  availableOpsOwners = [],
  availableBAs = [],
  searchInputRef,
}) => {
  const { token } = theme.useToken();
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);

  const activeAdvancedCount = countActiveAdvancedFilters(filters);
  const hasActiveFilters =
    Boolean(filters.search) ||
    filters.hierarchyScope !== 'all' ||
    Boolean(filters.projectId) ||
    filters.horizon !== 'all' ||
    filters.statuses.length !== 4 ||
    filters.priorities.length > 0 ||
    filters.includeClosed ||
    activeAdvancedCount > 0;

  // Filter milestone choices based on selected project
  const eligibleMilestones = filters.projectId
    ? milestones.filter((m) => m.projectId === filters.projectId)
    : milestones;

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
      {/* Top row: Search, Scope, Project, Advanced Toggle, Reset */}
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
            style={{ minWidth: 240, maxWidth: 360, flex: 1 }}
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
            onChange={(val) => {
              onFilterChange({
                projectId: val || null,
                // Clear milestone if it doesn't belong to the newly selected project
                milestoneId:
                  val && filters.milestoneId
                    ? milestones.find((m) => m.id === filters.milestoneId && m.projectId === val)
                      ? filters.milestoneId
                      : null
                    : filters.milestoneId,
              });
            }}
            options={projects.map((p) => ({ label: p.name, value: p.id }))}
            aria-label="Lọc theo dự án"
          />

          <Badge count={activeAdvancedCount} size="small" offset={[-2, 2]}>
            <Button
              icon={<FilterOutlined />}
              type={advancedOpen ? 'primary' : 'default'}
              onClick={() => setAdvancedOpen(!advancedOpen)}
              aria-expanded={advancedOpen}
              aria-label="Bộ lọc nâng cao"
            >
              Bộ lọc nâng cao
            </Button>
          </Badge>

          {onResetFilters && hasActiveFilters && (
            <Button
              icon={<ClearOutlined />}
              onClick={onResetFilters}
              aria-label="Xóa bộ lọc"
            >
              Xóa bộ lọc
            </Button>
          )}
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

      {/* Row 2: Status multiselect, include closed toggle, Priority filter */}
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

      {/* Row 3 (Collapsible): Advanced Filter Panel */}
      {advancedOpen && (
        <div
          style={{
            padding: '14px 16px',
            backgroundColor: token.colorBgContainer,
            borderRadius: 6,
            border: `1px dashed ${token.colorBorder}`,
          }}
        >
          <Row gutter={[16, 12]}>
            {/* Field 1: Execution Date Range */}
            <Col xs={24} sm={12} lg={6}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
                  Thời gian kế hoạch:
                </span>
                <DatePicker.RangePicker
                  style={{ width: '100%' }}
                  placeholder={['Từ ngày', 'Đến ngày']}
                  format="YYYY-MM-DD"
                  value={
                    filters.executionDateRange && filters.executionDateRange[0] && filters.executionDateRange[1]
                      ? [dayjs(filters.executionDateRange[0]), dayjs(filters.executionDateRange[1])]
                      : null
                  }
                  onChange={(dates: [Dayjs | null, Dayjs | null] | null) => {
                    if (dates && dates[0] && dates[1]) {
                      onFilterChange({
                        executionDateRange: [
                          dates[0].format('YYYY-MM-DD'),
                          dates[1].format('YYYY-MM-DD'),
                        ],
                      });
                    } else {
                      onFilterChange({ executionDateRange: null });
                    }
                  }}
                  allowClear
                  aria-label="Khoảng thời gian kế hoạch thực hiện"
                />
              </div>
            </Col>

            {/* Field 2: Deadline Range */}
            <Col xs={24} sm={12} lg={6}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
                  Hạn chót:
                </span>
                <DatePicker.RangePicker
                  style={{ width: '100%' }}
                  placeholder={['Hạn từ', 'Hạn đến']}
                  format="YYYY-MM-DD"
                  value={
                    filters.deadlineRange && filters.deadlineRange[0] && filters.deadlineRange[1]
                      ? [dayjs(filters.deadlineRange[0]), dayjs(filters.deadlineRange[1])]
                      : null
                  }
                  onChange={(dates: [Dayjs | null, Dayjs | null] | null) => {
                    if (dates && dates[0] && dates[1]) {
                      onFilterChange({
                        deadlineRange: [
                          dates[0].format('YYYY-MM-DD'),
                          dates[1].format('YYYY-MM-DD'),
                        ],
                      });
                    } else {
                      onFilterChange({ deadlineRange: null });
                    }
                  }}
                  allowClear
                  aria-label="Khoảng hạn chót hoàn thành"
                />
              </div>
            </Col>

            {/* Field 3: Milestone */}
            <Col xs={24} sm={12} lg={6}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
                  Mốc (Milestone):
                </span>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  placeholder="Lọc theo mốc (Milestone)"
                  value={filters.milestoneId || undefined}
                  onChange={(val) => onFilterChange({ milestoneId: val || null })}
                  options={eligibleMilestones.map((m) => ({ label: m.name, value: m.id }))}
                  aria-label="Lọc theo mốc"
                />
              </div>
            </Col>

            {/* Field 4: Work Types */}
            <Col xs={24} sm={12} lg={6}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
                  Loại việc:
                </span>
                <Select
                  style={{ width: '100%' }}
                  mode="multiple"
                  allowClear
                  placeholder="Tất cả loại việc"
                  value={filters.workTypes}
                  onChange={(vals) => onFilterChange({ workTypes: vals as WorkType[] })}
                  options={WORK_TYPES.map((wt) => {
                    const cfg = WORK_TYPE_CONFIG[wt];
                    return {
                      label: (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: cfg.color,
                            }}
                          />
                          {cfg.label}
                        </span>
                      ),
                      value: wt,
                    };
                  })}
                  maxTagCount="responsive"
                  aria-label="Lọc theo loại công việc"
                />
              </div>
            </Col>

            {/* Field 5: Ops Owner */}
            <Col xs={24} sm={12} lg={6}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
                  Ops Owner:
                </span>
                <Select
                  style={{ width: '100%' }}
                  mode="tags"
                  allowClear
                  placeholder="Lọc theo Ops Owner (Nhập hoặc chọn)"
                  value={filters.opsOwners}
                  onChange={(vals) => onFilterChange({ opsOwners: vals })}
                  options={availableOpsOwners.map((owner) => ({ label: owner, value: owner }))}
                  maxTagCount="responsive"
                  aria-label="Lọc theo Ops Owner"
                />
              </div>
            </Col>

            {/* Field 6: Business Analyst */}
            <Col xs={24} sm={12} lg={6}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
                  BA:
                </span>
                <Select
                  style={{ width: '100%' }}
                  mode="tags"
                  allowClear
                  placeholder="Lọc theo BA (Nhập hoặc chọn)"
                  value={filters.businessAnalysts}
                  onChange={(vals) => onFilterChange({ businessAnalysts: vals })}
                  options={availableBAs.map((ba) => ({ label: ba, value: ba }))}
                  maxTagCount="responsive"
                  aria-label="Lọc theo BA"
                />
              </div>
            </Col>

            {/* Field 7: Jira Status */}
            <Col xs={24} sm={12} lg={6}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
                  Trạng thái Jira:
                </span>
                <Select
                  style={{ width: '100%' }}
                  value={filters.jiraFilter || 'all'}
                  onChange={(val) => onFilterChange({ jiraFilter: val as TaskFilterState['jiraFilter'] })}
                  options={[
                    { label: 'Tất cả trạng thái Jira', value: 'all' },
                    { label: 'Đã gắn Jira', value: 'linked' },
                    { label: 'Chưa gắn Jira', value: 'unlinked' },
                  ]}
                  aria-label="Lọc theo trạng thái Jira"
                />
              </div>
            </Col>
          </Row>
        </div>
      )}
    </div>
  );
};

