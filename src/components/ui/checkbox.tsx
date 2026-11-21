import type { CheckboxProps as AntCheckboxProps } from 'antd';
import type { CheckboxGroupProps as AntCheckboxGroupProps } from 'antd/es/checkbox/Group';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { classNames } from './native/classNames';
import checkStyles from './openidea/Checkbox.module.css';
import { getSharedControlTokens, withoutUndefined, type ControlSize } from './tokens.contract';

export type CheckboxProps = AntCheckboxProps & {
  'aria-label'?: string;
  readOnly?: boolean;
  /** Accepted by AntD Checkbox.Group options; kept so grouped callers compile. */
  label?: ReactNode;
};

export type CheckboxGroupProps = AntCheckboxGroupProps;

interface AriaProps {
  'aria-label'?: string;
}

/** Minimal inline check from OpenIDEA expui/actions/checked.svg (Apache-2.0). */
function CheckIcon({ indeterminate = false }: { indeterminate?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {indeterminate
        ? <path d="M3.5 8H12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        : <path d="M2.5 8.25L6 11.75L13.5 4.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/** Consumed AntD Checkbox statics mirrored as named exports. */
export function CheckboxGroup({ options, value, defaultValue, onChange, style, className, children, ...rest }: CheckboxGroupProps) {
  const [innerValues, setInnerValues] = useState<unknown[]>(defaultValue ?? []);
  const selectedValues = value ?? innerValues;
  const selected = new Set<unknown>(Array.isArray(selectedValues) ? selectedValues : []);

  function toggle(optionValue: unknown, checked: boolean) {
    const next = Array.isArray(selectedValues) ? (selectedValues as unknown[]).slice() : [];
    const index = next.findIndex((item) => item === optionValue);
    if (checked && index < 0) next.push(optionValue);
    if (!checked && index >= 0) next.splice(index, 1);
    if (value === undefined) setInnerValues(next);
    (onChange as ((values: unknown[]) => void) | undefined)?.(next);
  }

  return (
    <div
      role="group"
      className={className}
      style={style}
      data-oi-control="checkbox-group"
      {...(rest as object)}
    >
      {options
        ? options.map((opt) => {
          const option = typeof opt === 'string' || typeof opt === 'number' ? { value: opt, label: String(opt) } : opt;
          return (
            <Checkbox
              key={String(option.value)}
              value={option.value}
              label={option.label}
              checked={selected.has(option.value)}
              {...('disabled' in option && option.disabled !== undefined ? { disabled: option.disabled } : {})}
              onChange={(event) => toggle(option.value, event.target.checked)}
            />
          );
        })
        : children}
    </div>
  );
}

/** Single swap point for AntD Checkbox; shared control size is the policy prop. */
export function Checkbox({
  controlSize = 'middle',
  style,
  className,
  children,
  label,
  indeterminate,
  checked,
  defaultChecked,
  disabled,
  readOnly,
  name,
  value,
  id,
  onChange,
  ...rest
}: CheckboxProps & { controlSize?: ControlSize }) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const isChecked = checked ?? defaultChecked ?? false;
  const mixed = indeterminate === true;
  const ariaLabel = (rest as AriaProps)['aria-label'];
  const mergedStyle = withoutUndefined({
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-radius': `${borderRadius}px`,
    '--ui-control-size': controlSize,
    ...(style ?? {}),
  }) as CSSProperties;

  return (
    <label
      className={classNames(checkStyles.row, disabled === true && checkStyles.disabled, className)}
      style={mergedStyle}
      data-oi-control="checkbox"
      data-state={mixed ? 'mixed' : isChecked ? 'checked' : 'unchecked'}
    >
      <span className={checkStyles.boxWrap}>
        <input
          {...(rest as object)}
          id={id}
          type="checkbox"
          className={checkStyles.native}
          checked={isChecked || mixed}
          disabled={disabled === true || readOnly === true}
          readOnly={readOnly === true}
          name={mixed && name === undefined ? '_indeterminate' : name}
          value={typeof value === 'string' || typeof value === 'number' ? value : undefined}
          aria-label={ariaLabel}
          aria-checked={mixed ? 'mixed' : undefined}
          onChange={(event) => {
            // Forward the native event so stopPropagation/preventDefault survive;
            // its target already exposes checked/value/name in AntD's shape.
            onChange?.(event as never);
          }}
        />
        <span className={classNames(checkStyles.box, isChecked && checkStyles.on)} aria-hidden="true">
          {(isChecked || mixed) && <CheckIcon indeterminate={mixed} />}
        </span>
      </span>
      {(children ?? label) !== undefined && <span className={checkStyles.label}>{(children ?? label) as ReactNode}</span>}
    </label>
  );
}
