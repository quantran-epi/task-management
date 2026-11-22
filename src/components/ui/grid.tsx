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
export function Row({ gutter, style, className, children, align, justify, wrap, ...rest }: RowProps) {
  const { paddingInline } = getSharedControlTokens();
  const gap = typeof gutter === 'number' || typeof gutter === 'string' ? gutter : paddingInline;
  const justifyMap: Record<string, string> = { start: 'start', end: 'end', center: 'center', 'space-between': 'space-between', 'space-around': 'space-around', 'space-evenly': 'space-evenly' };
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(24, minmax(0, 1fr))',
        gap,
        ...(align ? { alignItems: String(align) as CSSProperties['alignItems'] } : {}),
        ...(justify ? { justifyContent: justifyMap[String(justify)] ?? String(justify) } : {}),
        ...(wrap === false ? { flexWrap: 'nowrap' } : {}),
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
  const screens = useBreakpoint();
  // Resolve the active responsive value: smallest matching breakpoint wins,
  // mirroring AntD's mobile-first order (xs -> xxl). Values can be a span
  // number or a { span, offset } object.
  const responsive = { xs, sm, md, lg, xl, xxl } as Partial<ScreenMap<unknown>>;
  const active = (Object.keys(BREAKPOINTS) as (keyof ScreenMap<number>)[])
    .filter((key) => screens[key] && responsive[key] !== undefined)
    .map((key) => responsive[key])
    .at(-1);
  const activeSpan = typeof active === 'number' ? active
    : active && typeof active === 'object' && 'span' in active ? (active as { span?: number }).span
    : undefined;
  const activeOffset = typeof active === 'object' && active !== null && 'offset' in active ? (active as { offset?: number }).offset
    : offset;
  const resolvedSpan = spanValue((activeSpan as number | undefined) ?? (span as number | undefined));
  const gridColumn = resolvedSpan !== undefined
    ? `${activeOffset ?? 0} / span ${resolvedSpan}`
    : activeOffset !== undefined ? `${activeOffset} / auto` : undefined;

  return (
    <div
      className={className}
      style={{
        ...(gridColumn ? { gridColumn } : {}),
        ...(order !== undefined ? { order } : {}),
        ...(flex !== undefined ? { flex } : {}),
        ...gridStyle(),
        ...style,
      } as CSSProperties}
      data-oi-control="grid-col"
      {...(rest as object)}
    >
      {children as ReactNode}
    </div>
  );
}
