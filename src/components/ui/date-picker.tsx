import type { DatePickerProps as AntDatePickerProps } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { classNames } from './native/classNames';
import { Popup } from './native/popup';
import inputStyles from './openidea/Input.module.css';
import listStyles from './openidea/List.module.css';
import selectStyles from './openidea/Select.module.css';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';

dayjs.extend(customParseFormat);

export type { DatePickerProps } from 'antd';
export type { RangePickerProps };

export interface DateFieldProps extends Omit<AntDatePickerProps, 'onChange' | 'value'> {
  /** Whole-component width policy: full container or intrinsic. */
  width?: 'full' | 'auto';
  /** View uses the single-date signature; the AntD union leaked it into callbacks (D-03). */
  onChange?: (date: Dayjs | null, dateString: string | string[]) => void;
  value?: Dayjs | null;
}

type DateValue = Dayjs | null;

function pickerStyle(width: 'full' | 'auto', caller?: CSSProperties): CSSProperties {
  const { fontSize, controlHeight, borderRadius } = getSharedControlTokens();
  return {
    width: width === 'full' ? '100%' : undefined,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-radius': `${borderRadius}px`,
    ...caller,
  } as CSSProperties;
}

function formatValue(value: DateValue, format: string | ((date: Dayjs) => string)): string {
  if (!value || !value.isValid()) return '';
  return typeof format === 'function' ? format(value) : value.format(format);
}

function isDisabled(date: Dayjs, disabledDate: AntDatePickerProps['disabledDate']): boolean {
  return disabledDate?.(date, { type: 'date' }) === true;
}

interface GridProps {
  month: Dayjs;
  value: DateValue;
  lead: number;
  disabledDate: AntDatePickerProps['disabledDate'];
  onMonth: (month: Dayjs) => void;
  onLead: (index: number) => void;
  onPick: (date: Dayjs) => void;
}

function DayGrid({ month, value, lead, disabledDate, onMonth, onLead, onPick }: GridProps) {
  const first = month.startOf('month');
  const offset = first.day();
  const daysInMonth = month.daysInMonth();
  const cells = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= daysInMonth ? first.date(day) : null;
  });

  return (
    <div className={selectStyles.popupInner} data-oi-control="date-grid">
      <div className={listStyles.sizer} style={{ height: cells.length * 24 }}>
        {cells.map((date, index) => {
          const disabled = !date || isDisabled(date, disabledDate);
          const selected = date !== null && value !== null && date.isSame(value, 'day');
          return (
            <div
              key={index}
              role="gridcell"
              aria-selected={selected}
              aria-disabled={disabled || undefined}
              data-lead={index === lead || undefined}
              data-oi-control="list-row"
              className={classNames(listStyles.row, (selected || index === lead) && listStyles.active)}
              style={{ transform: `translateY(${index * 24}px)`, height: 24, width: 'calc(100% - 12px)' }}
              onPointerMove={() => !disabled && onLead(index)}
              onClick={() => { if (date && !disabled) onPick(date); }}
            >
              <span className={selectStyles.optionLabel}>{date ? date.date() : ''}</span>
            </div>
          );
        })}
      </div>
      <div className={selectStyles.rowAction}>
        <button type="button" aria-label="Tháng trước" onClick={() => onMonth(month.subtract(1, 'month'))}>‹</button>
        <button type="button" aria-label="Tháng sau" onClick={() => onMonth(month.add(1, 'month'))}>›</button>
      </div>
    </div>
  );
}

/** Native single day field with a BODY-portal day grid; `onChange` keeps the Dayjs tuple-safe signature. */
export function DatePicker({ width = 'full', style, onChange, value, ...rest }: DateFieldProps) {
  const anchorRef = useRef<HTMLInputElement>(null);
  const current = value ?? null;
  const format = rest.format as string | ((date: Dayjs) => string) | undefined ?? 'YYYY-MM-DD';
  const [text, setText] = useState(formatValue(current, format));
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(current ?? dayjs());
  const [lead, setLead] = useState(0);

  useEffect(() => {
    setText(formatValue(current, format));
    if (current) setMonth(current);
  }, [current, format]);

  function commit(next: DateValue) {
    if (next !== null && isDisabled(next, rest.disabledDate)) return;
    setText(formatValue(next, format));
    setOpen(false);
    anchorRef.current?.focus();
    onChange?.(next, typeof format === 'function' ? (next ? format(next) : '') : (next ? next.format(format) : ''));
  }

  return (
    <>
      <input
        ref={anchorRef}
        type="text"
        readOnly
        role="textbox"
        aria-label={rest['aria-label'] as string | undefined}
        aria-invalid={rest['aria-invalid'] === true || rest.status === 'error' || undefined}
        placeholder={rest.placeholder as string | undefined}
        disabled={rest.disabled === true}
        className={classNames(inputStyles.input, inputStyles.framed)}
        style={pickerStyle(width, style)}
        data-oi-control="date-picker"
        data-state={open ? 'expanded' : 'framed'}
        value={text}
        onClick={() => { if (rest.disabled !== true) setOpen(!open); }}
        onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); }
          if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); anchorRef.current?.focus(); }
        }}
      />
      <Popup
        open={open && rest.disabled !== true}
        anchorRef={anchorRef}
        onClose={() => { setOpen(false); anchorRef.current?.focus(); }}
        className={selectStyles.popup ?? ''}
        control="select-popup"
        label={typeof rest['aria-label'] === 'string' ? rest['aria-label'] : 'Chọn ngày'}
      >
        <DayGrid
          month={month}
          value={current}
          lead={lead}
          disabledDate={rest.disabledDate}
          onMonth={setMonth}
          onLead={setLead}
          onPick={commit}
        />
      </Popup>
    </>
  );
}

/** Native range variant; onChange payload is [Dayjs|null, Dayjs|null]|null plus [string,string] (D-03). */
export function DateRangePicker({
  width = 'full',
  style,
  value,
  onChange,
  ...rest
}: Omit<RangePickerProps, 'onChange' | 'value'> & {
  width?: 'full' | 'auto';
  value?: [Dayjs | null, Dayjs | null] | null;
  onChange?: (dates: [Dayjs | null, Dayjs | null] | null, dateStrings: [string, string]) => void;
}) {
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const pair: [DateValue, DateValue] = value ?? [null, null];
  const format = rest.format as string | undefined ?? 'YYYY-MM-DD';
  const [texts, setTexts] = useState<[string, string]>([formatValue(pair[0], format), formatValue(pair[1], format)]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<0 | 1>(0);
  const [month, setMonth] = useState(pair[0] ?? pair[1] ?? dayjs());
  const [lead, setLead] = useState(0);
  const anchorRef = active === 0 ? startRef : endRef;

  useEffect(() => {
    setTexts([formatValue(pair[0], format), formatValue(pair[1], format)]);
  }, [pair[0], pair[1], format]);

  function commit(next: Dayjs) {
    const updated: [DateValue, DateValue] = active === 0 ? [next, pair[1]] : [pair[0], next];
    setTexts([formatValue(updated[0], format), formatValue(updated[1], format)]);
    setOpen(false);
    anchorRef.current?.focus();
    onChange?.(
      updated as [Dayjs | null, Dayjs | null],
      [updated[0]?.format(format) ?? '', updated[1]?.format(format) ?? ''],
    );
    if (active === 0) setActive(1);
  }

  const passed = pickerStyle(width, style);
  return (
    <>
      {([0, 1] as const).map((index) => (
        <input
          key={index}
          ref={index === 0 ? startRef : endRef}
          type="text"
          readOnly
          aria-label={`${rest['aria-label'] ?? 'Khoảng ngày'} ${index === 0 ? 'bắt đầu' : 'kết thúc'}`}
          placeholder={index === 0 ? (rest.placeholder as string | undefined) : undefined}
          disabled={rest.disabled === true}
          className={classNames(inputStyles.input, inputStyles.framed)}
          style={passed}
          data-oi-control="date-picker"
          data-state={index === active && open ? 'expanded' : 'framed'}
          value={texts[index]}
          onClick={() => { setActive(index); setOpen(true); }}
          onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); }
            if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); anchorRef.current?.focus(); }
          }}
        />
      ))}
      <Popup
        open={open && rest.disabled !== true}
        anchorRef={anchorRef}
        onClose={() => { setOpen(false); anchorRef.current?.focus(); }}
        className={selectStyles.popup ?? ''}
        control="select-popup"
        label="Chọn khoảng ngày"
      >
        <DayGrid
          month={month}
          value={pair[active]}
          lead={lead}
          disabledDate={rest.disabledDate}
          onMonth={setMonth}
          onLead={setLead}
          onPick={commit}
        />
      </Popup>
    </>
  );
}

void withoutUndefined;
