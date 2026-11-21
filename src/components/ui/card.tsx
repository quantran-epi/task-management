import { Card as AntCard, type CardProps as AntCardProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type CardProps = AntCardProps;

/** AntD Card statics mirrored as named exports; no bare re-export. */
export const CardGrid = AntCard.Grid;
export const CardMeta = AntCard.Meta;

/** Token radius/metrics as custom properties — no raw metric or hex in the wrapper. */
export function cardStyle(): CSSProperties {
  const { borderRadius, controlHeight, fontSize } = getSharedControlTokens();
  return {
    '--ui-control-radius': `${borderRadius}px`,
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-font-size': `${fontSize}px`,
  } as CSSProperties;
}

/** Single swap point for every AntD Card; caller style still wins. */
export function Card({ style, ...rest }: CardProps) {
  return <AntCard {...rest} style={{ ...cardStyle(), ...style }} />;
}
