import { Tabs as AntTabs, type TabsProps as AntTabsProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type TabsProps = AntTabsProps;

/** AntD Tabs.TabPane mirrored for legacy callers; no bare re-export. */
export const TabPane = AntTabs.TabPane;

/** Single swap point for AntD Tabs; gutter/indicator metrics come from tokens. */
export function Tabs({ styles, ...rest }: TabsProps) {
  const { controlHeight, fontSize, paddingInline } = getSharedControlTokens();
  const metrics = {
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-tab-gutter': `${paddingInline}px`,
  } as CSSProperties;
  return <AntTabs {...rest} styles={{ root: metrics, ...styles }} />;
}
