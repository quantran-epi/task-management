import { Layout as AntLayout, type LayoutProps as AntLayoutProps, type SiderProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type LayoutProps = AntLayoutProps;
export type { SiderProps };
export const LayoutHeader = AntLayout.Header;
export const LayoutFooter = AntLayout.Footer;
export const LayoutContent = AntLayout.Content;
export const LayoutSider = AntLayout.Sider;

/** Token-derived structural heights; caller style wins. */
function layoutStyle(): CSSProperties {
  const { controlHeight, paddingInline } = getSharedControlTokens();
  return {
    '--ui-layout-row-height': `${controlHeight}px`,
    '--ui-layout-gutter': paddingInline,
  } as CSSProperties;
}

/** Single swap point for AntD Layout. */
export function Layout({ style, ...rest }: LayoutProps) {
  return <AntLayout {...rest} style={{ ...layoutStyle(), ...style }} />;
}
