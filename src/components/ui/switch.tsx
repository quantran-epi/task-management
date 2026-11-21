import type { SwitchProps as AntSwitchProps } from 'antd';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { classNames } from './native/classNames';
import checkStyles from './openidea/Checkbox.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type SwitchProps = AntSwitchProps & { 'aria-label'?: string };

/** Single swap point for AntD Switch; height/radius from shared control tokens. */
export function Switch({
  style,
  className,
  checked,
  defaultChecked,
  disabled,
  loading,
  checkedChildren,
  unCheckedChildren,
  'aria-label': ariaLabel,
  onChange,
  ...rest
}: SwitchProps) {
  const { controlHeight, borderRadius, fontSize } = getSharedControlTokens();
  const [innerChecked, setInnerChecked] = useState(defaultChecked === true);
  const on = checked ?? innerChecked;
  const busy = loading === true;
  const children: ReactNode = on ? checkedChildren : unCheckedChildren;
  return (
    <button
      {...(rest as object)}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      aria-busy={busy ? 'true' : undefined}
      disabled={disabled === true || busy}
      className={classNames(checkStyles.switch, on && checkStyles.switchOn, className)}
      style={
        {
          '--ui-control-height': `${controlHeight}px`,
          '--ui-control-radius': `${borderRadius}px`,
          '--ui-control-font-size': `${fontSize}px`,
          ...style,
        } as CSSProperties
      }
      data-oi-control="switch"
      data-state={on ? 'on' : 'off'}
      onClick={(event) => {
        const next = !on;
        if (checked === undefined) setInnerChecked(next);
        if (!busy) onChange?.(next, event);
      }}
    >
      <span className={checkStyles.knob} aria-hidden="true" />
      <span className={checkStyles.knobLabel} aria-hidden="true">
        {children ?? (on ? 'ON' : 'OFF')}
      </span>
    </button>
  );
}
