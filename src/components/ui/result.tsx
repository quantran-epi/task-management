import { Result as AntResult, type ResultProps as AntResultProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type ResultProps = AntResultProps;

/** Single swap point for AntD Result; title font from the shared contract. */
export function Result({ style, ...rest }: ResultProps) {
  const { fontSize, controlHeight } = getSharedControlTokens();
  const tokenStyle = {
    '--ui-result-font-size': `${fontSize}px`,
    '--ui-result-icon-size': `${controlHeight * 2}px`,
  } as CSSProperties;
  return <AntResult {...rest} style={{ ...tokenStyle, ...style }} />;
}
