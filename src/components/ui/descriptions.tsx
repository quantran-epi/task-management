import type { DescriptionsProps as AntDescriptionsProps } from 'antd';
import type { DescriptionsItemProps as AntDescriptionsItemProps } from 'antd/es/descriptions/Item';
import type { CSSProperties, ReactNode } from 'react';
import { classNames } from './native/classNames';
import fieldsetStyles from './openidea/DialogFieldset.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type DescriptionsProps = AntDescriptionsProps;

/** AntD Descriptions.Item mirrored under a wrapper-owned name. */
export const DescriptionsItem = function DescriptionsItem({
  label,
  children,
  className,
  style,
  span,
}: AntDescriptionsItemProps) {
  void span;
  return (
    <>
      <dt
        className={classNames(fieldsetStyles.group, className)}
        data-oi-control="descriptions-label"
        style={style}
      >
        {label}
      </dt>
      <dd
        data-oi-control="descriptions-value"
        data-state={children === undefined || children === null || children === '' ? 'empty' : 'default'}
      >
        {children}
      </dd>
    </>
  );
};

function descriptionsStyle(): CSSProperties {
  const { fontSize, controlHeight } = getSharedControlTokens();
  return {
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-label-font-size': 'var(--font-size-small)',
    '--ui-control-height': `${controlHeight}px`,
  } as CSSProperties;
}

/** Native N-09 description list; label/value metrics come from tokens. */
export function Descriptions({
  style,
  className,
  bordered,
  column,
  size,
  layout,
  title,
  extra,
  items,
  children,
  ...rest
}: DescriptionsProps) {
  void rest;
  void column;
  void size;
  void layout;
  let pairs: ReactNode = children;
  if (items !== undefined) {
    pairs = items.map((item, index) => (
      <DescriptionsItem
        key={String(item.key ?? index)}
        label={item.label}
        {...(item.span === undefined ? {} : { span: item.span })}
      >
        {item.children}
      </DescriptionsItem>
    ));
  }
  return (
    <dl
      className={classNames(fieldsetStyles.body, className)}
      data-oi-control="descriptions"
      data-state={bordered === true ? 'bordered' : 'default'}
      style={{
        ...descriptionsStyle(),
        ...(bordered === true ? { border: '1px solid var(--border)' } : {}),
        ...style,
      } as CSSProperties}
    >
      {title !== undefined || extra !== undefined ? (
        <div data-oi-control="descriptions-header">
          <span>{title}</span>
          {extra}
        </div>
      ) : null}
      {pairs}
    </dl>
  );
}
