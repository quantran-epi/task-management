import type { ResultProps as AntResultProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { CheckCircleFilled, CloseCircleOutlined, ExclamationCircleFilled, InfoCircleOutlined, WarningOutlined } from './icon';
import listStyles from './openidea/List.module.css';
import { getSharedControlTokens, getStatusTokens, type StatusKind } from './tokens.contract';

export type ResultProps = AntResultProps;

type ResultStatus = NonNullable<AntResultProps['status']>;

const RESULT_TONE: Record<ResultStatus, StatusKind> = {
  success: 'success',
  error: 'danger',
  warning: 'warning',
  info: 'info',
  '403': 'danger',
  '404': 'warning',
  '500': 'danger',
};

const RESULT_ICON = {
  success: CheckCircleFilled,
  error: CloseCircleOutlined,
  warning: WarningOutlined,
  info: InfoCircleOutlined,
  '403': ExclamationCircleFilled,
  '404': ExclamationCircleFilled,
  '500': ExclamationCircleFilled,
} as const;

/** Native N-21 result; title/description/icon metrics from the shared contract. */
export function Result({ style, status = 'info', title, subTitle, icon, extra, children }: AntResultProps) {
  const { mode } = useThemeMode();
  const { fontSize, controlHeight } = getSharedControlTokens();
  const tone = RESULT_TONE[status];
  const toneColor = getStatusTokens(tone, mode);
  const ResultIcon = RESULT_ICON[status];
  const tokenStyle = {
    '--ui-result-font-size': `${fontSize}px`,
    '--ui-result-icon-size': `${controlHeight * 2}px`,
    ...style,
  } as CSSProperties;
  return (
    <div data-oi-control="result" data-state={status} className={listStyles.emptyWrap} style={tokenStyle}>
      <div data-oi-part="icon" style={{ color: toneColor }}>
        {icon ?? <ResultIcon tone={tone} aria-label={String(status)} size={controlHeight * 2} />}
      </div>
      {title !== undefined && <div data-oi-part="title" style={{ fontSize: 16 }}>{title}</div>}
      {subTitle !== undefined && (
        <div data-oi-part="description" className={listStyles.emptyBody} style={{ fontSize: fontSize }}>
          {subTitle}
        </div>
      )}
      {children}
      {extra !== undefined && <div data-oi-part="actions" className={listStyles.emptyActions}>{extra as ReactNode}</div>}
    </div>
  );
}
