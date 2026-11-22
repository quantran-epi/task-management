import type { CardProps as AntCardProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { classNames } from './native/classNames';
import dialogStyles from './openidea/Dialog.module.css';
import feedbackStyles from './openidea/Feedback.module.css';
import listStyles from './openidea/List.module.css';
import { Skeleton } from './skeleton';
import { getSharedControlTokens } from './tokens.contract';

export type CardProps = AntCardProps;

/** AntD Card statics mirrored as named exports; no bare re-export. */
export const CardGrid = function CardGrid({
  children,
  className,
  style,
}: { children?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={classNames(listStyles.row, className)} data-oi-control="card-grid" style={style}>
      {children}
    </div>
  );
};

export const CardMeta = function CardMeta({
  avatar,
  title,
  description,
  className,
  style,
}: { avatar?: ReactNode; title?: ReactNode; description?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={classNames(listStyles.row, className)} data-oi-control="card-meta" style={style}>
      {avatar !== undefined && <span data-oi-control="card-meta-avatar">{avatar}</span>}
      <div>
        {title !== undefined && <div data-oi-control="card-meta-title">{title}</div>}
        {description !== undefined && <div data-oi-control="card-meta-description">{description}</div>}
      </div>
    </div>
  );
};

/** Token radius/metrics as custom properties — no raw metric or hex in the wrapper. */
export function cardStyle(): CSSProperties {
  const { borderRadius, controlHeight, fontSize } = getSharedControlTokens();
  return {
    '--ui-control-radius': `${borderRadius}px`,
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-font-size': `${fontSize}px`,
  } as CSSProperties;
}

/** Native N-05 card; caller style wins, loading/empty/hover states are observable. */
export function Card({
  style,
  className,
  title,
  extra,
  cover,
  actions,
  loading,
  hoverable,
  bordered,
  variant,
  children,
  ...rest
}: CardProps) {
  void rest;
  void bordered;
  void variant;
  return (
    <section
      className={classNames(dialogStyles.window, hoverable === true && listStyles.active, className)}
      data-oi-control="card"
      data-state={loading === true ? 'loading' : hoverable === true ? 'hover' : children === undefined || children === null ? 'empty' : 'default'}
      aria-busy={loading === true ? 'true' : undefined}
      style={{ ...cardStyle(), ...style } as CSSProperties}
    >
      {cover !== undefined && <div data-oi-control="card-cover">{cover}</div>}
      {title !== undefined || extra !== undefined ? (
        <header className={dialogStyles.titleBar} data-oi-control="card-header">
          <span className={dialogStyles.title}>{title}</span>
          {extra}
        </header>
      ) : null}
      {loading === true ? (
        <div className={feedbackStyles.emptyBody} data-oi-control="card-loading"><Skeleton /></div>
      ) : children === undefined || children === null ? (
        <div className={feedbackStyles.emptyBody} data-oi-control="card-empty" />
      ) : (
        <div className={dialogStyles.body} data-oi-control="card-body">{children}</div>
      )}
      {actions !== undefined && actions.length > 0 ? (
        <footer className={dialogStyles.footer} data-oi-control="card-actions">{actions}</footer>
      ) : null}
    </section>
  );
}
