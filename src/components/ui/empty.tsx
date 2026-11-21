import { Empty as AntEmpty, type EmptyProps as AntEmptyProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type EmptyProps = AntEmptyProps;

/** Consumed AntD Empty statics mirrored as named exports. */
export const EmptyImageSimple = AntEmpty.PRESENTED_IMAGE_SIMPLE;
export const EmptyImageDefault = AntEmpty.PRESENTED_IMAGE_DEFAULT;

/** Single swap point for AntD Empty; text metric from the shared contract. */
export function Empty({ style, ...rest }: EmptyProps) {
  const { fontSize } = getSharedControlTokens();
  return (
    <AntEmpty
      {...rest}
      style={{ '--ui-control-font-size': `${fontSize}px`, ...style } as CSSProperties}
      styles={{ description: { color: 'var(--fg-muted)' }, ...rest.styles }}
    />
  );
}
