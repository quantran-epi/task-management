import type { CSSProperties } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { getSharedControlTokens, getStatusTokens, type StatusKind } from './tokens.contract';

export interface StatusDotProps {
  status: StatusKind;
  /** Optional accessible name; a bare dot is decorative unless labeled. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/** Third D-12 surface: a TaskMate status dot reading the same map as Tag and Badge. */
export function StatusDot({ status, label, className, style }: StatusDotProps) {
  const { mode } = useThemeMode();
  const { fontSize, iconSize } = getSharedControlTokens();
  const statusColor = getStatusTokens(status, mode);
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      style={
        {
          display: 'inline-block',
          width: `calc(${iconSize} / 2)`,
          height: `calc(${iconSize} / 2)`,
          borderRadius: '50%',
          backgroundColor: statusColor,
          '--ui-control-font-size': `${fontSize}px`,
          '--ui-status-color': statusColor,
          ...style,
        } as CSSProperties
      }
    />
  );
}
