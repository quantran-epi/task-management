import type { DatePickerProps as AntDatePickerProps } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { classNames } from './native/classNames';
import { Popup } from './native/popup';
import inputStyles from './openidea/Input.module.css';
import selectStyles from './openidea/Select.module.css';
import calendarStyles from './openidea/Calendar.module.css';
import { getSharedControlTokens } from './tokens.contract';

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
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
const CALENDAR_WIDTH = 252;
const YEAR_SPAN = 21;

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

interface CalendarProps {
  month: Dayjs;
  value: DateValue;
  /** Inclusive range bounds — used only by the range picker for in-range tint. */
  range?: [DateValue, DateValue];
  disabledDate: AntDatePickerProps['disabledDate'];
  onMonth: (month: Dayjs) => void;
  onPick: (date: Dayjs) => void;
  onClear?: (() => void) | undefined;
}

/** N-08 real calendar: month/year header, 7-column grid, today marker, footer. */
function Calendar({ month, value, range, disabledDate, onMonth, onPick, onClear }: CalendarProps) {
  const offset = month.startOf('month').day();
  const daysInMonth = month.daysInMonth();
  const cells = useMemo(() => Array.from(
    { length: Math.ceil((offset + daysInMonth) / 7) * 7 },
    (_, index) => month.startOf('month').add(index - offset, 'day'),
  ), [month, offset, daysInMonth]);
  const today = dayjs();
  // Compute from the current render, not module load, so a long-lived app
  // crossing New Year's Eve shows the new year range.
  const YEARS = useMemo(
    () => Array.from({ length: YEAR_SPAN }, (_, index) => today.year() - 10 + index),
    [today.year()],
  );
  const [lead, setLead] = useState<Dayjs>(value ?? month.startOf('month'));
  useEffect(() => { setLead(value ?? month.startOf('month')); }, [value, month]);
  const inRange = (date: Dayjs) => Boolean(
    range?.[0] && range?.[1] && date.isAfter(range[0], 'day') && date.isBefore(range[1], 'day'),
  );

  function onCellKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, date: Dayjs) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in moves) {
      event.preventDefault();
      const next = date.add(moves[event.key]!, 'day');
      setLead(next);
      const crossesMonth = next.month() !== month.month() || next.year() !== month.year();
      if (crossesMonth) onMonth(next.startOf('month'));
      // Same grid: focus synchronously. Crossing a month: React must remount
      // cells first, so defer focus to the next frame.
      const focusNext = () => document.querySelector<HTMLButtonElement>(
        `[data-oi-control="calendar-cell"][data-date="${next.format('YYYY-MM-DD')}"]`,
      )?.focus();
      if (crossesMonth) requestAnimationFrame(focusNext);
      else focusNext();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isDisabled(date, disabledDate)) onPick(date);
    }
  }

  return (
    <div className={calendarStyles.calendar} data-oi-control="calendar" role="group" aria-label="Lịch">
      <div className={calendarStyles.header}>
        <button
          type="button"
          className={calendarStyles.nav}
          aria-label="Tháng trước"
          data-oi-control="calendar-prev"
          onClick={() => onMonth(month.subtract(1, 'month'))}
        >
          ‹
        </button>
        <div className={calendarStyles.title}>
          <select
            className={calendarStyles.monthSelect}
            aria-label="Tháng"
            data-oi-control="calendar-month"
            value={month.month()}
            onChange={(event) => onMonth(month.month(Number(event.target.value)))}
          >
            {MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}
          </select>
          <select
            className={calendarStyles.yearSelect}
            aria-label="Năm"
            data-oi-control="calendar-year"
            value={month.year()}
            onChange={(event) => onMonth(month.year(Number(event.target.value)))}
          >
            {(YEARS.includes(month.year()) ? YEARS : [month.year(), ...YEARS]).map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={calendarStyles.nav}
          aria-label="Tháng sau"
          data-oi-control="calendar-next"
          onClick={() => onMonth(month.add(1, 'month'))}
        >
          ›
        </button>
      </div>
      <div className={calendarStyles.weekdays} aria-hidden="true">
        {WEEKDAYS.map((label) => <span key={label} className={calendarStyles.weekday} data-oi-control="calendar-weekday">{label}</span>)}
      </div>
      <div className={calendarStyles.grid} role="grid" aria-label="Ngày trong tháng" data-oi-control="date-grid">
        {cells.map((date) => {
          const disabled = isDisabled(date, disabledDate);
          const selected = value !== null && date.isSame(value, 'day');
          const outside = date.month() !== month.month();
          return (
            <button
              key={date.format('YYYY-MM-DD')}
              type="button"
              role="gridcell"
              className={classNames(
                calendarStyles.cell,
                date.isSame(today, 'day') && calendarStyles.today,
              )}
              data-oi-control="calendar-cell"
              data-testid="calendar-cell"
              data-date={date.format('YYYY-MM-DD')}
              data-lead={date.isSame(lead, 'day') || undefined}
              data-selected={selected || undefined}
              data-disabled={disabled || undefined}
              data-outside={outside || undefined}
              data-in-range={inRange(date) || undefined}
              aria-selected={selected}
              aria-disabled={disabled || undefined}
              aria-label={date.format('YYYY-MM-DD')}
              tabIndex={date.isSame(lead, 'day') ? 0 : -1}
              disabled={disabled}
              onClick={() => onPick(date)}
              onKeyDown={(event) => onCellKeyDown(event, date)}
            >
              {date.date()}
            </button>
          );
        })}
      </div>
      <div className={calendarStyles.footer}>
        <button
          type="button"
          className={calendarStyles.textButton}
          data-oi-control="calendar-today"
          disabled={isDisabled(today, disabledDate)}
          onClick={() => { onMonth(today); onPick(today); }}
        >
          Hôm nay
        </button>
        {onClear ? (
          <button type="button" className={calendarStyles.textButton} data-oi-control="calendar-clear" onClick={onClear}>
            Xóa
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Native single day field with a real calendar in a BODY-portal; `onChange` keeps the Dayjs tuple-safe signature. */
export function DatePicker({ width = 'full', style, onChange, value, ...rest }: DateFieldProps) {
  const anchorRef = useRef<HTMLInputElement>(null);
  const current = value ?? null;
  const format = rest.format as string | ((date: Dayjs) => string) | undefined ?? 'YYYY-MM-DD';
  const [text, setText] = useState(formatValue(current, format));
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(current ?? dayjs());

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

  const allowClear = rest.allowClear !== false;
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
        width={CALENDAR_WIDTH}
      >
        <Calendar
          month={month}
          value={current}
          disabledDate={rest.disabledDate}
          onMonth={setMonth}
          onPick={commit}
          onClear={allowClear ? () => commit(null) : undefined}
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
  // Controlled callers often gate on both ends and ignore a half-built range.
  // Keep a local draft so the second pick still forms the pair instead of
  // reading the untouched prop and emitting [null, second].
  const [draft, setDraft] = useState<[DateValue, DateValue]>(pair);
  const [texts, setTexts] = useState<[string, string]>([formatValue(draft[0], format), formatValue(draft[1], format)]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<0 | 1>(0);
  const [month, setMonth] = useState(pair[0] ?? pair[1] ?? dayjs());
  const anchorRef = active === 0 ? startRef : endRef;

  useEffect(() => {
    setDraft(pair);
    setTexts([formatValue(pair[0], format), formatValue(pair[1], format)]);
    // External value change (reset/preset) must move the visible calendar
    // month too, else input text and opened calendar disagree (WR-01).
    if (pair[0] || pair[1]) setMonth(pair[0] ?? pair[1]!);
  }, [pair[0], pair[1], format]);

  function commit(next: Dayjs) {
    const updated: [DateValue, DateValue] = active === 0 ? [next, draft[1]] : [draft[0], next];
    setDraft(updated);
    setTexts([formatValue(updated[0], format), formatValue(updated[1], format)]);
    setOpen(false);
    anchorRef.current?.focus();
    onChange?.(
      updated as [Dayjs | null, Dayjs | null],
      [updated[0]?.format(format) ?? '', updated[1]?.format(format) ?? ''],
    );
    if (active === 0) setActive(1);
  }

  function clear() {
    setDraft([null, null]);
    setTexts(['', '']);
    setOpen(false);
    anchorRef.current?.focus();
    onChange?.(null, ['', '']);
    setActive(0);
  }

  const passed = pickerStyle(width, style);
  const allowClear = rest.allowClear !== false;
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
        width={CALENDAR_WIDTH}
      >
        <Calendar
          month={month}
          value={draft[active]}
          range={draft}
          disabledDate={rest.disabledDate}
          onMonth={setMonth}
          onPick={commit}
          onClear={allowClear ? clear : undefined}
        />
      </Popup>
    </>
  );
}
