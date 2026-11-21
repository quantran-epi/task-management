import type { SpinProps as AntSpinProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { classNames } from './native/classNames';
import spinnerStyles from './openidea/Spinner.module.css';
import { getSharedControlTokens, getStatusTokens } from './tokens.contract';

export type SpinProps = AntSpinProps;

let defaultIndicator: ReactNode | undefined;

/** AntD Spin.setDefaultIndicator mirrored without re-export. */
export const setDefaultSpinIndicator = (indicator: ReactNode) => {
  defaultIndicator = indicator;
};

/** Native N-25 spinner; accent comes from the shared D-12 map. */
export function Spin({ style, className, spinning = true, size, tip, description, indicator, children }: SpinProps) {
  const { mode } = useThemeMode();
  const { controlHeight, fontSize } = getSharedControlTokens();
  const accent = getStatusTokens('accent', mode);
  const indicatorSize = typeof size === 'number' ? size : size === 'small' ? 14 : size === 'large' ? 32 : controlHeight;
  const tokenStyle = {
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-spin-accent': accent,
    ...style,
  } as CSSProperties;
  const ring = indicator ?? defaultIndicator ?? (
    <svg width={indicatorSize} height={indicatorSize} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={accent} strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
  return (
    <div
      data-oi-control="spinner"
      data-state={spinning ? 'spinning' : 'idle'}
      aria-busy={spinning}
      aria-label="loading"
      className={classNames(className)}
      style={tokenStyle}
    >
      {spinning && <span className={spinnerStyles.spinner}>{ring}</span>}
      {(description ?? tip) !== undefined && <span data-oi-part="tip">{description ?? tip}</span>}
      {children}
    </div>
  );
}
