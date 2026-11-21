import type { SplitterProps as AntSplitterProps } from 'antd';
import {
  Children,
  isValidElement,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { classNames } from './native/classNames';
import splitterStyles from './openidea/Splitter.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type { SplitterProps } from 'antd';

export interface PanelProps {
  className?: string;
  style?: CSSProperties;
  min?: number | string;
  max?: number | string;
  size?: number | string;
  defaultSize?: number | string;
  disabled?: boolean;
  resizable?: boolean;
  collapsible?: boolean | { start?: boolean; end?: boolean };
  children?: ReactNode;
}

export interface SplitterWrapperProps extends AntSplitterProps {
  /** Resizer hit target stays whole-pixel and token-derived. */
  compact?: boolean;
  /** AntD declares children only on the concrete component, not on SplitterProps. */
  children?: ReactNode;
}

function percentOf(size: number | string | undefined, fallback: number): number {
  if (typeof size === 'number') return size <= 1 ? size * 100 : size;
  if (typeof size === 'string' && size.trim().endsWith('%')) {
    const value = Number.parseFloat(size);
    return Number.isFinite(value) ? value : fallback;
  }
  return fallback;
}

function sizeToCss(size: number | string | undefined, fallback: string): string {
  if (size === undefined) return fallback;
  if (typeof size === 'number') return `${size}%`;
  return size;
}

/** Self-built SplitterPanel static — value defined here, never re-exported from AntD. */
export function SplitterPanel(_props: PanelProps) { return null; }

/** Native S-SPL: vendored handle (1px + hit ±3px), pointer/keyboard resize, AntD onResize payload. */
export function Splitter({ compact = true, style, ...rest }: SplitterWrapperProps) {
  void compact;
  const { borderRadius, iconSize } = getSharedControlTokens();
  const orientation = rest.orientation ?? rest.layout ?? 'horizontal';
  const vertical = rest.vertical === true || orientation === 'vertical';
  const groupRef = useRef<HTMLDivElement>(null);
  const dragIndex = useRef<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);

  const panels = Children.toArray(rest.children).filter(isValidElement) as ReactElement<PanelProps>[];
  const defaults = panels.map((panel) => percentOf(panel.props.defaultSize ?? panel.props.size, 100 / Math.max(1, panels.length)));
  const [sizes, setSizes] = useState<number[]>(defaults);
  // Snapshot primitives — no fresh Set/array in memo deps (53-REVIEW RR-01).
  const sizeSnapshot = sizes.join('|');
  const current = sizeSnapshot ? sizeSnapshot.split('|').map(Number) : defaults;

  const splitterStyle = {
    '--ui-splitter-handle-radius': `${borderRadius}px`,
    '--ui-splitter-handle-size': iconSize,
    ...style,
  } as CSSProperties;

  function commit(index: number, nextValue: number, eventType: 'start' | 'resize' | 'end') {
    const min = percentOf(panels[index]?.props.min, 0);
    const max = percentOf(panels[index]?.props.max, 100);
    const neighbor = panels[index + 1];
    const neighborMin = percentOf(neighbor?.props.min, 0);
    const neighborMax = percentOf(neighbor?.props.max, 100);
    const sum = current[index]! + (current[index + 1] ?? 0);
    const bounded = Math.max(min, Math.min(Math.min(max, sum - neighborMin), nextValue));
    const nextPair: [number, number] = [bounded, sum - bounded];
    if (nextPair[1]! < neighborMin || nextPair[1]! > Math.min(neighborMax, sum - min)) return;
    const next = current.slice();
    next[index] = nextPair[0]!;
    if (index + 1 < next.length) next[index + 1] = nextPair[1]!;
    setSizes(next);
    const output = next.map((value, position) => {
      const declared = panels[position]?.props.size ?? panels[position]?.props.defaultSize;
      return typeof declared === 'number' && declared > 1 ? (value / 100) * declared : value;
    });
    if (eventType === 'start') (rest.onResizeStart as ((sizes: number[]) => void) | undefined)?.(output);
    (rest.onResize as ((sizes: number[]) => void) | undefined)?.(output);
    if (eventType === 'end') (rest.onResizeEnd as ((sizes: number[]) => void) | undefined)?.(output);
  }

  function pointerRatio(event: PointerEvent<HTMLDivElement>): number {
    const rect = groupRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return vertical
      ? (event.clientY - rect.top) / Math.max(1, rect.height)
      : (event.clientX - rect.left) / Math.max(1, rect.width);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>, index: number) {
    if (panels[index]?.props.disabled === true || panels[index + 1]?.props.disabled === true) return;
    if (panels[index]?.props.resizable === false || panels[index + 1]?.props.resizable === false) return;
    event.stopPropagation();
    dragIndex.current = index;
    event.currentTarget.setPointerCapture(event.pointerId);
    commit(index, pointerRatio(event) * 100, 'start');
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragIndex.current === null) return;
    event.stopPropagation();
    commit(dragIndex.current, pointerRatio(event) * 100, 'resize');
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragIndex.current === null) return;
    const index = dragIndex.current;
    dragIndex.current = null;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    commit(index, current[index] ?? 0, 'end');
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number) {
    if (panels[index]?.props.disabled === true || panels[index + 1]?.props.disabled === true) return;
    const decrease = vertical ? 'ArrowUp' : 'ArrowLeft';
    const increase = vertical ? 'ArrowDown' : 'ArrowRight';
    if (event.key !== decrease && event.key !== increase) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 2;
    const delta = event.key === increase ? step : -step;
    commit(index, (current[index] ?? 0) + delta, 'resize');
  }

  return (
    <div
      ref={groupRef}
      className={classNames(splitterStyles.group, rest.className)}
      style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', ...splitterStyle }}
      data-oi-control="splitter"
      data-state={dragIndex.current !== null ? 'expanded' : 'default'}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {panels.map((panel, index) => (
        <div key={index} style={{ display: 'contents' }}>
          <div
            className={classNames(splitterStyles.panel, panel.props.className)}
            style={{ flexBasis: sizeToCss(panel.props.size ?? `${current[index]}%`, 'auto'), ...panel.props.style }}
            data-oi-control="splitter-panel"
            data-state={panel.props.disabled ? 'disabled' : 'default'}
          >
            {panel.props.children}
          </div>
          {index < panels.length - 1 ? (
            <div
              role="separator"
              tabIndex={panel.props.disabled || panels[index + 1]?.props.disabled ? -1 : 0}
              aria-orientation={vertical ? 'horizontal' : 'vertical'}
              aria-valuenow={Math.round(current[index] ?? 0)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-disabled={panel.props.disabled || panels[index + 1]?.props.disabled || undefined}
              className={splitterStyles.handle}
              data-oi-control="splitter-handle"
              data-state={focused === index ? 'focus-visible' : 'default'}
              onFocus={() => setFocused(index)}
              onBlur={() => setFocused(null)}
              onPointerDown={(event) => onPointerDown(event, index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
