import type { SegmentedProps as AntSegmentedProps } from 'antd';
import type { SegmentedValue } from '@rc-component/segmented';
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { classNames } from './native/classNames';
import tabStyles from './openidea/Tabs.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type SegmentedProps<ValueType = SegmentedValue> = AntSegmentedProps<ValueType>;

type Option<ValueType> = { label: ReactNode; value: ValueType; disabled?: boolean };

function asOptions<ValueType>(options: SegmentedProps<ValueType>['options']): Option<ValueType>[] {
  return (options ?? []).map((option) => {
    if (option !== null && typeof option === 'object' && 'value' in option) {
      return option as Option<ValueType>;
    }
    const text = String(option);
    return { label: text, value: text as ValueType };
  });
}

/** Generic preserved so callers keep their literal union (`<Segmented<'a' | 'b'>>`). */
export function Segmented<ValueType = SegmentedValue>({ style, options, value, defaultValue, onChange, className, 'aria-label': ariaLabel, disabled, ...rest }: SegmentedProps<ValueType>) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const items = asOptions<ValueType>(options);
  const selected = value ?? defaultValue;
  const tabListRef = useRef<HTMLDivElement>(null);

  const tokenStyle = {
    '--ui-segmented-height': `${controlHeight}px`,
    '--ui-segmented-font-size': `${fontSize}px`,
    '--ui-segmented-radius': `${borderRadius}px`,
  } as CSSProperties;

  function move(delta: number) {
    const tabs = [...(tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
    if (tabs.length === 0) return;
    const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    const next = tabs[(current + delta + tabs.length) % tabs.length];
    next?.focus();
    const index = tabs.indexOf(next!);
    const option = items[index];
    if (option && option.disabled !== true) onChange?.(option.value);
  }

  return (
    <div className={tabStyles.strip} style={{ ...tokenStyle, ...style }} data-oi-control="segmented" {...(rest as object)}>
      <div ref={tabListRef} role="tablist" aria-label={ariaLabel} className={classNames(tabStyles.scroller, className)}>
        {items.map((option) => {
          const active = option.value === selected;
          return (
            <div key={String(option.value)} className={classNames(tabStyles.tab, active && tabStyles.selected)} data-oi-control="tab" data-state={active ? 'selected' : 'default'}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                disabled={disabled === true || option.disabled === true}
                className={tabStyles.tabButton}
                onClick={() => onChange?.(option.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
                  else if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
                }}
              >
                <span className={tabStyles.tabLabel}>{option.label}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
