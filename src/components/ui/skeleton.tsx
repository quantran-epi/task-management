import type { SkeletonProps as AntSkeletonProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { classNames } from './native/classNames';
import feedbackStyles from './openidea/Feedback.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type SkeletonProps = AntSkeletonProps;

interface StaticShapeProps {
  active?: boolean;
  size?: number | string;
  shape?: 'circle' | 'square' | 'default';
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}

function Shape({ kind, style, className }: StaticShapeProps & { kind: 'button' | 'input' | 'image' | 'avatar' | 'node' }) {
  const { controlHeight, iconSize, borderRadius } = getSharedControlTokens();
  const dimensions =
    kind === 'avatar'
      ? { width: iconSize, height: iconSize, borderRadius: '50%' }
      : kind === 'node'
        ? { width: '100%', height: `${controlHeight / 2}px` }
        : { width: kind === 'image' ? '120px' : '100%', height: `${controlHeight}px`, borderRadius: `${borderRadius}px` };
  return (
    <span
      data-oi-control="skeleton"
      data-state={kind}
      aria-busy="true"
      className={classNames(feedbackStyles.skeleton, className)}
      style={{ display: 'block', background: 'var(--bg-hover, rgba(127,127,127,0.18))', ...dimensions, ...style }}
    />
  );
}

/** Native mirrors of the five AntD Skeleton static shapes. */
export function SkeletonButton(props: StaticShapeProps) {
  return <Shape {...props} kind="button" />;
}
export function SkeletonInput(props: StaticShapeProps) {
  return <Shape {...props} kind="input" />;
}
export function SkeletonImage(props: StaticShapeProps) {
  return <Shape {...props} kind="image" />;
}
export function SkeletonAvatar(props: StaticShapeProps) {
  return <Shape {...props} kind="avatar" />;
}
export function SkeletonNode(props: StaticShapeProps) {
  return <Shape {...props} kind="node" />;
}

/** Native N-22 skeleton; row/avatar metrics derived from the shared control height. */
export function Skeleton({ style, active = true, loading = true, avatar, paragraph, title, className }: SkeletonProps) {
  const { controlHeight, iconSize } = getSharedControlTokens();
  const tokenStyle = {
    '--ui-skeleton-row-height': `${controlHeight}px`,
    '--ui-skeleton-avatar-size': iconSize,
    '--ui-skeleton-shimmer-duration': active ? '1.4s' : '0s',
    ...style,
  } as CSSProperties;
  if (!loading) return null;
  const rows = paragraph === false ? 0 : typeof paragraph === 'object' ? (paragraph.rows ?? 3) : 3;
  return (
    <div data-oi-control="skeleton" data-state="loading" aria-busy="true" className={className} style={tokenStyle}>
      {(avatar || (typeof avatar === 'object' && avatar !== null)) && (
        <SkeletonAvatar style={{ display: 'inline-block', verticalAlign: 'middle', marginInlineEnd: 8 }} />
      )}
      <div style={{ display: 'inline-block', width: 'calc(100% - 40px)', verticalAlign: 'middle' }}>
        {title !== false && <SkeletonNode style={{ width: typeof title === 'object' ? (title.width as string | undefined) : '60%' }} />}
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonNode key={i} />
        ))}
      </div>
    </div>
  );
}
