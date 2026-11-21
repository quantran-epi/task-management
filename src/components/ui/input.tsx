import { Input as AntInput, type InputProps as AntInputProps } from 'antd';
import { forwardRef, type CSSProperties } from 'react';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';

/** Full-width is the default; `auto` keeps the AntD intrinsic width. */
export type InputWidth = 'full' | 'auto';

export interface InputProps extends AntInputProps {
  width?: InputWidth;
}

/** Shared control metrics as custom properties — no inline fractional font-size (D-10). */
export function controlStyle(): CSSProperties {
  const { controlHeight, borderRadius, fontSize, paddingInline } = getSharedControlTokens();
  return {
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-radius': `${borderRadius}px`,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-padding-inline': `${paddingInline}px`,
  } as CSSProperties;
}

/** Token-derived width policy. No raw caller-supplied CSS width. */
export function controlWidthStyle(width: InputWidth): CSSProperties {
  return width === 'full' ? { width: '100%' } : {};
}

/** Single swap point for every AntD Input. Error maps to AntD `status`. */
export const Input = forwardRef<import('antd').InputRef, InputProps>(function Input(
  { width = 'full', status, style, ...rest },
  ref,
) {
  const merged = withoutUndefined({
    ...rest,
    status: status ?? (rest['aria-invalid'] ? 'error' : undefined),
    style: { ...controlStyle(), ...controlWidthStyle(width), ...style },
  });
  return <AntInput {...merged} ref={ref} />;
});

/** AntD Input.Search mirrored as a named export (compound slot policy, D-03). */
export const InputSearch = AntInput.Search;

/** AntD Input.Password mirrored as a named export (compound slot policy, D-03). */
export const InputPassword = AntInput.Password;
