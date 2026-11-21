import { Menu as AntMenu, type MenuProps as AntMenuProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type { MenuProps, MenuItemProps, MenuRef, MenuTheme } from 'antd';

export interface MenuWrapperProps extends AntMenuProps {
  /** Compact row height comes from the shared control height metric. */
  compact?: boolean;
}

/** Menu rows inherit the shared control height/font; no raw per-row metrics at call sites. */
export function Menu({ compact = true, style, ...rest }: MenuWrapperProps) {
  const { controlHeight, fontSize, iconSize } = getSharedControlTokens();
  const menuStyle = {
    '--ui-menu-row-height': `${controlHeight}px`,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-menu-icon-size': iconSize,
    ...style,
  } as CSSProperties;
  return <AntMenu {...rest} style={menuStyle} />;
}

export const MenuItem = AntMenu.Item;
export const MenuSubMenu = AntMenu.SubMenu;
export const MenuItemGroup = AntMenu.ItemGroup;
