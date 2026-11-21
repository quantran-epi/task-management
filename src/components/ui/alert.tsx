import { Alert as AntAlert, type AlertProps as AntAlertProps } from 'antd';
import type { CSSProperties } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { getSharedControlTokens, getStatusTokens, type StatusKind } from './tokens.contract';

export type AlertProps = AntAlertProps;

export const AlertErrorBoundary = AntAlert.ErrorBoundary;

/** AntD alert types map to the single D-12 status map; no literal status hex. */
const STATUS_BY_ALERT_TYPE: Record<NonNullable<AntAlertProps['type']>, StatusKind> = {
  success: 'success',
  warning: 'warning',
  error: 'danger',
  info: 'info',
};

/** Single swap point for AntD Alert; status tone comes from the shared map. */
export function Alert({ type = 'info', style, ...rest }: AlertProps) {
  const { mode } = useThemeMode();
  const { fontSize, borderRadius } = getSharedControlTokens();
  const statusColor = getStatusTokens(STATUS_BY_ALERT_TYPE[type], mode);
  return (
    <AntAlert
      {...rest}
      type={type}
      style={
        {
          '--ui-status-color': statusColor,
          '--ui-control-font-size': `${fontSize}px`,
          '--ui-control-radius': `${borderRadius}px`,
          ...style,
        } as CSSProperties
      }
    />
  );
}
