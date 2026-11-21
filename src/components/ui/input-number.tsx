import type { InputNumberProps as AntInputNumberProps } from 'antd/es/input-number';
import type { ValueType } from '@rc-component/input-number';
import { useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { classNames } from './native/classNames';
import buttonStyles from './openidea/Button.module.css';
import inputStyles from './openidea/Input.module.css';
import { getSharedControlTokens, withoutUndefined, type ControlSize } from './tokens.contract';
import { controlStyle, controlWidthStyle, type InputWidth } from './input';

export interface InputNumberProps<
  T extends ValueType = ValueType,
> extends AntInputNumberProps<T> {
  width?: InputWidth;
  size?: ControlSize;
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ transform: up ? 'rotate(180deg)' : undefined }}>
      <path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function toNumber(value: ValueType | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatValue(value: number, precision: number | undefined): string {
  return Number.isFinite(value) ? value.toFixed(precision ?? 0) : '';
}

/** Native numeric field: min/max/precision are enforced on blur, payload stays number|null. */
export function InputNumber<T extends ValueType = ValueType>({
  width = 'full',
  status,
  style,
  className,
  min,
  max,
  step = 1,
  precision,
  formatter,
  parser,
  addonBefore,
  addonAfter,
  prefix,
  suffix,
  value,
  defaultValue,
  onChange,
  onPressEnter,
  controls = true,
  disabled,
  readOnly,
  'aria-invalid': ariaInvalid,
  ...rest
}: InputNumberProps<T>) {
  void getSharedControlTokens();
  const invalid = status === 'error' || ariaInvalid === true;
  const initial = value ?? defaultValue;
  const [draft, setDraft] = useState<string | null>(null);
  const numeric = toNumber(initial as ValueType | undefined);
  const display = draft ?? (formatter ? formatter(initial as T | undefined, { userTyping: false, input: '' }) : formatValue(numeric, precision));
  const stepAmount = toNumber(step as ValueType) || 1;

  const clamp = (candidate: number): number => {
    const lower = min === undefined ? -Infinity : toNumber(min as ValueType);
    const upper = max === undefined ? Infinity : toNumber(max as ValueType);
    const bounded = Math.min(Math.max(candidate, lower), upper);
    return precision === undefined ? bounded : Number(bounded.toFixed(precision));
  };

  const commit = (raw: string) => {
    const parsedValue = parser ? parser(raw) : raw.trim() === '' ? null : Number(raw);
    setDraft(null);
    if (parsedValue === null || (typeof parsedValue !== 'object' && !Number.isFinite(Number(parsedValue)))) {
      onChange?.(null as T | null);
      return;
    }
    const bounded = clamp(toNumber(parsedValue as ValueType));
    onChange?.((typeof parsedValue === 'number' ? bounded : String(bounded)) as T);
  };

  const stepBy = (delta: number) => {
    const next = clamp((Number.isFinite(numeric) ? numeric : 0) + delta);
    setDraft(null);
    onChange?.((typeof next === 'number' ? next : String(next)) as T);
  };

  const affordance: ReactNode = prefix || suffix || addonBefore || addonAfter ? (
    <>
      {addonBefore ? <span className={inputStyles.leading}>{addonBefore}</span> : null}
      {prefix ? <span className={inputStyles.leading}>{prefix}</span> : null}
      <input
        {...withoutUndefined(rest)}
        type="text"
        inputMode="decimal"
        value={display}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={rest['aria-label']}
        aria-invalid={invalid || undefined}
        data-oi-control="input-number"
        data-state={invalid ? 'invalid' : 'framed'}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          setDraft(parser ? event.target.value : event.target.value);
        }}
        onBlur={() => { if (draft !== null) commit(draft); }}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'ArrowUp') { event.preventDefault(); stepBy(stepAmount); }
          else if (event.key === 'ArrowDown') { event.preventDefault(); stepBy(-stepAmount); }
          else if (event.key === 'Enter') { commit(draft ?? display); onPressEnter?.(event); }
        }}
      />
      {suffix ? <span className={inputStyles.leading}>{suffix}</span> : null}
      {addonAfter ? <span className={inputStyles.leading}>{addonAfter}</span> : null}
    </>
  ) : null;

  const input = (
    <input
      {...withoutUndefined(rest)}
      type="text"
      inputMode="decimal"
      value={display}
      disabled={disabled}
      readOnly={readOnly}
      aria-label={rest['aria-label']}
      aria-invalid={invalid || undefined}
      className={classNames(inputStyles.input, inputStyles.framed, invalid && inputStyles.invalid, className)}
      data-oi-control="input-number"
      data-state={invalid ? 'invalid' : 'framed'}
      style={{ ...controlStyle(), ...controlWidthStyle(width), ...style }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => { if (draft !== null) commit(draft); }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') { event.preventDefault(); stepBy(stepAmount); }
        else if (event.key === 'ArrowDown') { event.preventDefault(); stepBy(-stepAmount); }
        else if (event.key === 'Enter') { commit(draft ?? display); onPressEnter?.(event); }
      }}
    />
  );

  return (
    <span className={classNames(inputStyles.searchField, inputStyles.framed, invalid && inputStyles.invalid, className)} style={{ ...controlStyle(), ...controlWidthStyle(width), ...style }} data-oi-control="input-number" data-state={invalid ? 'invalid' : 'framed'}>
      {affordance ?? input}
      {controls ? (
        <span className={buttonStyles.button}>
          <button type="button" aria-label="Tăng" className={classNames(buttonStyles.iconButton, buttonStyles['is-small'])} disabled={disabled} onClick={() => stepBy(stepAmount)}><Chevron up /></button>
          <button type="button" aria-label="Giảm" className={classNames(buttonStyles.iconButton, buttonStyles['is-small'])} disabled={disabled} onClick={() => stepBy(-stepAmount)}><Chevron up={false} /></button>
        </span>
      ) : null}
    </span>
  );
}
