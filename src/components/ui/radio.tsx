import { Radio as AntRadio, type RadioProps as AntRadioProps, type RadioGroupProps as AntRadioGroupProps } from 'antd';
import type { RadioButtonProps as AntRadioButtonProps } from 'antd/es/radio/radioButton';
import type { CSSProperties } from 'react';
import { getSharedControlTokens, type ControlSize } from './tokens.contract';

export type RadioProps = AntRadioProps;
export type RadioGroupProps = AntRadioGroupProps;
export type RadioButtonProps = AntRadioButtonProps;

function radioStyle(): CSSProperties {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  return {
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-radius': `${borderRadius}px`,
  } as CSSProperties;
}

/** Single swap point for AntD Radio. */
export function Radio({ style, ...rest }: RadioProps) {
  return <AntRadio {...rest} style={{ ...radioStyle(), ...style }} />;
}

/** Consumed Radio.Group static mirrored with the same token policy. */
export function RadioGroup({ controlSize = 'middle', style, ...rest }: RadioGroupProps & { controlSize?: ControlSize }) {
  return (
    <AntRadio.Group
      {...rest}
      size={rest.size ?? controlSize}
      style={{ ...radioStyle(), '--ui-control-size': controlSize, ...style } as CSSProperties}
    />
  );
}

/** Consumed Radio.Button static mirrored with the same token policy. */
export function RadioButton({ style, ...rest }: RadioButtonProps) {
  return <AntRadio.Button {...rest} style={{ ...radioStyle(), ...style }} />;
}
