import React, { useState } from 'react';
import { Input, Select, Segmented, Checkbox, Button, Badge, Row, Col, useAntdToken, DateRangePicker, Popover, Tooltip } from '../ui';
import type { InputRef } from 'antd';
import { SearchOutlined, FilterOutlined, ClearOutlined } from '../ui/icon';
import dayjs, { type Dayjs } from 'dayjs';
import type { TaskFilterState, TaskSortKey } from '../../utils/filter';
import { DEFAULT_TASK_FILTER_STATE, countActiveAdvancedFilters, TASK_SORT_OPTIONS, DEFAULT_TASK_SORT } from '../../utils/filter';
import type { ChangeRequest, System, TaskStatus, TaskPriority, WorkType } from '../../types/models';
import { WORK_TYPES } from '../../types/models';
import { WORK_TYPE_CONFIG } from './WorkTypeBadge';
import { TaskColumnCustomization } from './TaskTable';

export interface TaskFilterBarProps {
  filters: TaskFilterState;
  onFilterChange: (patch: Partial<TaskFilterState>) => void;
  onResetFilters?: () => void;
  changeRequests?: ChangeRequest[];
  systems?: System[];
  availableOpsOwners?: string[];
  availableBAs?: string[];
  searchInputRef?: React.Ref<InputRef>;
  containerRef?: React.Ref<HTMLDivElement>;
  visibleColumns?: string[];
  onVisibleColumnsChange?: (keys: string[]) => void;
  globalSort?: TaskSortKey;
  onGlobalSortChange?: (key: TaskSortKey) => void;
}

const ALL_STATUSES: { label: string; value: TaskStatus }[] = [
  { label: 'Mở', value: 'Open' },
  { label: 'Chờ xử lý', value: 'Pending' },
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
  changeRequests = [],
  systems = [],
  availableOpsOwners = [],
  availableBAs = [],
  searchInputRef,
  containerRef,
  visibleColumns,
  onVisibleColumnsChange,
  globalSort,
  onGlobalSortChange,
}) => {
  const { token } = useAntdToken();
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);

  const activeAdvancedCount = countActiveAdvancedFilters(filters);
  const hasActiveFilters =
    Boolean(filters.search) ||
    filters.hierarchyScope !== 'all' ||
    Boolean(filters.crId) ||
    filters.horizon !== 'all' ||
    filters.statuses.length !== DEFAULT_TASK_FILTER_STATE.statuses.length ||
    filters.priorities.length > 0 ||
    filters.includeClosed ||
    activeAdvancedCount > 0;

  // Subsystem choices are limited to the selected CR's targets (D-46)
  const selectedCr = filters.crId ? changeRequests.find((cr) => cr.id === filters.crId) : undefined;
  const eligibleSystems = selectedCr
    ? selectedCr.targets
        .map((target) => systems.find((s) => s.id === target.systemId))
        .filter((s): s is System => Boolean(s))
    : [];

  return (
    <div
      ref={containerRef}
      data-testid="task-filter-bar"
      className="tm-tasklist__filter"
      style={{ position: 'sticky', top: 0, background: 'var(--bg-elev)' }}
    >
      {/* Primary row: search, scope, CR/Subsystem, sort, columns, advanced filters. */}
      <div className="tm-tasklist__filter-row tm-tasklist__filter-row--primary">
        <div className="tm-tasklist__filter-controls">
          <Input
            ref={searchInputRef}
            id="task-search-input"
            data-shortcut-id="task-search-input"
            className="tm-tasklist__search"
            size="small"
            prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
            placeholder="Tìm kiếm tác vụ (Nhấn '/' để tìm)..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            style={{ width: 'auto', flex: '1 1 45%', minWidth: 240 }}
            allowClear
            aria-label="Tìm kiếm tác vụ"
          />

          <Segmented
            size="small"
            options={[
              { label: 'Tất cả', value: 'all' },
              { label: 'CR', value: 'cr' },
              { label: 'Độc lập', value: 'standalone' },
            ]}
            value={filters.hierarchyScope}
            onChange={(val) => onFilterChange({ hierarchyScope: val as TaskFilterState['hierarchyScope'] })}
            aria-label="Phạm vi lọc"
          />

          <Select
            size="small"
            width="auto"
            allowClear
            showSearch
            optionFilterProp="label"
            className="tm-tasklist__cr-select"
            placeholder="CR…"
            style={{ width: 'auto', minWidth: 70 }}
            value={filters.crId || undefined}
            onChange={(val) => {
              onFilterChange({
                crId: val || null,
                // Clear subsystem if it is not a target of the newly selected CR
                systemId:
                  val && filters.systemId
                    ? changeRequests
                        .find((cr) => cr.id === val)
                        ?.targets.some((t) => t.systemId === filters.systemId)
                      ? filters.systemId
                      : null
                    : filters.systemId,
              });
            }}
            options={changeRequests.map((cr) => ({ label: `${cr.code} · ${cr.name}`, value: cr.id }))}
            aria-label="Lọc theo CR"
          />

          <Select
            size="small"
            width="auto"
            allowClear
            showSearch
            optionFilterProp="label"
            className="tm-tasklist__system-select"
            placeholder="Sub…"
            style={{ width: 'auto', minWidth: 80 }}
            value={filters.systemId || undefined}
            onChange={(val) => onFilterChange({ systemId: val || null })}
            options={eligibleSystems.map((s) => ({ label: s.name, value: s.id }))}
            disabled={!filters.crId}
            aria-label="Lọc theo Subsystem"
          />

          <Select
            size="small"
            width="auto"
            className="tm-tasklist__sort-select"
            value={globalSort ?? DEFAULT_TASK_SORT}
            onChange={(v) => onGlobalSortChange?.(v)}
            options={[...TASK_SORT_OPTIONS]}
            aria-label="Sắp xếp danh sách tác vụ"
          />

          {onVisibleColumnsChange && (
            <TaskColumnCustomization
              visibleColumns={visibleColumns ?? []}
              onChange={onVisibleColumnsChange}
            />
          )}

          <Badge count={activeAdvancedCount} size="small" offset={[-2, 2]}>
            <span className="tm-tasklist__advanced-anchor">
            <Popover
              open={advancedOpen}
              onOpenChange={setAdvancedOpen}
              trigger="click"
              placement="bottomRight"
              widthScale="lg"
              overlayStyle={{ maxWidth: 'min(560px, calc(100vw - 32px))', maxHeight: 'min(70vh, 520px)', overflowY: 'auto' }}
              content={
                <div className="tm-tasklist__filter-advanced">
                  <div className="tm-tasklist__filter-advanced-row">
                    <div className="tm-tasklist__filter-field">
                      <span className="tm-tasklist__filter-label">Khoảng thời gian:</span>
                      <Select
                        size="small"
                        style={{ minWidth: 140 }}
                        value={filters.horizon}
                        onChange={(val) => onFilterChange({ horizon: val })}
                        options={[
                          { label: 'Tất cả', value: 'all' },
                          { label: 'Quá hạn', value: 'overdue' },
                          { label: 'Hôm nay', value: 'today' },
                          { label: 'Tuần này', value: 'this_week' },
                        ]}
                        aria-label="Khoảng thời gian"
                      />
                    </div>
                    <div className="tm-tasklist__filter-field">
                      <span className="tm-tasklist__filter-label">Trạng thái:</span>
                      <Select
                        mode="multiple"
                        allowClear
                        style={{ minWidth: 200 }}
                        placeholder="Trạng thái đang hoạt động"
                        value={filters.statuses}
                        onChange={(vals) => onFilterChange({ statuses: vals as TaskStatus[] })}
                        options={ALL_STATUSES}
                        maxTagCount="responsive"
                        aria-label="Lọc theo trạng thái"
                      />
                    </div>
                    <div className="tm-tasklist__filter-field">
                      <span className="tm-tasklist__filter-label">Độ ưu tiên:</span>
                      <Select
                        mode="multiple"
                        allowClear
                        style={{ minWidth: 140 }}
                        placeholder="Tất cả độ ưu tiên"
                        value={filters.priorities}
                        onChange={(vals) => onFilterChange({ priorities: vals as TaskPriority[] })}
                        options={ALL_PRIORITIES}
                        maxTagCount="responsive"
                        aria-label="Lọc theo độ ưu tiên"
                      />
                    </div>
                    <Checkbox
                      checked={filters.includeClosed}
                      onChange={(e) => onFilterChange({ includeClosed: e.target.checked })}
                    >
                      Bao gồm Hoàn thành & Đã hủy
                    </Checkbox>
                  </div>
                  <Row gutter={[12, 12]}>
                    <Col xs={24} sm={12} lg={6}>
                      <div className="tm-tasklist__filter-field">
                        <span className="tm-tasklist__filter-label">Thời gian kế hoạch:</span>
                        <DateRangePicker
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
                    <Col xs={24} sm={12} lg={6}>
                      <div className="tm-tasklist__filter-field">
                        <span className="tm-tasklist__filter-label">Ngày có worklog:</span>
                        <DateRangePicker
                          style={{ width: '100%' }}
                          placeholder={['Từ ngày', 'Đến ngày']}
                          format="YYYY-MM-DD"
                          value={
                            filters.worklogDateRange && filters.worklogDateRange[0] && filters.worklogDateRange[1]
                              ? [dayjs(filters.worklogDateRange[0]), dayjs(filters.worklogDateRange[1])]
                              : null
                          }
                          onChange={(dates: [Dayjs | null, Dayjs | null] | null) => {
                            if (dates && dates[0] && dates[1]) {
                              onFilterChange({
                                worklogDateRange: [
                                  dates[0].format('YYYY-MM-DD'),
                                  dates[1].format('YYYY-MM-DD'),
                                ],
                              });
                            } else {
                              onFilterChange({ worklogDateRange: null });
                            }
                          }}
                          allowClear
                          aria-label="Khoảng ngày có worklog"
                        />
                      </div>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <div className="tm-tasklist__filter-field">
                        <span className="tm-tasklist__filter-label">Hạn chót:</span>
                        <DateRangePicker
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
                    <Col xs={24} sm={12} lg={6}>
                      <div className="tm-tasklist__filter-field">
                        <span className="tm-tasklist__filter-label">Loại việc:</span>
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
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--island-gap)' }}>
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
                    <Col xs={24} sm={12} lg={6}>
                      <div className="tm-tasklist__filter-field">
                        <span className="tm-tasklist__filter-label">Ops Owner:</span>
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
                    <Col xs={24} sm={12} lg={6}>
                      <div className="tm-tasklist__filter-field">
                        <span className="tm-tasklist__filter-label">BA:</span>
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
                    <Col xs={24} sm={12} lg={6}>
                      <div className="tm-tasklist__filter-field">
                        <span className="tm-tasklist__filter-label">Trạng thái Jira:</span>
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
              }
              getPopupContainer={(node) => node.closest('.tm-tasklist__filter') ?? document.body}
            >
              <Button
                size="small"
                icon={<FilterOutlined />}
                type={activeAdvancedCount > 0 ? 'primary' : 'default'}
                aria-expanded={advancedOpen}
                aria-label="Bộ lọc nâng cao"
              >
                <span className="tm-tasklist__advanced-shadow" aria-hidden="true">
                  Bao gồm Hoàn thành &amp; Đã hủy
                </span>
              </Button>
            </Popover>
            </span>
          </Badge>

          {onResetFilters && hasActiveFilters && (
            <Tooltip title="Xóa bộ lọc">
              <Button
                size="small"
                icon={<ClearOutlined />}
                onClick={onResetFilters}
                aria-label="Xóa bộ lọc"
              />
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};

