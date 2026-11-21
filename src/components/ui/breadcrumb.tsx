import { Breadcrumb as AntBreadcrumb, type BreadcrumbProps as AntBreadcrumbProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type BreadcrumbProps = AntBreadcrumbProps;
export const BreadcrumbItem = AntBreadcrumb.Item;
export const BreadcrumbSeparator = AntBreadcrumb.Separator;

/** Single swap point for AntD Breadcrumb; separator gap from the shared scale. */
export function Breadcrumb({ style, ...rest }: BreadcrumbProps) {
  const { fontSize, paddingInline } = getSharedControlTokens();
  const tokenStyle = {
    '--ui-breadcrumb-font-size': `${fontSize}px`,
    '--ui-breadcrumb-gap': paddingInline,
  } as CSSProperties;
  return <AntBreadcrumb {...rest} style={{ ...tokenStyle, ...style }} />;
}
