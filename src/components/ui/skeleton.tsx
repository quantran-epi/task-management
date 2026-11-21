import { Skeleton as AntSkeleton, type SkeletonProps as AntSkeletonProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type SkeletonProps = AntSkeletonProps;
export const SkeletonButton = AntSkeleton.Button;
export const SkeletonInput = AntSkeleton.Input;
export const SkeletonImage = AntSkeleton.Image;
export const SkeletonAvatar = AntSkeleton.Avatar;
export const SkeletonNode = AntSkeleton.Node;

/** Single swap point for AntD Skeleton; row metrics derived from the shared control height. */
export function Skeleton({ style, ...rest }: SkeletonProps) {
  const { controlHeight, iconSize } = getSharedControlTokens();
  const tokenStyle = {
    '--ui-skeleton-row-height': `${controlHeight}px`,
    '--ui-skeleton-avatar-size': iconSize,
  } as CSSProperties;
  return <AntSkeleton {...rest} style={{ ...tokenStyle, ...style }} />;
}
