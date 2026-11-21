import type { BadgeProps as AntBadgeProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { classNames } from './native/classNames';
import chipStyles from './openidea/Chip.module.css';
import { getSharedControlTokens, getStatusTokens, type StatusKind } from './tokens.contract';

export interface BadgeProps extends Omit<AntBadgeProps, 'status'> {
  /** D-12 status kind; badge color comes only from the shared theme map. */
  status?: StatusKind;
}

/** Single swap point for AntD Badge with status-token-colored dot/count. */
export function Badge({ status = 'info', color, style, count, dot, text, children, showZero, overflowCount = 99, className, ...rest }: BadgeProps) {
  const { mode } = useThemeMode();
  const { fontSize } = getSharedControlTokens();
  const statusColor = getStatusTokens(status, mode);
  const tone = color ?? statusColor;
  const numeric = typeof count === 'number' ? count : 0;
  const showCount = dot === true || (count !== undefined && (showZero === true || numeric > 0));
  const label = showCount && !dot && numeric > overflowCount ? `${overflowCount}+` : count;

  const chip = (
    <span
      className={classNames(chipStyles.surface, chipStyles.chip, className)}
      data-oi-control="chip"
      data-state={status}
      style={
        {
          '--ui-control-font-size': `${fontSize}px`,
          '--ui-status-color': statusColor,
          color: tone,
          ...style,
        } as CSSProperties
      }
      {...(rest as object)}
    >
      {showCount && (
        <span
          className={chipStyles.label}
          style={dot === true ? { width: 8, height: 8, borderRadius: '50%', background: tone } : { color: tone }}
          data-oi-control="badge-dot"
        >
          {dot === true ? null : (label as ReactNode)}
        </span>
      )}
      {text !== undefined && <span className={chipStyles.label}>{text as ReactNode}</span>}
      {children !== undefined && !showCount && <span className={chipStyles.label}>{children as ReactNode}</span>}
    </span>
  );

  if (children === undefined || showCount) return chip;
  return (
    <span className="taskmate-badge-anchor" style={{ position: 'relative', display: 'inline-flex' }}>
      {children}
      {showCount ? chip : null}
    </span>
  );
}
