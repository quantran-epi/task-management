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
}

const VARIANT_PROPS: Record<ButtonVariant, Pick<AntButtonProps, 'type' | 'danger'>> = {
  primary: { type: 'primary' },
  default: { type: 'default' },
  danger: { type: 'primary', danger: true },
};

function controlStyle(): CSSProperties {
  const { fontSize } = getSharedControlTokens();
  return { fontSize };
}

/** Single swap point for every AntD Button. Caller props win; metrics come from the contract. */
export function Button({ variant = 'default', ...rest }: ButtonProps) {
  const { type, danger } = VARIANT_PROPS[variant];
  const merged = withoutUndefined({ ...rest, type, danger, style: controlStyle() });
  return <AntButton {...merged} />;
}

/**
 * Icon-only Button. `aria-label` is required by the type; no children-only name.
 * Default size is `middle`, taken from the same ControlSize union as AntD.
 */
export function IconButton({ 'aria-label': label, size = 'middle', icon, ...rest }: IconButtonProps) {
  return (
    <Button
      size={size}
      icon={icon}
      aria-label={label}
      {...withoutUndefined(rest)}
    />
  );
}
