import {
  Slider as AntSlider,
  type SliderRangeProps,
  type SliderSingleProps,
} from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

/** AntD 6 exports no `SliderProps` alias; the single/range union is the real prop type. */
export type SliderProps = SliderSingleProps | SliderRangeProps;

/** Single swap point for AntD Slider; handle/rail metrics from the shared contract. */
export function Slider({ style, ...rest }: SliderProps) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const tokenStyle = {
    '--ui-slider-handle-size': `${controlHeight}px`,
    '--ui-slider-font-size': `${fontSize}px`,
    '--ui-slider-radius': `${borderRadius}px`,
  } as CSSProperties;
  return <AntSlider {...rest} style={{ ...tokenStyle, ...style }} />;
}
