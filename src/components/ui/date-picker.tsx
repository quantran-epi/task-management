import { DatePicker as AntDatePicker, type DatePickerProps as AntDatePickerProps } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import type { CSSProperties } from 'react';
import type { Dayjs } from 'dayjs';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';

export type { DatePickerProps } from 'antd';
export type { RangePickerProps };

export interface DateFieldProps extends Omit<AntDatePickerProps, 'onChange' | 'value'> {
  /** Whole-component width policy: full container or AntD intrinsic. */
  width?: 'full' | 'auto';
  /** View uses the single-date signature; the AntD union leaked it into callbacks (D-03). */
  onChange?: (date: Dayjs | null, dateString: string | string[]) => void;
  value?: Dayjs | null;
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
export function DatePicker({ width = 'full', style, onChange, value, ...rest }: DateFieldProps) {
  return (
    <AntDatePicker
      {...(rest as AntDatePickerProps)}
      {...withoutUndefined({
        value: value as AntDatePickerProps['value'],
        onChange: onChange as AntDatePickerProps['onChange'],
      })}
      style={pickerStyle(width, style)}
    />
  );
}

export function DateRangePicker({
  width = 'full',
  style,
  value,
  onChange,
  ...rest
}: Omit<RangePickerProps, 'onChange' | 'value'> & {
  width?: 'full' | 'auto';
  value?: [Dayjs | null, Dayjs | null] | null;
  onChange?: (dates: [Dayjs | null, Dayjs | null] | null, dateStrings: [string, string]) => void;
}) {
  return (
    <AntDatePicker.RangePicker
      {...rest}
      {...withoutUndefined({ value, onChange: onChange as RangePickerProps['onChange'] })}
      style={pickerStyle(width, style)}
    />
  );
}
