import { Spin as AntSpin, type SpinProps as AntSpinProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens, getStatusTokens } from './tokens.contract';

export type SpinProps = AntSpinProps;

/** Single swap point for AntD Spin; accent comes from the shared D-12 map. */
export function Spin({ style, ...rest }: SpinProps) {
  const { controlHeight, fontSize } = getSharedControlTokens();
  const accent = getStatusTokens('accent');
  return (
    <AntSpin
      {...rest}
      style={
        {
          '--ui-control-height': `${controlHeight}px`,
          '--ui-control-font-size': `${fontSize}px`,
          '--ui-spin-accent': accent,
          ...style,
        } as CSSProperties
      }
    />
  );
}

/** AntD Spin.setDefaultIndicator mirrored without re-export. */
export const setDefaultSpinIndicator = AntSpin.setDefaultIndicator;
