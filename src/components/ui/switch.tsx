import type { SwitchProps as AntSwitchProps } from 'antd';
import type { CSSProperties } from 'react';
import { classNames } from './native/classNames';
import checkStyles from './openidea/Checkbox.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type SwitchProps = AntSwitchProps & { 'aria-label'?: string };

/** Single swap point for AntD Switch; height/radius from shared control tokens. */
export function Switch({ style, className, checked, defaultChecked, disabled, loading, 'aria-label': ariaLabel, onChange, ...rest }: SwitchProps) {
  const { controlHeight, borderRadius, fontSize } = getSharedControlTokens();
  const on = checked ?? defaultChecked ?? false;
  return (
    <button
      {...(rest as object)}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      aria-busy={loading === true ? 'true' : undefined}
      disabled={disabled === true || loading === true}
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
        onChange?.(!on, event);
      }}
    >
      <span className={checkStyles.knob} aria-hidden="true" />
      <span className={checkStyles.knobLabel} aria-hidden="true">{on ? 'ON' : 'OFF'}</span>
    </button>
  );
}
