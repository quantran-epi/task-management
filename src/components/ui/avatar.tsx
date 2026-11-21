import type { AvatarProps as AntAvatarProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { classNames } from './native/classNames';
import chipStyles from './openidea/Chip.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type AvatarProps = AntAvatarProps;

/** Migrate AvatarGroup statics with real DOM: gap 4, overlap -6 on adjacent avatars. */
export function AvatarGroup({ style, className, children }: { style?: CSSProperties; className?: string; children?: ReactNode }) {
  return (
    <div
      className={className}
      style={{ display: 'flex', gap: 4, ...style }}
      data-oi-control="avatar-group"
    >
      {children}
    </div>
  );
}

/** Single swap point for AntD Avatar; icon size comes from the shared scale. */
export function Avatar({ style, className, children, icon, src, alt, size, shape, ...rest }: AvatarProps) {
  const { iconSize, fontSize } = getSharedControlTokens();
  const dimension = typeof size === 'number' ? size : 28;
  const radius = shape === 'circle' ? '50%' : 'var(--radius-control, 4px)';
  return (
    <span
      {...(rest as object)}
      className={classNames(chipStyles.surface, chipStyles.chip, className)}
      data-oi-control="avatar"
      style={
        {
          '--ui-avatar-icon-size': iconSize,
          '--ui-avatar-font-size': `${fontSize}px`,
          width: dimension,
          height: dimension,
          minWidth: dimension,
          padding: 0,
          justifyContent: 'center',
          borderRadius: radius,
          overflow: 'hidden',
          ...style,
        } as CSSProperties
      }
    >
      {src !== undefined
        ? <img src={src as string} alt={alt ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : icon !== undefined
          ? <span className={chipStyles.icon} aria-hidden="true">{icon}</span>
          : <span className={chipStyles.label}>{children}</span>}
    </span>
  );
}
