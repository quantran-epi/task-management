import type { CountdownProps, StatisticProps as AntStatisticProps, StatisticTimerProps } from 'antd/es/statistic';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type StatisticProps = AntStatisticProps;

type Value = AntStatisticProps['value'];

function toNumber(value: Value): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  return 0;
}

type BodyProps = Omit<AntStatisticProps, 'style'> & { style?: CSSProperties | undefined };

function StatisticBody({ value, formatter, precision = 0, prefix, suffix, title, style, className }: BodyProps) {
  const { fontSize } = getSharedControlTokens();
  const tokenStyle = {
    '--ui-statistic-font-size': `${fontSize}px`,
    ...style,
  } as CSSProperties;
  const text = value === undefined ? '' : toNumber(value).toFixed(precision);
  const callable = typeof formatter === 'function' ? formatter : undefined;
  const content: ReactNode = callable ? callable(text as never) : text;
  return (
    <div data-oi-control="statistic" className={className} style={tokenStyle}>
      {title !== undefined && <div data-oi-part="label" style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>{title}</div>}
      <div data-oi-part="value" style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>
        {prefix !== undefined && <span style={{ fontSize: 12 }}>{prefix}</span>}
        {content}
        {suffix !== undefined && <span style={{ fontSize: 12 }}>{suffix}</span>}
      </div>
    </div>
  );
}

/** Native statistic; label/value metrics come from the shared contract. */
export function Statistic({ style, ...rest }: AntStatisticProps) {
  return <StatisticBody {...rest} style={style} />;
}

function toEpoch(value: Value, fallback: number): number {
  if (value === undefined) return fallback;
  const numeric = toNumber(value);
  return numeric > 1e11 ? numeric : Date.now() + numeric;
}

/** Countdown fires onFinish exactly once when the remaining time reaches zero. */
export function StatisticCountdown({ value, onFinish, ...rest }: CountdownProps) {
  const target = toEpoch(value, Date.now());
  const [remaining, setRemaining] = useState(() => Math.max(0, target - Date.now()));
  const finished = useRef(false);

  useEffect(() => {
    finished.current = false;
    const tick = () => {
      const next = Math.max(0, target - Date.now());
      setRemaining(next);
      if (next === 0 && !finished.current) {
        finished.current = true;
        onFinish?.();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [target, onFinish]);

  return <StatisticBody {...rest} value={Math.ceil(remaining / 1000)} />;
}

/** Timer counts upward from the supplied epoch/offset. */
export function StatisticTimer({ value, ...rest }: StatisticTimerProps) {
  const start = toEpoch(value, Date.now());
  const [elapsed, setElapsed] = useState(() => Math.max(0, Date.now() - start));

  useEffect(() => {
    setElapsed(Math.max(0, Date.now() - start));
    const timer = window.setInterval(() => setElapsed(Math.max(0, Date.now() - start)), 1000);
    return () => window.clearInterval(timer);
  }, [start]);

  return <StatisticBody {...rest} value={Math.floor(elapsed / 1000)} />;
}
