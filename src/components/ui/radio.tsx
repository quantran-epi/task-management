import { type RadioProps as AntRadioProps, type RadioGroupProps as AntRadioGroupProps } from 'antd';
import type { RadioButtonProps as AntRadioButtonProps } from 'antd/es/radio/radioButton';
import {
  createContext,
  useContext,
  useId,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { classNames } from './native/classNames';
import radioStyles from './openidea/Checkbox.module.css';
import { getSharedControlTokens, type ControlSize } from './tokens.contract';

type AriaProps = { 'aria-label'?: string };

export type RadioProps = AntRadioProps & AriaProps;
export type RadioGroupProps = AntRadioGroupProps & AriaProps;
export type RadioButtonProps = AntRadioButtonProps & AriaProps;

type GroupValue = string | number | boolean;

interface RadioGroupContextValue {
  name: string;
  value: unknown;
  checkedValue: unknown;
  disabled: boolean;
  // Mirror the native change event so group onChange keeps AntD's event shape.
  onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
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

function keyOf(value: unknown): string {
  return typeof value === 'object' && value !== null
    ? JSON.stringify(value)
    : String(value);
}

/** Single swap point for AntD Radio. */
export function Radio({ style, className, children, checked, defaultChecked, disabled, value, name, id, 'aria-label': ariaLabel, onChange, ...rest }: RadioProps) {
  const group = useContext(RadioGroupContext);
  const ownChecked = useState(defaultChecked === true)[0];
  const groupChecked = group !== null && value !== undefined && keyOf(group.checkedValue) === keyOf(value);
  const isChecked = checked ?? (group !== null ? groupChecked : ownChecked);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    // AntD callers read e.target.value; Form.Item writes the same value back.
    // Radio's change event target already exposes the DOM value, so forward the
    // native event unchanged and let the group mirror it with the same payload.
    onChange?.(event as never);
    if (group !== null && value !== undefined) group.onSelect(event);
  }

  const input = (
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
      onChange={handleChange}
    />
  );

  return (
    <label
      className={classNames(radioStyles.row, (disabled === true || group?.disabled === true) && radioStyles.disabled, className)}
      style={{ ...radioStyle(), ...style }}
      data-oi-control="radio"
      data-state={isChecked ? 'checked' : 'unchecked'}
    >
      <span className={radioStyles.boxWrap}>
        {input}
        <span className={classNames(radioStyles.box, radioStyles.radio, isChecked && radioStyles.on)} aria-hidden="true" />
      </span>
      {children !== undefined && <span className={radioStyles.label}>{children as ReactNode}</span>}
    </label>
  );
}

/** Consumed Radio.Group static mirrored with the same token policy. */
export function RadioGroup({ controlSize = 'middle', style, className, children, value, defaultValue, onChange, disabled, name, options, ...rest }: RadioGroupProps & { controlSize?: ControlSize }) {
  void controlSize;
  const generatedName = useId();
  const [innerValue, setInnerValue] = useState<unknown>(defaultValue);
  void value; // controlled value is forwarded through context; selection follows caller state
  const checkedValue = value !== undefined ? value : innerValue;

  function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.value as GroupValue;
    if (value === undefined) setInnerValue(selected);
    // Keep the native event instance (methods + nativeEvent) and normalize only
    // the target to AntD's RadioChangeEventTarget: checked/name/value.
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: { value: selected, checked: true, name: name ?? generatedName },
    });
    onChange?.(event as never);
  }

  return (
    <RadioGroupContext.Provider
      value={{
        name: name ?? generatedName,
        value,
        checkedValue,
        disabled: disabled === true,
        onSelect: handleSelect,
      }}
    >
      <div
        role="radiogroup"
        className={className}
        style={{ ...radioStyle(), ...style } as CSSProperties}
        data-oi-control="radio-group"
        {...(rest as object)}
      >
        {options
          ? (options as Array<GroupValue | { value?: GroupValue; label?: ReactNode; disabled?: boolean }>).map((option, index) => {
              const normalized = typeof option === 'object' && option !== null
                ? option as { value?: GroupValue; label?: ReactNode; disabled?: boolean }
                : { value: option as GroupValue, label: option as ReactNode };
              return (
                <Radio
                  key={`${keyOf(normalized.value)}-${index}`}
                  value={normalized.value}
                  checked={keyOf(checkedValue) === keyOf(normalized.value)}
                  {...(normalized.disabled !== undefined ? { disabled: normalized.disabled } : {})}
                >
                  {normalized.label}
                </Radio>
              );
            })
          : children as ReactNode}
      </div>
    </RadioGroupContext.Provider>
  );
}

/** Consumed Radio.Button static mirrored with the same token policy. */
export function RadioButton({ style, className, children, value, disabled, checked, defaultChecked, onChange, ...rest }: RadioButtonProps) {
  const group = useContext(RadioGroupContext);
  const ownChecked = useState(defaultChecked === true)[0];
  const isChecked = checked ?? (group !== null && value !== undefined && keyOf(group.checkedValue) === keyOf(value)) ?? ownChecked;
  const inputName = group?.name;

  return (
    <label
      {...(rest as object)}
      className={classNames(radioStyles.row, (disabled === true || group?.disabled === true) && radioStyles.disabled, className)}
      style={{ ...radioStyle(), ...style } as CSSProperties}
      data-oi-control="radio-button"
      data-state={isChecked ? 'checked' : 'unchecked'}
    >
      <span className={radioStyles.boxWrap}>
        <input
          type="radio"
          className={radioStyles.native}
          name={inputName}
          value={value as string | number | undefined}
          checked={isChecked}
          disabled={disabled === true || group?.disabled === true}
          aria-label={rest['aria-label']}
          onChange={(event) => {
            onChange?.(event as never);
            if (group !== null && value !== undefined) group.onSelect(event);
          }}
        />
      </span>
      <span className={radioStyles.label}>{children as ReactNode}</span>
    </label>
  );
}
