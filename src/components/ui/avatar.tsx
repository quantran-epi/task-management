import { Avatar as AntAvatar, type AvatarProps as AntAvatarProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type AvatarProps = AntAvatarProps;
export const AvatarGroup = AntAvatar.Group;

/** Single swap point for AntD Avatar; icon size comes from the shared scale. */
export function Avatar({ style, ...rest }: AvatarProps) {
  const { iconSize, fontSize } = getSharedControlTokens();
  const tokenStyle = {
    '--ui-avatar-icon-size': iconSize,
    '--ui-avatar-font-size': `${fontSize}px`,
  } as CSSProperties;
  return <AntAvatar {...rest} style={{ ...tokenStyle, ...style }} />;
}
