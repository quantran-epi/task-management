import {
  AutoComplete as AntAutoComplete,
  type AutoCompleteProps as AntAutoCompleteProps,
} from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type AutoCompleteProps<ValueType = any> = AntAutoCompleteProps<ValueType>;
export const AutoCompleteOption = AntAutoComplete.Option;

/**
 * Single swap point for AntD AutoComplete. AntD 6 has no `style` prop here, so the
 * token-derived metric travels through `styles.root`; caller styles win.
 */
export function AutoComplete<ValueType = any>({ styles, ...rest }: AutoCompleteProps<ValueType>) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const tokenStyle = {
    '--ui-autocomplete-height': `${controlHeight}px`,
    '--ui-autocomplete-font-size': `${fontSize}px`,
    '--ui-autocomplete-radius': `${borderRadius}px`,
  } as CSSProperties;
  const rootStyle =
    styles && typeof styles === 'object' && 'root' in styles
      ? { ...tokenStyle, ...(styles.root as CSSProperties | undefined) }
      : tokenStyle;
  return <AntAutoComplete<ValueType> {...rest} styles={{ ...(styles as object), root: rootStyle } as typeof styles} />;
}
