import {
  type SliderRangeProps,
  type SliderSingleProps,
} from 'antd';
import { useCallback, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { classNames } from './native/classNames';
import checkboxStyles from './openidea/Checkbox.module.css';
import splitterStyles from './openidea/Splitter.module.css';
import { getSharedControlTokens } from './tokens.contract';

/** AntD 6 exports no `SliderProps` alias; the single/range union is the real prop type. */
export type SliderProps = SliderSingleProps | SliderRangeProps;

type SliderValue = number | [number, number];

function isRangeProps(props: SliderProps): props is SliderRangeProps {
  return Array.isArray(props.defaultValue) || Array.isArray(props.value) || props.range === true;
}

function clamp(value: number, min: number, max: number, step: number): number {
  const bounded = Math.max(min, Math.min(max, value));
  const steps = Math.round((bounded - min) / step);
  return Math.min(max, min + steps * step);
}

/** Native N-23 slider with rail, draggable/keyboard handles, and preserved value payload. */
export function Slider({ style, className, ...rest }: SliderProps) {
  const { fontSize, borderRadius } = getSharedControlTokens();
  const isRange = isRangeProps(rest);
  const min = rest.min ?? 0;
  const max = rest.max ?? 100;
  const step = rest.step && rest.step > 0 ? rest.step : 1;
  const disabled = rest.disabled === true;
  const vertical = rest.vertical === true;
  const onAfterChange = rest.onAfterChange;
  const railRef = useRef<HTMLDivElement>(null);
  const dragIndex = useRef<number | null>(null);
  // `current` is a render snapshot; onAfterChange must report the value just
  // committed, not the stale value from the render that started the drag/key press.
  const lastCommitted = useRef<SliderValue | undefined>(undefined);

  const singleProps = rest as SliderSingleProps;
  const rangeProps = rest as SliderRangeProps;
  const controlled = rest.value as SliderValue | undefined;
  const fallback = rest.defaultValue as SliderValue | undefined;
  const uncontrolledRef = useRef<SliderValue>(
    (Array.isArray(controlled) && controlled.length === 2 ? controlled : undefined)
      ?? (typeof controlled === 'number' ? controlled : undefined)
      ?? fallback
      ?? (isRange ? [min, max] : min),
  );
  const current: SliderValue =
    (Array.isArray(controlled) && controlled.length === 2 ? controlled : undefined) ??
    (typeof controlled === 'number' ? controlled : uncontrolledRef.current);
  const values: number[] = Array.isArray(current) ? current : [current as number];

  const commit = useCallback((next: number, index: number) => {
    const resolved = clamp(next, min, max, step);
    let output: SliderValue;
    if (isRange) {
      const base = (Array.isArray(current) ? current : [min, max]) as [number, number];
      const pair: [number, number] = [...base];
      pair[index] = resolved;
      if (pair[0] > pair[1]) {
        if (index === 0) pair[1] = pair[0];
        else pair[0] = pair[1];
      }
      output = pair;
    } else {
      output = resolved;
    }
    if (controlled === undefined) uncontrolledRef.current = output;
    lastCommitted.current = output;
    if (isRange) rangeProps.onChange?.(output as [number, number]);
    else singleProps.onChange?.(output as number);
  }, [current, controlled, isRange, max, min, rangeProps, singleProps, step]);

  function valueFromPointer(event: PointerEvent<HTMLDivElement>): number {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return min;
    const ratio = vertical
      ? 1 - (event.clientY - rect.top) / Math.max(1, rect.height)
      : (event.clientX - rect.left) / Math.max(1, rect.width);
    return min + Math.max(0, Math.min(1, ratio)) * (max - min);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>, index: number) {
    if (disabled) return;
    dragIndex.current = index;
    event.currentTarget.setPointerCapture(event.pointerId);
    commit(valueFromPointer(event), index);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragIndex.current === null || disabled) return;
    commit(valueFromPointer(event), dragIndex.current);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragIndex.current === null) return;
    dragIndex.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    (onAfterChange as ((value: SliderValue) => void) | undefined)?.(lastCommitted.current ?? current);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number) {
    if (disabled) return;
    const delta = ['ArrowLeft', 'ArrowDown'].includes(event.key)
      ? -step
      : ['ArrowRight', 'ArrowUp'].includes(event.key)
        ? step
        : 0;
    if (delta === 0) return;
    event.preventDefault();
    commit((values[index] ?? min) + delta, index);
    (onAfterChange as ((value: SliderValue) => void) | undefined)?.(lastCommitted.current ?? current);
  }

  const handleSize = 16;
  const tokenStyle = {
    '--ui-slider-handle-size': `${handleSize}px`,
    '--ui-slider-font-size': `${fontSize}px`,
    '--ui-slider-radius': `${borderRadius}px`,
    ...style,
  } as CSSProperties;
  const marks = rest.marks;
  return (
    <div
      data-oi-control="slider"
      data-state={disabled ? 'disabled' : 'active'}
      data-orientation={vertical ? 'vertical' : 'horizontal'}
      className={classNames(className)}
      style={{ position: 'relative', padding: handleSize / 2, ...tokenStyle }}
      ref={railRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        style={{
          position: 'absolute',
          background: 'var(--fg-muted, #888)',
          borderRadius: `${borderRadius}px`,
          ...(vertical
            ? { width: 4, left: '50%', top: handleSize / 2, bottom: handleSize / 2, marginLeft: -2 }
            : { height: 4, left: handleSize / 2, right: handleSize / 2, top: '50%', marginTop: -2 }),
        }}
      />
      {values.map((value, index) => {
        const pct = ((value - min) / Math.max(1, max - min)) * 100;
        return (
          <div
            key={index}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={(rest as { 'aria-label'?: string | string[] })['aria-label']
              ? (Array.isArray((rest as { 'aria-label'?: string | string[] })['aria-label'])
                  ? (rest as { 'aria-label': string[] })['aria-label'][index]
                  : ((rest as { 'aria-label': string })['aria-label']))
              : isRange ? `Giá trị ${index + 1}` : 'Giá trị'}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-disabled={disabled}
            aria-orientation={vertical ? 'vertical' : 'horizontal'}
            className={classNames(checkboxStyles.box, checkboxStyles.radio, splitterStyles.handle)}
            style={{
              position: 'absolute',
              width: handleSize,
              height: handleSize,
              borderRadius: '50%',
              ...(vertical ? { left: '50%', bottom: `calc(${pct}% + ${handleSize / 2 - pct / 100 * handleSize}px)`, marginLeft: -handleSize / 2 } : { left: `calc(${pct}% + ${handleSize / 2 - pct / 100 * handleSize}px)`, top: '50%', marginTop: -handleSize / 2 }),
              cursor: disabled ? 'not-allowed' : 'grab',
            }}
            onPointerDown={(event) => onPointerDown(event, index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          />
        );
      })}
      {marks && typeof marks === 'object' && (
        <div data-oi-part="marks">
          {Object.entries(marks).map(([key, mark]) => (
            <span key={key} data-oi-part="mark">{mark && typeof mark === 'object' && 'label' in mark ? String(mark.label) : String(mark ?? '')}</span>
          ))}
        </div>
      )}
    </div>
  );
}
