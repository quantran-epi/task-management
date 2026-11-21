import {
  Segmented as AntSegmented,
  type SegmentedProps as AntSegmentedProps,
} from 'antd';
import type { SegmentedValue } from '@rc-component/segmented';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type SegmentedProps<ValueType = SegmentedValue> = AntSegmentedProps<ValueType>;

/** Generic preserved so callers keep their literal union (`<Segmented<'a' | 'b'>>`). */
export function Segmented<ValueType = SegmentedValue>({ style, ...rest }: SegmentedProps<ValueType>) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const tokenStyle = {
    '--ui-segmented-height': `${controlHeight}px`,
    '--ui-segmented-font-size': `${fontSize}px`,
    '--ui-segmented-radius': `${borderRadius}px`,
  } as CSSProperties;
  return <AntSegmented<ValueType> {...rest} style={{ ...tokenStyle, ...style }} />;
}
