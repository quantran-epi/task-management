import {
  TimePicker as AntTimePicker,
  type TimePickerProps as AntTimePickerProps,
  type TimeRangePickerProps,
} from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type { TimePickerProps, TimeRangePickerProps } from 'antd';

export interface TimeFieldProps extends AntTimePickerProps {
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

/** Single swap point for AntD TimePicker and RangePicker with shared metrics. */
export function TimePicker({ width = 'full', style, ...rest }: TimeFieldProps) {
  return <AntTimePicker {...rest} style={pickerStyle(width, style)} />;
}

export function TimeRangePicker({
  width = 'full',
  style,
  ...rest
}: TimeRangePickerProps & { width?: 'full' | 'auto' }) {
  return <AntTimePicker.RangePicker {...rest} style={pickerStyle(width, style)} />;
}
