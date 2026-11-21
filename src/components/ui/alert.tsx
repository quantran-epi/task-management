import type { AlertProps as AntAlertProps } from 'antd';
import { Component, type CSSProperties, type ReactNode } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { classNames } from './native/classNames';
import feedbackStyles from './openidea/Feedback.module.css';
import buttonStyles from './openidea/Button.module.css';
import { CheckCircleFilled, CloseOutlined, ExclamationCircleFilled, InfoCircleOutlined, WarningOutlined } from './icon';
import { getSharedControlTokens, getStatusTokens, type StatusKind } from './tokens.contract';

export type AlertProps = AntAlertProps;

/** AntD alert types map to the single D-12 status map; no literal status hex. */
const STATUS_BY_ALERT_TYPE: Record<NonNullable<AntAlertProps['type']>, StatusKind> = {
  success: 'success',
  warning: 'warning',
  error: 'danger',
  info: 'info',
};

const TYPE_ICON = {
  success: CheckCircleFilled,
  warning: WarningOutlined,
  error: ExclamationCircleFilled,
  info: InfoCircleOutlined,
} as const;

interface AlertErrorBoundaryProps {
  title?: ReactNode;
  message?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  id?: string;
}

/** Native replacement for AntAlert.ErrorBoundary with the same public shape. */
export class AlertErrorBoundary extends Component<AlertErrorBoundaryProps, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Keep the caught error in state so callers see the same failure fallback.
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      const heading = this.props.title ?? this.props.message;
      return (
        <div data-oi-control="alert" data-state="error" role="alert" id={this.props.id}>
          {heading !== undefined && <span data-oi-part="message">{heading}</span>}
          {this.props.description !== undefined && (
            <span data-oi-part="description">{this.props.description}</span>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

function closableHandler(closable: AntAlertProps['closable'], onClose: AntAlertProps['onClose']) {
  if (typeof closable === 'object' && closable.onClose) return closable.onClose;
  if (typeof closable === 'object' && closable.closeIcon) return onClose;
  return onClose;
}

/** Native N-01 feedback banner; status tone comes from the shared D-12 map. */
export function Alert({
  type = 'info',
  title,
  message,
  description,
  showIcon = true,
  closable,
  closeText,
  closeIcon,
  onClose,
  role = 'alert',
  style,
  className,
  icon,
  action,
}: AlertProps) {
  const { mode } = useThemeMode();
  const { fontSize, borderRadius } = getSharedControlTokens();
  const status = STATUS_BY_ALERT_TYPE[type];
  const statusColor = getStatusTokens(status, mode);
  const Icon = TYPE_ICON[type];
  const canClose = closable === true || (typeof closable === 'object' && closable !== null);
  const handleClose = closableHandler(closable, onClose);
  const heading = title ?? message;
  const tokenStyle = {
    '--ui-status-color': statusColor,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-radius': `${borderRadius}px`,
    ...style,
  } as CSSProperties;
  return (
    <div
      data-oi-control="alert"
      data-state={status}
      role={role}
      className={classNames(feedbackStyles.toast, className)}
      style={tokenStyle}
    >
      {(showIcon || icon) && (
        <span className={feedbackStyles.toastIcon} data-oi-part="icon" style={{ color: statusColor }}>
          {icon ?? <Icon tone={status} aria-label={type} />}
        </span>
      )}
      <span className={feedbackStyles.toastMain} data-oi-part="text">
        {heading !== undefined && (
          <span className={feedbackStyles.toastTitle} data-oi-part="message">{heading}</span>
        )}
        {description !== undefined && (
          <span className={feedbackStyles.toastBody} data-oi-part="description">{description}</span>
        )}
      </span>
      {action}
      {canClose && (
        <button
          type="button"
          aria-label="Đóng"
          className={classNames(buttonStyles.iconButton, buttonStyles['is-small'], feedbackStyles.toastClose)}
          onClick={handleClose}
        >
          {closeText ?? closeIcon ?? <CloseOutlined />}
        </button>
      )}
    </div>
  );
}
