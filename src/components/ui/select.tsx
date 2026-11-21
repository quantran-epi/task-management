import { Select as AntSelect, type SelectProps as AntSelectProps } from 'antd';
import type { BaseOptionType, DefaultOptionType } from 'antd/es/select';
import { getSharedControlTokens, withoutUndefined, type ControlSize } from './tokens.contract';
import { controlStyle, controlWidthStyle, type InputWidth } from './input';

export interface SelectProps<
  ValueType = unknown,
  OptionType extends BaseOptionType = DefaultOptionType,
> extends AntSelectProps<ValueType, OptionType> {
  width?: InputWidth;
  size?: ControlSize;
}

/** Select wrapper: shared metrics, allowClear by policy, token-derived width. */
export function Select<
  ValueType = unknown,
  OptionType extends BaseOptionType = DefaultOptionType,
>({ width = 'full', allowClear = true, status, style, ...rest }: SelectProps<ValueType, OptionType>) {
  // The contract is the single source for control metrics carried by controlStyle().
  void getSharedControlTokens();
  const merged = withoutUndefined({
    ...rest,
    allowClear,
    status: status ?? (rest['aria-invalid'] ? 'error' : undefined),
    style: { ...controlStyle(), ...controlWidthStyle(width), ...style },
  });
  return <AntSelect<ValueType, OptionType> {...merged} />;
}
