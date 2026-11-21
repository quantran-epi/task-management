import { Drawer as AntDrawer, type DrawerProps as AntDrawerProps } from 'antd';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';
import { getOverlayWidth, resolveMask, type OverlayWidth } from './modal';

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
  maskClosable,
  title,
  ...rest
}: DrawerProps) {
  void getSharedControlTokens();
  const closableByDefault = closePolicy === 'closable';
  return (
    <AntDrawer
      {...rest}
      size={width ?? getOverlayWidth(widthScale)}
      placement={placement}
      title={title}
      closable={closableByDefault ? (closable ?? true) : false}
      {...withoutUndefined({
        maskClosable,
        mask: resolveMask(mask, closableByDefault, maskClosable),
      })}
    />
  );
}
