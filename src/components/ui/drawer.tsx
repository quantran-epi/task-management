import { Drawer as AntDrawer, type DrawerProps as AntDrawerProps } from 'antd';
import { getSharedControlTokens } from './tokens.contract';
import { getOverlayWidth, type OverlayWidth } from './modal';

export interface DrawerProps extends AntDrawerProps {
  widthScale?: OverlayWidth;
  closePolicy?: 'closable' | 'silent';
}

/** Drawer wrapper: token-derived width scale, close/mask policy, consistent title default. */
export function Drawer({
  widthScale = 'lg',
  closePolicy = 'closable',
  width,
  placement = 'right',
  closable,
  mask,
  title,
  ...rest
}: DrawerProps) {
  void getSharedControlTokens();
  return (
    <AntDrawer
      {...rest}
      size={width ?? getOverlayWidth(widthScale)}
      placement={placement}
      title={title}
      closable={closePolicy === 'closable' ? (closable ?? true) : false}
      mask={{ closable: closePolicy === 'closable', ...(typeof mask === 'object' ? mask : {}) }}
    />
  );
}
