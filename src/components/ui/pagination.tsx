import type { PaginationProps as AntPaginationProps } from 'antd';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { classNames } from './native/classNames';
import buttonStyles from './openidea/Button.module.css';
import chipStyles from './openidea/Chip.module.css';
import menuStyles from './openidea/Menu.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type PaginationProps = AntPaginationProps;

function pageList(current: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages: Array<number | 'ellipsis'> = [1];
  if (current > 3) pages.push('ellipsis');
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (current < totalPages - 2) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M10 4L6 8l4 4' : 'M6 4l4 4-4 4'}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Native N-18 pagination; AntD onChange/onShowSizeChange payloads preserved. */
export function Pagination({
  styles,
  current,
  defaultCurrent,
  pageSize,
  defaultPageSize,
  total = 0,
  onChange,
  onShowSizeChange,
  showSizeChanger,
  pageSizeOptions,
  disabled,
  size,
  className,
  ...rest
}: PaginationProps) {
  void rest;
  void size;
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const [innerPage, setInnerPage] = useState(defaultCurrent ?? 1);
  const [innerSize, setInnerSize] = useState(defaultPageSize ?? 10);
  const activePage = current ?? innerPage;
  const activeSize = pageSize ?? innerSize;
  const totalPages = Math.max(1, Math.ceil(total / activeSize));
  const rootStyle =
    styles && typeof styles === 'object' && 'root' in styles
      ? (styles.root as CSSProperties | undefined)
      : undefined;

  const emitPage = (page: number) => {
    if (disabled === true || page === activePage || page < 1 || page > totalPages) return;
    if (current === undefined) setInnerPage(page);
    onChange?.(page, activeSize);
  };

  const emitSize = (nextSize: number) => {
    if (disabled === true) return;
    if (pageSize === undefined) {
      setInnerSize(nextSize);
      setInnerPage(1);
    }
    onShowSizeChange?.(activePage, nextSize);
    onChange?.(1, nextSize);
  };

  const tokenStyle = {
    '--ui-pagination-height': `${controlHeight}px`,
    '--ui-pagination-font-size': `${fontSize}px`,
    '--ui-pagination-radius': `${borderRadius}px`,
    ...rootStyle,
  } as CSSProperties;

  const icon = (direction: 'left' | 'right', target: number, label: string) => (
    <button
      type="button"
      aria-label={label}
      disabled={disabled === true || target < 1 || target > totalPages}
      className={classNames(buttonStyles.iconButton, buttonStyles['is-small'], menuStyles.item)}
      data-oi-control={direction === 'left' ? 'pagination-prev' : 'pagination-next'}
      data-state={target < 1 || target > totalPages ? 'disabled' : 'default'}
      onClick={() => emitPage(target)}
    >
      <Chevron direction={direction} />
    </button>
  );

  const chips: ReactNode[] = pageList(activePage, totalPages).map((page, index) => page === 'ellipsis'
    ? <span key={`ellipsis-${index}`} className={chipStyles.chip} data-oi-control="pagination-ellipsis">…</span>
    : (
      <button
        key={page}
        type="button"
        // Active chip carries aria-current="page" for the measurement hook.
        aria-label={`Trang ${page}`}
        aria-current={page === activePage ? 'page' : undefined}
        data-aria-current={page === activePage ? 'page' : undefined}
        data-current-token="page"
        className={chipStyles.chip}
        data-oi-control="pagination-page"
        data-state={page === activePage ? 'selected' : 'default'}
        onClick={() => emitPage(page)}
      >
        {page}
      </button>
    ));

  return (
    <nav aria-label="pagination" className={className} data-oi-control="pagination" data-state="default" style={tokenStyle}>
      {icon('left', activePage - 1, 'Trang trước')}
      {chips}
      {icon('right', activePage + 1, 'Trang sau')}
      {showSizeChanger === true && (
        <select
          aria-label="Số bản ghi mỗi trang"
          value={activeSize}
          className={chipStyles.chip}
          data-oi-control="pagination-size"
          onChange={(event) => emitSize(Number(event.target.value))}
        >
          {(pageSizeOptions ?? ['10', '20', '50']).map((option) => (
            <option key={String(option)} value={Number(option)}>{String(option)}</option>
          ))}
        </select>
      )}
    </nav>
  );
}
