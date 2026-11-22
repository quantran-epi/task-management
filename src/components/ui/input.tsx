import { Input as AntInput, type InputProps as AntInputProps } from 'antd';
import type { SearchProps as AntSearchProps } from 'antd/es/input/Search';
import { forwardRef, type CSSProperties } from 'react';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';
import { useAntdToken } from './antdTheme';
import { SearchOutlined } from './icon';

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

/** Search input with the same token-derived metrics as Input (compound slot policy, D-03). */
export const InputSearch = forwardRef<import('antd').InputRef, AntSearchProps>(function InputSearch(
  { style, classNames, ...rest },
  ref,
) {
  const rootStyle = { ...controlStyle(), ...controlWidthStyle('full'), ...style };
  return (
    <AntInput.Search
      {...rest}
      ref={ref}
      style={rootStyle}
      classNames={{ root: 'ui-search-root', ...classNames }}
    />
  );
});

/** Default search box for every search surface: token prefix + allowClear + middle size. */
export const SearchInput = forwardRef<import('antd').InputRef, InputProps>(function SearchInput(
  { allowClear = true, size = 'middle', prefix, ...rest },
  ref,
) {
  const token = useAntdToken();
  return (
    <Input
      {...rest}
      ref={ref}
      allowClear={allowClear}
      size={size}
      prefix={prefix ?? <SearchOutlined style={{ color: token.token.colorTextSecondary }} />}
    />
  );
});

/** AntD Input.Password mirrored as a named export (compound slot policy, D-03). */
export const InputPassword = AntInput.Password;
