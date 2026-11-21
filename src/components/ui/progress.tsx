import type { ProgressProps as AntProgressProps } from 'antd';
import type { CSSProperties } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { classNames } from './native/classNames';
import feedbackStyles from './openidea/Feedback.module.css';
import { getSharedControlTokens, getStatusTokens, type StatusKind } from './tokens.contract';

export type ProgressProps = AntProgressProps;

/** AntD progress statuses map to the single D-12 status map. */
const STATUS_BY_PROGRESS: Record<NonNullable<AntProgressProps['status']>, StatusKind> = {
  normal: 'accent',
  active: 'info',
  success: 'success',
  exception: 'danger',
};

/** Native N-20 progress; accent/status color comes from tokens only. */
export function Progress({ status = 'normal', strokeColor, percent, style, className, 'aria-label': ariaLabel }: ProgressProps) {
  const { mode } = useThemeMode();
  const { fontSize } = getSharedControlTokens();
  const tone = getStatusTokens(STATUS_BY_PROGRESS[status], mode);
  const value = Math.max(0, Math.min(100, percent ?? 0));
  const indeterminate = percent === undefined;
  const tokenStyle = {
    '--ui-progress-font-size': `${fontSize}px`,
    '--ui-progress-tone': tone,
    '--ui-progress-stroke': strokeColor ?? tone,
    ...style,
  } as CSSProperties;
  return (
    <div
      data-oi-control="progress"
      data-state={status}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : value}
      className={classNames(feedbackStyles.progress, indeterminate && feedbackStyles.indeterminate, className)}
      style={tokenStyle}
    >
      <div
        className={feedbackStyles.bar}
        style={{ width: indeterminate ? undefined : `${value}%`, background: typeof strokeColor === 'string' ? strokeColor : tone }}
      />
    </div>
  );
}
