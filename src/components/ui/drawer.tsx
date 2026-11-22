import type { DrawerProps as AntDrawerProps } from 'antd';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { classNames } from './native/classNames';
import { DialogSurface, type DialogCloseReason } from './native/dialog';
import dialogStyles from './openidea/Dialog.module.css';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';
import { getOverlayWidth, resolveMask, type OverlayWidth } from './modal';

export interface DrawerProps extends AntDrawerProps {
  widthScale?: OverlayWidth;
  closePolicy?: 'closable' | 'silent';
  defaultOpen?: boolean;
}

/** Drawer: token-derived width scale, close/mask policy and native panel chrome. */
export function Drawer({
  widthScale = 'lg',
  closePolicy = 'closable',
  width,
  placement = 'right',
  closable,
  mask,
  maskClosable,
  title,
  open,
  defaultOpen,
  onClose,
  children,
  className,
  style,
  ...rest
}: DrawerProps) {
  const { controlHeight } = getSharedControlTokens();
  const [innerOpen, setInnerOpen] = useState(defaultOpen === true);
  const currentOpen = open !== undefined ? open : innerOpen;
  const closableByDefault = closePolicy === 'closable';
  const canClose = closableByDefault ? (typeof closable === 'boolean' ? closable : true) : false;
  const resolvedMask = resolveMask(mask, closableByDefault, maskClosable);
  const masked = typeof resolvedMask === 'boolean' ? resolvedMask : (resolvedMask?.closable ?? closableByDefault);
  const size = width ?? getOverlayWidth(widthScale);
  const dismiss = (reason?: DialogCloseReason) => {
    if (reason === 'outside' && maskClosable === false) return;
    if (open === undefined) setInnerOpen(false);
    onClose?.(new MouseEvent('click') as never);
  };
  const panelClass = classNames(
    dialogStyles.window,
    placement === 'right' && dialogStyles.right,
    placement === 'left' && dialogStyles.left,
    placement === 'top' && dialogStyles.top,
    placement === 'bottom' && dialogStyles.bottom,
    className,
  );
  const wrapper = (dialog: ReactNode) => (
    <div
      data-oi-control="drawer"
      data-placement={placement}
      className={panelClass}
      style={{ ...style, width: size, height: style?.height }}
    >
      {dialog}
    </div>
  );

  return (
    <DialogSurface
      open={currentOpen}
      title={title}
      {...withoutUndefined({ width: typeof width === 'number' || typeof width === 'string' ? width : undefined })}
      placement={placement}
      closable={canClose}
      masked={masked}
      control="dialog"
      label={typeof title === 'string' ? title : undefined}
      wrapper={wrapper}
      onClose={dismiss}
    >
      <div {...withoutUndefined(rest)} style={{ '--ui-control-height': `${controlHeight}px` } as CSSProperties}>
        {children}
      </div>
    </DialogSurface>
  );
}
