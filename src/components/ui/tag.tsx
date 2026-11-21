import { Tag as AntTag, type TagProps as AntTagProps } from 'antd';
import type { CheckableTagProps as AntCheckableTagProps } from 'antd/es/tag/CheckableTag';
import type { CSSProperties } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { getSharedControlTokens, getStatusTokens, type StatusKind } from './tokens.contract';

export interface TagProps extends AntTagProps {
  /** D-12 status kind; the hex comes only from the shared map in the active theme. */
  status?: StatusKind;
}

export interface StatusTagProps extends Omit<TagProps, 'status'> {
  status: StatusKind;
}

function tagStyle(statusColor?: string, callerStyle?: CSSProperties): CSSProperties {
  const { fontSize } = getSharedControlTokens();
  return {
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-tag-padding': 'var(--status-badge-pad)',
    ...(statusColor ? { color: statusColor, borderColor: statusColor, '--ui-status-color': statusColor } : {}),
    ...callerStyle,
  } as CSSProperties;
}

/** Single swap point for AntD Tag. `status` resolves the exact token-map hex for light/dark. */
export function Tag({ status, style, ...rest }: TagProps) {
  const { mode } = useThemeMode();
  const statusColor = status ? getStatusTokens(status, mode) : undefined;
  return (
    <AntTag
      {...rest}
      style={tagStyle(statusColor, style)}
      styles={{ root: { fontSize: 'var(--font-size-small)', padding: 'var(--status-badge-pad)' } }}
    />
  );
}

/** Status-bearing Tag for domain labels; mapping label -> StatusKind belongs at the call site. */
export function StatusTag({ status, ...rest }: StatusTagProps) {
  return <Tag {...rest} status={status} />;
}

/** AntD CheckableTag mirrored under the same policy (font/padding from tokens). */
export function CheckableTag({ style, ...rest }: AntCheckableTagProps) {
  const { fontSize } = getSharedControlTokens();
  return (
    <AntTag.CheckableTag
      {...rest}
      style={{ '--ui-control-font-size': `${fontSize}px`, ...style } as CSSProperties}
    />
  );
}
