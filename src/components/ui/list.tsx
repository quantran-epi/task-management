import { List as AntList, type ListProps as AntListProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type ListProps<T> = AntListProps<T>;
export const ListItem = AntList.Item;
export const ListItemMeta = AntList.Item.Meta;

/** Generic preserved so callers keep their row type; row metrics from the shared contract. */
export function List<T>({ style, ...rest }: ListProps<T>) {
  const { controlHeight, fontSize } = getSharedControlTokens();
  const tokenStyle = {
    '--ui-list-row-height': `${controlHeight}px`,
    '--ui-list-font-size': `${fontSize}px`,
  } as CSSProperties;
  return <AntList<T> {...rest} style={{ ...tokenStyle, ...style }} />;
}
