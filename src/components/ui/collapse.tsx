import { Collapse as AntCollapse, type CollapseProps as AntCollapseProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type CollapseProps = AntCollapseProps;

/** AntD Collapse.Panel mirrored as a named export; no bare re-export. */
export const CollapsePanel = AntCollapse.Panel;

/** Single swap point for AntD Collapse; header height/font from shared tokens. */
export function Collapse({ style, ...rest }: CollapseProps) {
  const { controlHeight, fontSize, paddingInline } = getSharedControlTokens();
  return (
    <AntCollapse
      {...rest}
      style={
        {
          '--ui-control-height': `${controlHeight}px`,
          '--ui-control-font-size': `${fontSize}px`,
          '--ui-collapse-padding': `${paddingInline}px`,
          ...style,
        } as CSSProperties
      }
    />
  );
}
