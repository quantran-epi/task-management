import { Space as AntSpace, type SpaceProps as AntSpaceProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type SpaceProps = AntSpaceProps;

/** AntD Space.Compact mirrored as a named export; no bare re-export. */
export const SpaceCompact = AntSpace.Compact;

/** Single swap point for AntD Space; default gap is the shared token padding. */
export function Space({ size, style, ...rest }: SpaceProps) {
  const { paddingInline } = getSharedControlTokens();
  return (
    <AntSpace
      {...rest}
      size={size ?? paddingInline}
      style={{ '--ui-space-gap': `${paddingInline}px`, ...style } as CSSProperties}
    />
  );
}
