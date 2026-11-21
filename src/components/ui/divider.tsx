import { Divider as AntDivider, type DividerProps as AntDividerProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type DividerProps = AntDividerProps;

/** Token-derived metric for the divider rail; caller style still wins. */
function dividerStyle(): CSSProperties {
  const { fontSize, paddingInline } = getSharedControlTokens();
  return {
    '--ui-divider-font-size': `${fontSize}px`,
    '--ui-divider-gap': paddingInline,
  } as CSSProperties;
}

/** Single swap point for AntD Divider. */
export function Divider({ style, ...rest }: DividerProps) {
  return <AntDivider {...rest} style={{ ...dividerStyle(), ...style }} />;
}
