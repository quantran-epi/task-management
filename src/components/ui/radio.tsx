import { type RadioProps as AntRadioProps, type RadioGroupProps as AntRadioGroupProps } from 'antd';
import type { RadioButtonProps as AntRadioButtonProps } from 'antd/es/radio/radioButton';
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { classNames } from './native/classNames';
import radioStyles from './openidea/Checkbox.module.css';
import { getSharedControlTokens, type ControlSize } from './tokens.contract';

type AriaProps = { 'aria-label'?: string };

export type RadioProps = AntRadioProps & AriaProps;
export type RadioGroupProps = AntRadioGroupProps & AriaProps;
export type RadioButtonProps = AntRadioButtonProps & AriaProps;

interface RadioGroupContextValue {
  name: string;
  value: unknown;
  defaultValue: unknown;
  disabled: boolean;
  onChange: (event: { target: { value: unknown; checked: boolean } }) => void;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

function radioStyle(): CSSProperties {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  return {
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-radius': `${borderRadius}px`,
  } as CSSProperties;
}

/** Single swap point for AntD Radio. */
export function Radio({ style, className, children, checked, defaultChecked, disabled, value, name, id, 'aria-label': ariaLabel, onChange, ...rest }: RadioProps) {
  const group = useContext(RadioGroupContext);
  const isChecked = checked ?? defaultChecked ?? (group !== null && value !== undefined && (group.value ?? group.defaultValue) === value);
  return (
    <label
      className={classNames(radioStyles.row, (disabled === true || group?.disabled === true) && radioStyles.disabled, className)}
      style={{ ...radioStyle(), ...style }}
      data-oi-control="radio"
      data-state={isChecked ? 'checked' : 'unchecked'}
    >
      <span className={radioStyles.boxWrap}>
        <input
          {...rest}
          id={id}
          type="radio"
          className={radioStyles.native}
          name={name ?? group?.name}
          value={value as string | number | undefined}
          checked={isChecked}
          disabled={disabled === true || group?.disabled === true}
          aria-label={ariaLabel}
          onChange={(event) => {
            onChange?.({ ...event, target: { ...event.target, checked: true } } as never);
            group?.onChange?.({ target: { value, checked: true } });
          }}
        />
        <span className={classNames(radioStyles.box, radioStyles.radio, isChecked && radioStyles.on)} aria-hidden="true" />
      </span>
      {children !== undefined && <span className={radioStyles.label}>{children as ReactNode}</span>}
    </label>
  );
}

/** Consumed Radio.Group static mirrored with the same token policy. */
export function RadioGroup({ controlSize = 'middle', style, className, children, value, defaultValue, onChange, disabled, name, ...rest }: RadioGroupProps & { controlSize?: ControlSize }) {
  return (
    <RadioGroupContext.Provider
      value={{
        name: name ?? 'taskmate-radio-group',
        value,
        defaultValue,
        disabled: disabled === true,
        onChange: (event) => onChange?.(event as never),
      }}
    >
      <div
        role="radiogroup"
        className={className}
        style={{ ...radioStyle(), ...style } as CSSProperties}
        data-oi-control="radio-group"
        {...(rest as object)}
      >
        {children as ReactNode}
      </div>
    </RadioGroupContext.Provider>
  );
}

/** Consumed Radio.Button static mirrored with the same token policy. */
export function RadioButton({ style, className, children, ...rest }: RadioButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={rest.checked === true}
      className={className}
      style={{ ...radioStyle(), ...style } as CSSProperties}
      data-oi-control="radio-button"
      {...(rest as object)}
    >
      {children as ReactNode}
    </button>
  );
}
