import { Badge as AntBadge, type BadgeProps as AntBadgeProps } from 'antd';
import type { CSSProperties } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { getSharedControlTokens, getStatusTokens, type StatusKind } from './tokens.contract';

export interface BadgeProps extends Omit<AntBadgeProps, 'status'> {
  /** D-12 status kind; badge color comes only from the shared theme map. */
  status?: StatusKind;
}

/** Single swap point for AntD Badge with status-token-colored dot/count. */
export function Badge({ status = 'info', color, style, ...rest }: BadgeProps) {
  const { mode } = useThemeMode();
  const { fontSize } = getSharedControlTokens();
  const statusColor = getStatusTokens(status, mode);
  return (
    <AntBadge
      {...rest}
      color={color ?? statusColor}
      style={
        {
          '--ui-control-font-size': `${fontSize}px`,
          '--ui-status-color': statusColor,
          ...style,
        } as CSSProperties
      }
    />
  );
}
