import { Pagination as AntPagination, type PaginationProps as AntPaginationProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type PaginationProps = AntPaginationProps;

/** AntD 6 Pagination exposes token metrics via `styles.root`, not `style`. */
export function Pagination({ styles, ...rest }: PaginationProps) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const tokenStyle = {
    '--ui-pagination-height': `${controlHeight}px`,
    '--ui-pagination-font-size': `${fontSize}px`,
    '--ui-pagination-radius': `${borderRadius}px`,
  } as CSSProperties;
  const rootStyle =
    styles && typeof styles === 'object' && 'root' in styles
      ? { ...tokenStyle, ...(styles.root as CSSProperties | undefined) }
      : tokenStyle;
  return <AntPagination {...rest} styles={{ ...(styles as object), root: rootStyle } as typeof styles} />;
}
