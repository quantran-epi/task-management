import { InputNumber as AntInputNumber } from 'antd';
import type { InputNumberProps as AntInputNumberProps } from 'antd/es/input-number';
import type { ValueType } from '@rc-component/input-number';
import { getSharedControlTokens, withoutUndefined, type ControlSize } from './tokens.contract';
import { controlStyle, controlWidthStyle, type InputWidth } from './input';

export interface InputNumberProps<
  T extends ValueType = ValueType,
> extends AntInputNumberProps<T> {
  width?: InputWidth;
  size?: ControlSize;
}

/** InputNumber wrapper: shared height/font; min/max/precision pass through verbatim. */
export function InputNumber<T extends ValueType = ValueType>({
  width = 'full',
  status,
  style,
  ...rest
}: InputNumberProps<T>) {
  void getSharedControlTokens();
  const merged = withoutUndefined({
    ...rest,
    status: status ?? (rest['aria-invalid'] ? 'error' : undefined),
    style: { ...controlStyle(), ...controlWidthStyle(width), ...style },
  });
  return <AntInputNumber<T> {...merged} />;
}
