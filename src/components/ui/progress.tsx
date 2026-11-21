import { Progress as AntProgress, type ProgressProps as AntProgressProps } from 'antd';
import type { CSSProperties } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { getSharedControlTokens, getStatusTokens, type StatusKind } from './tokens.contract';

export type ProgressProps = AntProgressProps;

/** AntD progress statuses map to the single D-12 status map. */
const STATUS_BY_PROGRESS: Record<NonNullable<AntProgressProps['status']>, StatusKind> = {
  normal: 'accent',
  active: 'info',
  success: 'success',
  exception: 'danger',
};

/** Single swap point for AntD Progress; accent/status color comes from tokens only. */
export function Progress({ status = 'normal', strokeColor, ...rest }: ProgressProps) {
  const { mode } = useThemeMode();
  const { fontSize } = getSharedControlTokens();
  const tone = getStatusTokens(STATUS_BY_PROGRESS[status], mode);
  return (
    <AntProgress
      {...rest}
      status={status}
      strokeColor={strokeColor ?? tone}
      style={
        {
          '--ui-progress-font-size': `${fontSize}px`,
          '--ui-progress-tone': tone,
          ...rest.style,
        } as CSSProperties
      }
    />
  );
}
