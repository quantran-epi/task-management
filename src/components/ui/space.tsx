import type { SpaceProps as AntSpaceProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { classNames } from './native/classNames';
import { getSharedControlTokens } from './tokens.contract';

export type SpaceProps = AntSpaceProps;

type CompactProps = { style?: CSSProperties; className?: string; children?: ReactNode; block?: boolean; direction?: 'horizontal' | 'vertical' };

/** AntD Space.Compact mirrored as a named export; no bare re-export. */
export function SpaceCompact({ style, className, children, block, direction = 'horizontal' }: CompactProps) {
  return (
    <div
      className={classNames(className)}
      style={{ display: 'flex', flexDirection: direction === 'vertical' ? 'column' : 'row', gap: 0, width: block === true ? '100%' : undefined, ...style }}
      data-oi-control="space"
      data-state="compact"
    >
      {children}
    </div>
  );
}

function resolveGap(size: SpaceProps['size'], fallback: number): number | string {
  if (size === 'small') return 8;
  if (size === 'middle') return 16;
  if (size === 'large') return 24;
  if (typeof size === 'number') return size;
  if (typeof size === 'string') return size;
  return fallback;
}

/** Single swap point for AntD Space; default gap is the shared token padding. */
export function Space({ size, style, className, children, direction = 'horizontal', orientation, align, wrap, ...rest }: SpaceProps) {
  const { paddingInline } = getSharedControlTokens();
  const resolvedDirection = (orientation ?? direction) as 'horizontal' | 'vertical';
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: resolvedDirection === 'vertical' ? 'column' : 'row',
        flexWrap: wrap === true ? 'wrap' : undefined,
        alignItems: align === 'center' ? 'center' : align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : undefined,
        gap: resolveGap(size, paddingInline),
        '--ui-space-gap': `${paddingInline}px`,
        ...style,
      } as CSSProperties}
      data-oi-control="space"
      data-state={resolvedDirection}
      {...(rest as object)}
    >
      {children as ReactNode}
    </div>
  );
}
