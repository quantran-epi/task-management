import { Button as AntButton, type ButtonProps as AntButtonProps } from 'antd';
import type { CSSProperties } from 'react';
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
  style?: CSSProperties;
}

/**
 * ponytail: benchmark is .utility-tool-btn in UtilityToolPanel — same 28px height,
 * 10px inline padding, 4px radius and accent press feedback. Remove these literals
 * if a shared token for compact toolbar buttons is added to styles/tokens.ts.
 */
const TOOL_BUTTON_CLASS = 'ui-tool-btn';
const TOOL_BUTTON_STYLE: CSSProperties = {
  height: '28px',
  paddingInline: 10,
  borderRadius: 'var(--radius-control, 4px)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--gap-6, 6px)',
};

const VARIANT_PROPS: Record<ButtonVariant, Pick<AntButtonProps, 'type' | 'danger'>> = {
  primary: { type: 'primary' },
  default: { type: 'default' },
  danger: { type: 'primary', danger: true },
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
export function Button({ variant = 'default', style, type, danger, className, ...rest }: ButtonProps) {
  const variantProps = VARIANT_PROPS[variant];
  const isTextButton = type === 'text' || type === 'link';
  const merged = withoutUndefined({
    ...rest,
    type: type ?? variantProps.type,
    danger: danger ?? variantProps.danger,
    className: [
      TOOL_BUTTON_CLASS,
      isTextButton ? `${TOOL_BUTTON_CLASS}-text` : '',
      !isTextButton && (variant === 'primary' || variant === 'danger') ? `${TOOL_BUTTON_CLASS}-primary` : '',
      className,
    ].filter(Boolean).join(' '),
    style: isTextButton
      ? { ...controlStyle(), height: 28, paddingInline: 10, borderRadius: 'var(--radius-control, 4px)', ...style }
      : { ...controlStyle(), ...TOOL_BUTTON_STYLE, ...style },
  });
  return <AntButton {...merged} />;
}

/**
 * Icon-only Button. `aria-label` is required by the type; no children-only name.
 * Default size is `middle`, taken from the same ControlSize union as AntD.
 */
export function IconButton({ 'aria-label': label, icon, style, ...rest }: IconButtonProps) {
  return (
    <Button
      icon={icon}
      aria-label={label}
      className="ui-tool-btn-icon"
      style={{ height: '28px', ...style }}
      {...withoutUndefined(rest)}
    />
  );
}
