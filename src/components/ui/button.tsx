import type { ButtonProps as AntButtonProps } from 'antd';
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { classNames } from './native/classNames';
import buttonStyles from './openidea/Button.module.css';
import { getSharedControlTokens, withoutUndefined, type ControlSize } from './tokens.contract';

/** Wrapper policy prop: maps to AntD `type`/`danger` (D-02). */
export type ButtonVariant = 'primary' | 'default' | 'danger';

export interface ButtonProps extends Omit<AntButtonProps, 'variant' | 'color'> {
  variant?: ButtonVariant;
}

export interface IconButtonProps extends ButtonProps {
  'aria-label': string;
  size?: ControlSize;
  children?: never;
}

const VARIANT_PROPS: Record<ButtonVariant, Pick<AntButtonProps, 'type' | 'danger'>> = {
  primary: { type: 'primary' },
  default: { type: 'default' },
  danger: { type: 'primary', danger: true },
};

const GHOST_TYPES = new Set<NonNullable<AntButtonProps['type']>>(['link', 'text']);
const ICON_SIZE_CLASS: Record<ControlSize, string | undefined> = {
  small: buttonStyles['is-small'],
  middle: buttonStyles['is-normal'],
  large: buttonStyles['is-large'],
};

function controlStyle(): CSSProperties {
  const { controlHeight, borderRadius, fontSize, paddingInline } = getSharedControlTokens();
  return {
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-radius': `${borderRadius}px`,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-padding-inline': `${paddingInline}px`,
  } as CSSProperties;
}

/** Single swap point for every AntD Button. Caller props win; metrics come from the contract. */
export function Button({
  variant = 'default',
  style,
  type,
  danger,
  size = 'middle',
  icon,
  loading,
  htmlType,
  href,
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const variantProps = VARIANT_PROPS[variant];
  const resolvedType = type ?? variantProps.type;
  const resolvedDanger = danger ?? variantProps.danger;
  const isGhost = resolvedType !== undefined && GHOST_TYPES.has(resolvedType);
  const isDanger = resolvedDanger === true;
  const state = isDanger ? 'danger' : isGhost ? 'ghost' : resolvedType === 'primary' ? 'primary' : 'secondary';

  const tokens: CSSProperties = {
    ...controlStyle(),
    ...(isDanger ? { '--bg-button-primary': 'var(--danger-control)' } : {}),
  };

  const classes = classNames(
    buttonStyles.button,
    state === 'primary' || state === 'danger' ? buttonStyles.primary : buttonStyles.secondary,
    isGhost && buttonStyles.ghost,
    size === 'small' && buttonStyles.small,
    className,
  );

  const content: ReactNode = (
    <>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </>
  );

  const click: MouseEventHandler<HTMLElement> | undefined = loading ? undefined : onClick as MouseEventHandler<HTMLElement> | undefined;
  const shared = withoutUndefined({
    className: classes,
    style: { ...tokens, ...style },
    onClick: click,
    'data-state': state,
    'data-size': size,
    'aria-busy': loading ? 'true' : undefined,
    ...rest,
  });

  if (href !== undefined) {
    return (
      <a data-oi-control="button" {...shared} href={href} role="button">
        {content}
      </a>
    );
  }

  return (
    <button data-oi-control="button" {...shared} type={htmlType ?? 'button'} disabled={rest.disabled === true || loading === true}>
      {content}
    </button>
  );
}

/**
 * Icon-only Button. `aria-label` is required by the type; no children-only name.
 * Default size is `middle`, taken from the same ControlSize union as AntD.
 */
export function IconButton({ 'aria-label': label, size = 'middle', icon, ...rest }: IconButtonProps) {
  return (
    <Button
      {...rest}
      size={size}
      icon={icon}
      aria-label={label}
      data-oi-control="icon-button"
      className={classNames(buttonStyles.iconButton, ICON_SIZE_CLASS[size], rest.className)}
    />
  );
}
