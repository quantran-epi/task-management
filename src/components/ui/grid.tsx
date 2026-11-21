import {
  Col as AntCol,
  Row as AntRow,
  Grid as AntGrid,
  type ColProps as AntColProps,
  type RowProps as AntRowProps,
} from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type ColProps = AntColProps;
export type RowProps = AntRowProps;

/** Token spacing for grid gutters, derived from the shared control height. */
export function gridStyle(): CSSProperties {
  const { controlHeight, paddingInline } = getSharedControlTokens();
  return {
    '--ui-grid-row-height': `${controlHeight}px`,
    '--ui-grid-gutter': `${paddingInline}px`,
  } as CSSProperties;
}

/** Row swap point: gutter defaults come from the shared scale unless caller overrides. */
export function Row({ gutter, style, ...rest }: RowProps) {
  const { paddingInline } = getSharedControlTokens();
  return <AntRow {...rest} gutter={gutter ?? paddingInline} style={{ ...gridStyle(), ...style }} />;
}

/** Col swap point with the same token-derived metrics. */
export function Col({ style, ...rest }: ColProps) {
  return <AntCol {...rest} style={{ ...gridStyle(), ...style }} />;
}

/** Grid namespace swap point; useBreakpoint is the consumed static. */
export const Grid = {
  useBreakpoint: AntGrid.useBreakpoint,
};
