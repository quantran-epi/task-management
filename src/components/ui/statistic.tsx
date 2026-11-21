import { Statistic as AntStatistic, type StatisticProps as AntStatisticProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type StatisticProps = AntStatisticProps;
export const StatisticCountdown = AntStatistic.Countdown;
export const StatisticTimer = AntStatistic.Timer;

/** Single swap point for AntD Statistic; number font metric from the shared contract. */
export function Statistic({ style, ...rest }: StatisticProps) {
  const { fontSize } = getSharedControlTokens();
  const tokenStyle = { '--ui-statistic-font-size': `${fontSize}px` } as CSSProperties;
  return <AntStatistic {...rest} style={{ ...tokenStyle, ...style }} />;
}
