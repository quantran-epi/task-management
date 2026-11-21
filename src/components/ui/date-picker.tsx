import { DatePicker as AntDatePicker, type DatePickerProps as AntDatePickerProps } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type { DatePickerProps } from 'antd';
export type { RangePickerProps };

export interface DateFieldProps extends AntDatePickerProps {
  /** Whole-component width policy: full container or AntD intrinsic. */
  width?: 'full' | 'auto';
}

function pickerStyle(width: 'full' | 'auto', caller?: CSSProperties): CSSProperties {
  const { fontSize, controlHeight, borderRadius } = getSharedControlTokens();
  return {
    width: width === 'full' ? '100%' : undefined,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-radius': `${borderRadius}px`,
    ...caller,
  } as CSSProperties;
}

/** Single swap point for AntD DatePicker and RangePicker with shared metrics. */
export function DatePicker({ width = 'full', style, ...rest }: DateFieldProps) {
  return <AntDatePicker {...rest} style={pickerStyle(width, style)} />;
}

export function DateRangePicker({
  width = 'full',
  style,
  ...rest
}: RangePickerProps & { width?: 'full' | 'auto' }) {
  return <AntDatePicker.RangePicker {...rest} style={pickerStyle(width, style)} />;
}
