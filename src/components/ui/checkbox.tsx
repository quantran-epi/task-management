import { Checkbox as AntCheckbox, type CheckboxProps as AntCheckboxProps } from 'antd';
import type { CheckboxGroupProps as AntCheckboxGroupProps } from 'antd/es/checkbox/Group';
import type { CSSProperties } from 'react';
import { getSharedControlTokens, withoutUndefined, type ControlSize } from './tokens.contract';

export type CheckboxProps = AntCheckboxProps;
export type CheckboxGroupProps = AntCheckboxGroupProps;

/** Consumed AntD Checkbox statics mirrored as named exports. */
export const CheckboxGroup = AntCheckbox.Group;

/** Single swap point for AntD Checkbox; shared control size is the policy prop. */
export function Checkbox({ controlSize = 'middle', style, ...rest }: CheckboxProps & { controlSize?: ControlSize }) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const merged = withoutUndefined({
    ...rest,
    style: {
      '--ui-control-height': `${controlHeight}px`,
      '--ui-control-font-size': `${fontSize}px`,
      '--ui-control-radius': `${borderRadius}px`,
      '--ui-control-size': controlSize,
      ...style,
    } as CSSProperties,
  });
  return <AntCheckbox {...merged} />;
}
