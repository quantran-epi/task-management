import type { ColProps as AntColProps, RowProps as AntRowProps } from 'antd';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type ColProps = AntColProps;
export type RowProps = AntRowProps;

/** Token spacing for grid gutters, derived from the shared control height. */
export function gridStyle(): CSSProperties {
  const { controlHeight, paddingInline } = getSharedControlTokens();
  return {
    '--ui-grid-row-height': `${controlHeight}px`,
    '--ui-grid-gutter': `${paddingInline}px`,
  } as CSSProperties;
}

const BREAKPOINTS: ScreenMap<number> = { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1600 };

type ScreenMap<T> = Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl', T>;

function readBreakpoints(): Partial<ScreenMap<boolean>> {
  return Object.fromEntries(
    Object.entries(BREAKPOINTS).map(([key, min]) => [key, window.innerWidth >= min]),
  ) as Partial<ScreenMap<boolean>>;
}

/** useBreakpoint mirrors the AntD shape: every key is a boolean. */
export function useBreakpoint(): Partial<ScreenMap<boolean>> {
  const [screens, setScreens] = useState<Partial<ScreenMap<boolean>>>(readBreakpoints);
  useEffect(() => {
    const update = () => setScreens(readBreakpoints());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return screens;
}

/** Grid namespace swap point; useBreakpoint is the consumed static. */
export const Grid = { useBreakpoint };

function spanValue(span: number | undefined): number | undefined {
  return span === undefined ? undefined : Math.max(0, Math.min(24, span));
}

/** Row swap point: gutter defaults come from the shared scale unless caller overrides. */
export function Row({ gutter, style, className, children, ...rest }: RowProps) {
  const { paddingInline } = getSharedControlTokens();
  const gap = typeof gutter === 'number' || typeof gutter === 'string' ? gutter : paddingInline;
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(24, minmax(0, 1fr))',
        gap,
        ...gridStyle(),
        ...style,
      }}
      data-oi-control="grid"
      {...(rest as object)}
    >
      {children as ReactNode}
    </div>
  );
}

/** Col swap point with the same token-derived metrics and responsive span props. */
export function Col({ style, className, children, span, xs, sm, md, lg, xl, xxl, offset, push, pull, order, flex, ...rest }: ColProps) {
  return (
    <div
      className={className}
      style={{
        gridColumn: spanValue(span as number | undefined) !== undefined ? `span ${spanValue(span as number | undefined)}` : undefined,
        ...(flex !== undefined ? { flex } : {}),
        ...gridStyle(),
        ...style,
      } as CSSProperties}
      data-oi-control="grid-col"
      {...({ xs, sm, md, lg, xl, xxl, offset, push, pull, order, ...rest } as object)}
    >
      {children as ReactNode}
    </div>
  );
}
