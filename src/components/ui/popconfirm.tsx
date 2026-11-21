import { Popconfirm as AntPopconfirm, type PopconfirmProps as AntPopconfirmProps } from 'antd';
import type { CSSProperties } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { getStatusTokens, type StatusKind } from './tokens.contract';

export interface PopconfirmProps extends AntPopconfirmProps {
  /** Destructive variant maps to the shared danger status token (D-12). */
  tone?: StatusKind;
}

/** Popconfirm wrapper: ok/cancel policy and status-token-derived danger variant. */
export function Popconfirm({
  tone = 'info',
  okText = 'Xác nhận',
  cancelText = 'Hủy',
  okType,
  okButtonProps,
  title,
  ...rest
}: PopconfirmProps) {
  const { mode } = useThemeMode();
  const dangerColor = getStatusTokens(tone, mode);
  return (
    <AntPopconfirm
      {...rest}
      title={title}
      okText={okText}
      cancelText={cancelText}
      okType={okType ?? 'primary'}
      okButtonProps={{
        ...okButtonProps,
        ...(tone === 'danger' ? { danger: true, style: { '--ui-status-color': dangerColor, ...okButtonProps?.style } as CSSProperties } : {}),
      }}
    />
  );
}
