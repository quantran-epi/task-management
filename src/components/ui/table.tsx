import type {
  TableProps as AntTableProps,
  TablePaginationConfig,
} from 'antd';
import {
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { classNames } from './native/classNames';
import buttonStyles from './openidea/Button.module.css';
import chipStyles from './openidea/Chip.module.css';
import listStyles from './openidea/List.module.css';
import menuStyles from './openidea/Menu.module.css';
import spinnerStyles from './openidea/Spinner.module.css';
import dialogStyles from './openidea/Dialog.module.css';
import { sharedTokens } from '../../styles/tokens';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';

export type TableSize = 'small' | 'middle' | 'large';

export interface TableProps<RecordType = unknown> extends AntTableProps<RecordType> {
  /** Density policy; maps to row height, never a raw wrapper prop at callers. */
  density?: TableSize;
}

/** Token-derived Table padding/font as custom properties, never inline hex. */
export function tableStyle(): CSSProperties {
  const { tablePadding, tableFontSize } = sharedTokens;
  const { controlHeight } = getSharedControlTokens();
  return {
    '--ui-table-padding': `${tablePadding}px`,
    '--ui-table-font-size': `${tableFontSize}px`,
    '--ui-control-height': `${controlHeight}px`,
  } as CSSProperties;
}

const ROW_HEIGHT: Record<TableSize, number> = { small: 22, middle: 24, large: 28 };

type RowKeySpec<RecordType> = string | keyof RecordType | ((record: RecordType, index?: number) => unknown);

function recordKey<RecordType>(record: RecordType, index: number, rowKey: RowKeySpec<RecordType> | undefined): string {
  const candidate = record as { key?: unknown; id?: unknown } | null | undefined;
  const fromProp = typeof rowKey === 'function' ? rowKey(record, index)
    : typeof rowKey === 'string' || typeof rowKey === 'number' || typeof rowKey === 'symbol'
      ? (candidate as Record<string | number | symbol, unknown> | null)?.[rowKey]
      : candidate?.key ?? candidate?.id;
  return fromProp === undefined || fromProp === null ? `row-${index}` : String(fromProp);
}

function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object' && 'props' in value) {
    const children = (value as { props: { children?: ReactNode } }).props.children;
    return typeof children === 'string' ? children : '';
  }
  return '';
}

/** Native generic data grid: sort/filter/selection/pagination payloads keep AntD shape. */
export function Table<RecordType = unknown>({
  density,
  style,
  columns,
  dataSource,
  rowKey,
  rowSelection,
  onChange,
  onRow,
  rowClassName,
  pagination,
  loading,
  locale,
  size,
  scroll,
  expandable,
  summary,
  className,
  ...rest
}: TableProps<RecordType>) {
  const effectiveDensity: TableSize = density ?? (size === 'small' || size === 'large' ? size : 'middle');
  const rowHeight = ROW_HEIGHT[effectiveDensity] ?? 24;
  const rows = (dataSource ?? []) as readonly RecordType[];
  const [sortState, setSortState] = useState<{ key: string; order: 'ascend' | 'descend' } | null>(null);
  const [filterState, setFilterState] = useState<Record<string, (string | number | boolean)[]>>({});
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const [innerPage, setInnerPage] = useState(1);
  const [innerPageSize, setInnerPageSize] = useState<number | undefined>(undefined);

  const sorted = useMemo(() => {
    if (!sortState) return [...rows];
    const column = (columns ?? []).find((entry: { key?: unknown }) => entry.key === sortState.key) as
      | { sorter?: unknown; dataIndex?: unknown }
      | undefined;
    const compare = typeof column?.sorter === 'function' ? column.sorter as (a: RecordType, b: RecordType, order: 'ascend' | 'descend') => number : undefined;
    const result = [...rows];
    if (compare) result.sort((a, b) => compare(a, b, sortState.order));
    if (sortState.order === 'descend') result.reverse();
    return result;
  }, [rows, columns, sortState]);

  const filtered = useMemo(() => {
    const entries = Object.entries(filterState).filter(([, values]) => values.length > 0);
    if (entries.length === 0) return sorted;
    return sorted.filter((record) => entries.every(([key, values]) => {
      const column = (columns ?? []).find((entry: { key?: unknown }) => entry.key === key) as
        | { dataIndex?: unknown; onFilter?: unknown }
        | undefined;
      if (typeof column?.onFilter === 'function') {
        return values.some((value) => (column.onFilter as (v: unknown, r: RecordType) => boolean)(value, record));
      }
      const index = column?.dataIndex;
      return values.includes(String(
        typeof index === 'string' || typeof index === 'number' || typeof index === 'symbol'
          ? (record as Record<string | number | symbol, unknown>)[index]
          : undefined,
      ));
    }));
  }, [sorted, columns, filterState]);

  const pageConfig = pagination === false ? undefined : (pagination ?? {}) as TablePaginationConfig;
  const pageSize = innerPageSize ?? pageConfig?.pageSize ?? 10;
  const currentPage = pageConfig?.current ?? innerPage;
  const total = pageConfig?.total ?? filtered.length;
  const pageRows = pagination === false ? filtered : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const selectedKeys = (rowSelection?.selectedRowKeys ?? []).map(String);

  function emitChange(
    action: 'sort' | 'filter' | 'paginate',
    nextPage = currentPage,
    nextSize = pageSize,
    nextSort = sortState,
  ) {
    const sorter = nextSort
      ? { field: nextSort.key, order: nextSort.order, columnKey: nextSort.key }
      : {};
    onChange?.(
      { ...pageConfig, current: nextPage, pageSize: nextSize } as TablePaginationConfig,
      {} as never,
      sorter as never,
      { currentDataSource: [...filtered], action },
    );
  }

  function toggleSort(key: string, sorter: unknown, column: { sortDirections?: readonly string[] }) {
    if (!sorter) return;
    const directions = column.sortDirections ?? ['ascend', 'descend'];
    const current = directions.indexOf(sortState?.order ?? '');
    const next = current < 0 ? directions[0] : directions[(current + 1) % directions.length];
    const nextSort = next ? { key, order: next as 'ascend' | 'descend' } : null;
    setSortState(nextSort);
    emitChange('sort', currentPage, pageSize, nextSort);
  }

  function toggleSelection(key: string, checked: boolean) {
    if (!rowSelection) return;
    const keys = checked ? [...selectedKeys, key] : selectedKeys.filter((value) => value !== key);
    const selected = keys.map((value) => rows.find((row, index) => recordKey(row, index, rowKey) === value)).filter((row) => row !== undefined);
    rowSelection.onChange?.(keys, selected as RecordType[], { type: 'single' });
  }

  function toggleFilter(key: string, value: string | number | boolean, checked: boolean) {
    const current = filterState[key] ?? [];
    const next = { ...filterState, [key]: checked ? [...current, value] : current.filter((entry) => entry !== value) };
    setFilterState(next);
    onChange?.(
      { ...pageConfig, current: currentPage, pageSize } as TablePaginationConfig,
      next as never,
      {} as never,
      { currentDataSource: [...filtered], action: 'filter' },
    );
  }

  function changePage(next: number, nextSize: number) {
    if (pageConfig?.onChange) pageConfig.onChange(next, nextSize);
    else { setInnerPage(next); setInnerPageSize(nextSize); }
    emitChange('paginate', next, nextSize);
  }

  const emptyText = locale?.emptyText;
  const emptyNode = typeof emptyText === 'function' ? (emptyText as () => ReactNode)() : emptyText;
  const showPagination = pageConfig !== undefined && !(pageConfig.hideOnSinglePage && total <= pageSize);

  return (
    <div
      data-oi-control="table"
      data-state={loading ? 'loading' : rows.length === 0 ? 'empty' : 'default'}
      aria-busy={loading ? 'true' : undefined}
      className={classNames(listStyles.list, className)}
      style={{ ...tableStyle(), ...style, ...(scroll?.y ? { maxHeight: scroll.y } : {}) }}
      {...withoutUndefined({ id: rest.id })}
    >
      <table className="grid" style={{ fontSize: 'var(--ui-table-font-size)' }}>
        <thead>
          <tr>
            {rowSelection ? (
              <th scope="col" className={menuStyles.item} aria-label="Chọn tất cả">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả"
                  checked={pageRows.length > 0 && pageRows.every((row, index) => selectedKeys.includes(recordKey(row, index, rowKey)))}
                  onChange={(event) => {
                    const keys = event.target.checked
                      ? [...new Set([...selectedKeys, ...pageRows.map((row, index) => recordKey(row, index, rowKey))])]
                      : selectedKeys.filter((key) => !pageRows.some((row, index) => recordKey(row, index, rowKey) === key));
                    rowSelection.onChange?.(keys, rows.filter((row, index) => keys.includes(recordKey(row, index, rowKey))), { type: 'all' });
                  }}
                />
              </th>
            ) : null}
            {expandable ? <th scope="col" className={menuStyles.item} aria-label="Mở rộng" /> : null}
            {(columns ?? []).map((column) => {
              const col = column as {
                key?: unknown; dataIndex?: unknown; title?: ReactNode; sorter?: unknown;
                align?: string; width?: number | string; sortDirections?: readonly string[];
                filters?: readonly { text?: ReactNode; value?: unknown }[];
              };
              const key = col.key === undefined ? String(col.dataIndex ?? '') : String(col.key);
              const canSort = Boolean(col.sorter);
              return (
                <th
                  key={key}
                  scope="col"
                  role="columnheader"
                  data-oi-control="table-header"
                  className={classNames(menuStyles.item, canSort && buttonStyles.button)}
                  style={{ textAlign: col.align as CSSProperties['textAlign'], width: col.width }}
                  onClick={canSort ? () => toggleSort(key, col.sorter, col) : undefined}
                >
                  {col.title}
                  {canSort ? (
                    <button type="button" aria-label={`sort ${textOf(col.title)}`} className={buttonStyles.button} onClick={(event) => { event.stopPropagation(); toggleSort(key, col.sorter, col); }}>
                      {sortState?.key === key ? (sortState.order === 'ascend' ? '↑' : '↓') : '↕'}
                    </button>
                  ) : null}
                  {col.filters?.length ? (
                    <select
                      aria-label={`lọc ${textOf(col.title)}`}
                      className={chipStyles.chip}
                      value=""
                      onChange={(event) => toggleFilter(key, event.target.value, true)}
                    >
                      <option value="">Tất cả</option>
                      {col.filters.map((filter) => (
                        <option key={String(filter.value)} value={String(filter.value)}>{textOf(filter.text)}</option>
                      ))}
                    </select>
                  ) : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading && pageRows.length === 0 ? (
            <tr><td colSpan={(columns?.length ?? 0) + 1}><span className={spinnerStyles.spinner} role="status" aria-label="Đang tải" /></td></tr>
          ) : pageRows.length === 0 ? (
            <tr><td colSpan={(columns?.length ?? 0) + 1}><div className={listStyles.emptyWrap} data-oi-control="table-empty" data-state="empty">{emptyNode}</div></td></tr>
          ) : pageRows.map((record, index) => {
            const key = recordKey(record, index, rowKey);
            const isSelected = selectedKeys.includes(key);
            const nativeProps = onRow ? onRow(record, index) : {};
            const expandedKeys = expandable?.expandedRowKeys?.map(String) ?? expanded;
            const isExpanded = expandedKeys.includes(key);
            return [
              <tr
                key={key}
                {...nativeProps}
                data-oi-control="list-row"
                data-testid="native-table-row"
                data-state={isSelected ? 'selected' : 'default'}
                className={classNames(listStyles.row, isSelected && listStyles.active, typeof rowClassName === 'function' ? rowClassName(record, index, 0) : rowClassName, nativeProps.className)}
                style={{ height: rowHeight, ...nativeProps.style }}
              >
                {rowSelection ? (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Chọn ${textOf(key)}`}
                      checked={isSelected}
                      disabled={rowSelection.getCheckboxProps?.(record)?.disabled === true}
                      onChange={(event) => toggleSelection(key, event.target.checked)}
                    />
                  </td>
                ) : null}
                {expandable ? (
                  <td>
                    <button
                      type="button"
                      aria-label={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                      onClick={() => {
                        if (expandable?.onExpand) expandable.onExpand(!isExpanded, record);
                        else setExpanded((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
                      }}
                    >
                      {isExpanded ? '−' : '+'}
                    </button>
                  </td>
                ) : null}
                {(columns ?? []).map((column) => {
                  const col = column as {
                    key?: unknown; dataIndex?: unknown; render?: (value: unknown, record: RecordType, index: number) => ReactNode; align?: string;
                  };
                  const colKey = col.key === undefined ? String(col.dataIndex ?? '') : String(col.key);
                  const dataIndex = col.dataIndex as keyof RecordType | undefined;
                  const value = dataIndex === undefined ? undefined : record[dataIndex];
                  return (
                    <td key={colKey} style={{ textAlign: col.align as CSSProperties['textAlign'] }}>
                      {col.render ? col.render(value, record, index) : (value as ReactNode)}
                    </td>
                  );
                })}
              </tr>,
              expandable && isExpanded && expandable.expandedRowRender ? (
                <tr key={`${key}-expanded`} data-oi-control="table-expanded-row">
                  <td colSpan={(columns?.length ?? 0) + 1}>{expandable.expandedRowRender(record, index, 0, isExpanded)}</td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
        {summary ? <tfoot>{summary(pageRows)}</tfoot> : null}
      </table>
      {showPagination ? (
        <div data-oi-control="table-pagination" className={dialogStyles.footer}>
          {pageConfig?.showTotal ? <span className={chipStyles.chip}>{pageConfig.showTotal(total, [(currentPage - 1) * pageSize + 1, Math.min(currentPage * pageSize, total)])}</span> : null}
          <button type="button" aria-label="Trang trước" className={buttonStyles.button} disabled={currentPage <= 1} onClick={() => changePage(currentPage - 1, pageSize)}>‹</button>
          <span className={chipStyles.chip} aria-label={`Trang ${currentPage}`}>{currentPage}</span>
          <button type="button" aria-label="Trang sau" className={buttonStyles.button} disabled={currentPage * pageSize >= total} onClick={() => changePage(currentPage + 1, pageSize)}>›</button>
          {pageConfig?.showSizeChanger ? (
            <select
              aria-label="Số bản ghi mỗi trang"
              className={chipStyles.chip}
              value={pageSize}
              onChange={(event) => changePage(1, Number(event.target.value))}
            >
              {(pageConfig.pageSizeOptions ?? ['10', '25', '50', '100']).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SummaryRow({ children, ...rest }: { children?: ReactNode; className?: string; style?: CSSProperties; onClick?: React.MouseEventHandler<HTMLTableRowElement> }) {
  return <tr {...rest}>{children}</tr>;
}

function SummaryCell({ children, index: _index, align, ...rest }: { children?: ReactNode; index: number; align?: string; className?: string; style?: CSSProperties }) {
  void _index;
  return <td {...rest} style={{ textAlign: align as CSSProperties['textAlign'], ...rest.style }}>{children}</td>;
}

/** Self-built Summary mirror; values are defined here, never re-exported from AntD. */
export const TableSummary = {
  Row: SummaryRow,
  Cell: SummaryCell,
};
