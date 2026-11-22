import type { TimePickerProps as AntTimePickerProps, TimeRangePickerProps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { classNames } from './native/classNames';
import { Popup } from './native/popup';
import inputStyles from './openidea/Input.module.css';
import listStyles from './openidea/List.module.css';
import selectStyles from './openidea/Select.module.css';
import calendarStyles from './openidea/Calendar.module.css';
import { getSharedControlTokens } from './tokens.contract';

dayjs.extend(customParseFormat);

export type { TimePickerProps, TimeRangePickerProps } from 'antd';

export interface TimeFieldProps extends AntTimePickerProps {
  width?: 'full' | 'auto';
}

/** Shared metric/style policy; caller style still wins. */
function pickerStyle(width: 'full' | 'auto', caller?: CSSProperties): CSSProperties {
  const { fontSize, controlHeight, borderRadius, paddingInline } = getSharedControlTokens();
  return {
    width: width === 'full' ? '100%' : undefined,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-radius': `${borderRadius}px`,
    '--ui-control-padding-inline': `${paddingInline}px`,
    ...caller,
  } as CSSProperties;
}

function ranges(format: string): { hours: number[]; minutes: number[]; seconds: number[] } {
  const useSeconds = format.includes('s');
  return {
    hours: Array.from({ length: 24 }, (_, index) => index),
    minutes: Array.from({ length: 60 }, (_, index) => index),
    seconds: useSeconds ? Array.from({ length: 60 }, (_, index) => index) : [],
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function display(value: Dayjs | null | undefined, format: string): string {
  return value && value.isValid() ? value.format(format) : '';
}

interface TimeColumnProps {
  id: string;
  values: number[];
  value: number;
  lead: number;
  onLead: (index: number) => void;
  onPick: (value: number) => void;
  label: string;
}

function TimeColumn({ id, values, value, lead, onLead, onPick, label }: TimeColumnProps) {
  const activeIndex = Math.max(0, values.indexOf(value) >= 0 ? values.indexOf(value) : lead);
  const columnRef = useRef<HTMLDivElement>(null);

  function onColumnKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (delta !== 0) {
      event.preventDefault();
      event.stopPropagation();
      const next = Math.max(0, Math.min(values.length - 1, lead + delta));
      onLead(next);
      const row = columnRef.current?.querySelector<HTMLElement>(`#${id}-${next}`);
      row?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      onPick(values[lead] ?? value);
    }
  }

  return (
    <div className={calendarStyles.timeColumnWrap}>
      <div className={calendarStyles.timeColumnLabel}>{label}</div>
      <div
        ref={columnRef}
        className={classNames(selectStyles.list, calendarStyles.timeColumn)}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`${id}-${activeIndex}`}
        tabIndex={0}
        style={{ width: 72, height: 240 }}
        onKeyDown={onColumnKeyDown}
      >
        <div className={listStyles.sizer} style={{ height: values.length * 24 }}>
        {values.map((item, index) => (
          <div
            key={item}
            id={`${id}-${index}`}
            role="option"
            aria-selected={item === value}
            data-lead={index === lead || undefined}
            data-oi-control="list-row"
            className={classNames(listStyles.row, (item === value || index === lead) && listStyles.active)}
            style={{ transform: `translateY(${index * 24}px)`, height: 24 }}
            onPointerMove={() => onLead(index)}
            onClick={() => onPick(item)}
          >
            <span className={selectStyles.optionLabel}>{pad(item)}</span>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

interface TimeFieldState {
  value: Dayjs | null;
  draft: string;
  open: boolean;
  lead: [number, number, number];
}

function useTimeField(value: Dayjs | null | undefined, defaultValue: Dayjs | null | undefined, format: string) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState<Dayjs | null>(defaultValue ?? null);
  const current = controlled ? value ?? null : internal;
  const [state, setState] = useState<TimeFieldState>({ value: current, draft: display(current, format), open: false, lead: [0, 0, 0] });

  useEffect(() => {
    setState((prev) => ({ ...prev, value: current, draft: display(current, format) }));
  }, [current, format]);

  function commit(next: Dayjs | null, onChange?: (value: Dayjs | null) => void) {
    if (!controlled) setInternal(next);
    setState((prev) => ({ ...prev, value: next, draft: display(next, format) }));
    onChange?.(next);
  }

  return { state, setState, current, commit, controlled };
}

function fieldProps(width: 'full' | 'auto', style: CSSProperties | undefined, className: string | undefined, placeholder: string | undefined, disabled: boolean | undefined, invalid: boolean | undefined, ariaLabel: string | undefined) {
  return {
    className: classNames(inputStyles.input, inputStyles.framed, invalid && inputStyles.invalid, className),
    style: pickerStyle(width, style),
    placeholder,
    disabled,
    'aria-label': ariaLabel,
    'aria-invalid': invalid || undefined,
    'data-oi-control': 'time-picker',
    'data-state': invalid ? 'invalid' : 'framed',
  };
}

/** Native single time field with a BODY-portal hour/minute/second grid. */
export function TimePicker({ width = 'full', style, className, value, defaultValue, format: formatProp = 'HH:mm:ss', placeholder, disabled, allowClear, onChange, onBlur, status, 'aria-invalid': ariaInvalid, 'aria-label': ariaLabel }: TimeFieldProps) {
  const format = formatProp as string;
  const anchorRef = useRef<HTMLInputElement>(null);
  // useId may contain ':' which breaks the '#id-index' querySelector below.
  const idBase = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  // Focusing the anchor after a pick would re-trigger onFocus and reopen the
  // popup, so suppress that one restore-focus event.
  const suppressOpen = useRef(false);
  const { state, setState, current, commit } = useTimeField(value as Dayjs | undefined, defaultValue as Dayjs | undefined, format);
  const invalid = status === 'error' || ariaInvalid === true;
  const active = useMemo(() => ranges(format), [format]);
  const cols = state.value ?? (state.draft ? dayjs(state.draft, format) : dayjs('00:00:00', 'HH:mm:ss'));
  const hour = cols.hour();
  const minute = cols.minute();
  const second = cols.second();
  const leads = state.lead;

  function close() {
    suppressOpen.current = true;
    setState((prev) => ({ ...prev, open: false }));
    anchorRef.current?.focus();
    queueMicrotask(() => { suppressOpen.current = false; });
  }

  function pick(h: number, m: number, s: number, part?: 0 | 1 | 2) {
    const next = dayjs().hour(h).minute(m).second(s).millisecond(0);
    commit(next, onChange as ((value: Dayjs | null) => void) | undefined);
    setState((prev) => ({ ...prev, open: true, lead: part === undefined ? prev.lead : prev.lead.map((v, i) => (i === part ? [h, m, s][i] : v)) as [number, number, number] }));
  }

  const passed = fieldProps(width, style, className, placeholder, disabled, invalid, ariaLabel);
  return (
    <>
      <input
        {...passed}
        ref={anchorRef}
        type="text"
        value={state.draft}
        readOnly={false}
        onChange={(event) => {
          const text = event.target.value;
          setState((prev) => ({ ...prev, draft: text }));
          const parsed = dayjs(text, format, true);
          if (parsed.isValid()) commit(parsed, onChange as ((value: Dayjs | null) => void) | undefined);
        }}
        onFocus={() => { if (!suppressOpen.current) setState((prev) => ({ ...prev, open: true })); }}
        onBlur={onBlur as unknown as (event: React.FocusEvent<HTMLInputElement>) => void}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setState((prev) => ({ ...prev, open: true })); }
          if (event.key === 'Enter' && state.open) { event.preventDefault(); pick(hour, minute, second); }
        }}
      />
      {allowClear && current && !disabled ? (
        <button type="button" aria-label="Xóa giờ" onClick={() => { commit(null, onChange as ((value: Dayjs | null) => void) | undefined); close(); }}>×</button>
      ) : null}
      <Popup open={state.open} anchorRef={anchorRef} onClose={close} className={selectStyles.popup ?? ''} control="time-picker-popup" label={ariaLabel ?? placeholder ?? 'Chọn giờ'} width={active.seconds.length > 0 ? 248 : 176}>
        <div className={selectStyles.popupInner} style={{ display: 'flex', flexDirection: 'row', gap: 4 }}>
          <TimeColumn id={`${idBase}-tp-h`} values={active.hours} value={hour} lead={leads[0]} label="Giờ" onLead={(index) => setState((prev) => ({ ...prev, lead: [index, prev.lead[1], prev.lead[2]] }))} onPick={(h) => pick(h, minute, second, 0)} />
          <TimeColumn id={`${idBase}-tp-m`} values={active.minutes} value={minute} lead={leads[1]} label="Phút" onLead={(index) => setState((prev) => ({ ...prev, lead: [prev.lead[0], index, prev.lead[2]] }))} onPick={(m) => pick(hour, m, second, 1)} />
          {active.seconds.length > 0 ? (
            <TimeColumn id={`${idBase}-tp-s`} values={active.seconds} value={second} lead={leads[2]} label="Giây" onLead={(index) => setState((prev) => ({ ...prev, lead: [prev.lead[0], prev.lead[1], index] }))} onPick={(s) => pick(hour, minute, s, 2)} />
          ) : null}
        </div>
      </Popup>
    </>
  );
}

/** Native range variant; onChange payload is [Dayjs|null, Dayjs|null]|null. */
export function TimeRangePicker({
  width = 'full', style, className, value, defaultValue, format: formatProp = 'HH:mm:ss', placeholder, disabled, allowClear, onChange, status, 'aria-invalid': ariaInvalid, 'aria-label': ariaLabel,
}: TimeRangePickerProps & { width?: 'full' | 'auto' }) {
  const format = formatProp as string;
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const idBase = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  // Same focus-restore guard as TimePicker: suppress the onFocus fired by the
  // programmatic focus after a pick so the popup stays closed.
  const suppressOpen = useRef(false);
  const range = value ?? defaultValue ?? [null, null];
  const [drafts, setDrafts] = useState<[string, string]>([
    display(range[0] as Dayjs | null, format),
    display(range[1] as Dayjs | null, format),
  ]);
  // Keep drafts aligned with an externally changed value (reset/preset), same
  // contract as DateRangePicker. A gated caller that ignores a half-range never
  // changes `value`, so its locally built first end survives in drafts (WR-03).
  useEffect(() => {
    setDrafts([
      display(range[0] as Dayjs | null, format),
      display(range[1] as Dayjs | null, format),
    ]);
  }, [range[0], range[1], format]);
  const [active, setActive] = useState<0 | 1>(0);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeLead, setRangeLead] = useState<[number, number, number]>([0, 0, 0]);
  const invalid = status === 'error' || ariaInvalid === true;
  const anchorRef = active === 0 ? startRef : endRef;
  const parsed = drafts[active] ? dayjs(drafts[active], format) : dayjs('00:00:00', 'HH:mm:ss');
  const grid = ranges(format);

  function commitIndex(index: 0 | 1, next: Dayjs | null) {
    // Build from parsed drafts, not raw props: a gated caller that ignores a
    // half-range still keeps the first pick in drafts (WR-03).
    const parsedDraft = (s: string) => (s ? dayjs(s, format, true) : null);
    const first = parsedDraft(drafts[0]);
    const second = parsedDraft(drafts[1]);
    const pair: [Dayjs | null, Dayjs | null] = index === 0
      ? [next, second?.isValid() ? second : null]
      : [first?.isValid() ? first : null, next];
    (onChange as ((value: [Dayjs | null, Dayjs | null] | null) => void) | undefined)?.(pair);
  }

  function pick(h: number, m: number, s: number) {
    const next = dayjs().hour(h).minute(m).second(s).millisecond(0);
    setDrafts((prev) => active === 0 ? [next.format(format), prev[1]] : [prev[0], next.format(format)]);
    commitIndex(active, next);
    setRangeOpen(true);
  }

  const rangeDisabled = Array.isArray(disabled) ? disabled[active] : disabled;
  const passed = fieldProps(width, style, className, placeholder?.[active], rangeDisabled, invalid, ariaLabel);
  return (
    <span className={calendarStyles.rangeInputs}>
      {([0, 1] as const).map((index) => (
        <input
          key={index}
          {...passed}
          ref={index === 0 ? startRef : endRef}
          value={drafts[index]}
          aria-label={`${ariaLabel ?? placeholder ?? 'Khoảng thời gian'} ${index === 0 ? 'bắt đầu' : 'kết thúc'}`}
          onFocus={() => { if (suppressOpen.current) return; setActive(index); setRangeOpen(true); }}
          onChange={(event) => {
            const text = event.target.value;
            setDrafts((prev) => index === 0 ? [text, prev[1]] : [prev[0], text]);
            const parsedText = dayjs(text, format, true);
            if (parsedText.isValid()) commitIndex(index, parsedText);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') event.preventDefault();
          }}
        />
      ))}
      {allowClear && (range[0] || range[1]) && !rangeDisabled ? (
        <button type="button" aria-label="Xóa khoảng thời gian" onClick={() => { setDrafts(['', '']); (onChange as ((value: [Dayjs | null, Dayjs | null] | null) => void) | undefined)?.(null); }}>×</button>
      ) : null}
      <Popup
        open={rangeOpen}
        anchorRef={anchorRef as React.RefObject<HTMLElement | null>}
        onClose={() => {
          // Escape/outside-click focuses the anchor; suppress that onFocus so a
          // focused TimeColumn cannot immediately reopen the range popup (WR-02 class).
          suppressOpen.current = true;
          setRangeOpen(false);
          anchorRef.current?.focus();
          queueMicrotask(() => { suppressOpen.current = false; });
        }}
        className={selectStyles.popup ?? ''}
        control="time-picker-range-popup"
        label={ariaLabel ?? 'Chọn khoảng thời gian'}
        width={grid.seconds.length > 0 ? 248 : 176}
      >
        <div className={selectStyles.popupInner} style={{ display: 'flex', flexDirection: 'row', gap: 4 }}>
          <TimeColumn id={`${idBase}-tr-h`} values={grid.hours} value={parsed.hour()} lead={rangeLead[0]} label="Giờ" onLead={(index) => setRangeLead((prev) => [index, prev[1], prev[2]])} onPick={(h) => pick(h, parsed.minute(), parsed.second())} />
          <TimeColumn id={`${idBase}-tr-m`} values={grid.minutes} value={parsed.minute()} lead={rangeLead[1]} label="Phút" onLead={(index) => setRangeLead((prev) => [prev[0], index, prev[2]])} onPick={(m) => pick(parsed.hour(), m, parsed.second())} />
          {grid.seconds.length > 0 ? <TimeColumn id={`${idBase}-tr-s`} values={grid.seconds} value={parsed.second()} lead={rangeLead[2]} label="Giây" onLead={(index) => setRangeLead((prev) => [prev[0], prev[1], index])} onPick={(s) => pick(parsed.hour(), parsed.minute(), s)} /> : null}
        </div>
      </Popup>
    </span>
  );
}
