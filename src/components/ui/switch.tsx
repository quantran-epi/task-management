import { Switch as AntSwitch, type SwitchProps as AntSwitchProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type SwitchProps = AntSwitchProps;

/** Single swap point for AntD Switch; height/radius from shared control tokens. */
export function Switch({ style, ...rest }: SwitchProps) {
  const { controlHeight, borderRadius, fontSize } = getSharedControlTokens();
  return (
    <AntSwitch
      {...rest}
      style={
        {
          '--ui-control-height': `${controlHeight}px`,
          '--ui-control-radius': `${borderRadius}px`,
          '--ui-control-font-size': `${fontSize}px`,
          ...style,
        } as CSSProperties
      }
    />
  );
}
