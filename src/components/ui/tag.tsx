import type { TagProps as AntTagProps } from 'antd';
import type { CheckableTagProps as AntCheckableTagProps } from 'antd/es/tag/CheckableTag';
import type { CSSProperties } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { classNames } from './native/classNames';
import chipStyles from './openidea/Chip.module.css';
import { getSharedControlTokens, getStatusTokens, type StatusKind } from './tokens.contract';

export interface TagProps extends AntTagProps {
  /** D-12 status kind; the hex comes only from the shared map in the active theme. */
  status?: StatusKind;
}

export interface StatusTagProps extends Omit<TagProps, 'status'> {
  status: StatusKind;
}

function tagStyle(statusColor: string | undefined, callerStyle?: CSSProperties): CSSProperties {
  const { fontSize } = getSharedControlTokens();
  return {
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-tag-padding': 'var(--status-badge-pad)',
    ...(statusColor ? { color: statusColor, borderColor: statusColor, '--ui-status-color': statusColor } : {}),
    ...callerStyle,
  } as CSSProperties;
}

/** Single swap point for AntD Tag. `status` resolves the exact token-map hex for light/dark. */
export function Tag({ status, style, className, children, icon, closable, onClose, ...rest }: TagProps) {
  const { mode } = useThemeMode();
  const statusColor = status ? getStatusTokens(status, mode) : undefined;
  return (
    <span
      {...(rest as object)}
      className={classNames(chipStyles.surface, chipStyles.chip, className)}
      data-oi-control="chip"
      data-state={status ?? 'default'}
      style={{
        ...tagStyle(statusColor, style),
        fontSize: 'var(--font-size-small)',
        padding: 'var(--status-badge-pad)',
        ...(style as object),
      }}
    >
      {icon !== undefined && <span className={chipStyles.icon}>{icon}</span>}
      <span className={chipStyles.label}>{children}</span>
      {closable === true && (
        <button
          type="button"
          aria-label="Remove"
          className={chipStyles.icon}
          onClick={(event) => {
            event.stopPropagation();
            onClose?.(event as never);
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

/** Status-bearing Tag for domain labels; mapping label -> StatusKind belongs at the call site. */
export function StatusTag({ status, ...rest }: StatusTagProps) {
  return <Tag {...rest} status={status} />;
}

/** AntD CheckableTag mirrored under the same policy (font/padding from tokens). */
export function CheckableTag({ checked, onChange, style, className, children, ...rest }: AntCheckableTagProps) {
  const { fontSize } = getSharedControlTokens();
  return (
    <button
      {...(rest as object)}
      type="button"
      role="checkbox"
      aria-checked={checked === true}
      className={classNames(chipStyles.surface, chipStyles.chip, className)}
      data-oi-control="chip"
      data-state={checked === true ? 'checked' : 'unchecked'}
      style={{ '--ui-control-font-size': `${fontSize}px`, ...style } as CSSProperties}
      onClick={() => onChange?.(!checked)}
    >
      <span className={chipStyles.label}>{children}</span>
    </button>
  );
}
