import type { PopconfirmProps as AntPopconfirmProps } from 'antd';
import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { classNames } from './native/classNames';
import { Popup } from './native/popup';
import { DialogSurface } from './native/dialog';
import buttonStyles from './openidea/Button.module.css';
import dialogStyles from './openidea/Dialog.module.css';
import { getStatusTokens, type StatusKind } from './tokens.contract';

export interface PopconfirmProps extends AntPopconfirmProps {
  /** Destructive variant maps to the shared danger status token (D-12). */
  tone?: StatusKind;
}

interface ConfirmEvent extends MouseEvent {
  key?: string;
  domEvent?: MouseEvent;
}

/** Add AntD's info fields to the original event so native methods stay alive (RR-02). */
function withConfirmInfo(event: ReactMouseEvent<HTMLButtonElement>): ConfirmEvent {
  const result = event.nativeEvent as ConfirmEvent;
  if (!Object.prototype.hasOwnProperty.call(result, 'key')) {
    Object.defineProperty(result, 'key', { value: undefined, configurable: true, enumerable: true });
  }
  if (!Object.prototype.hasOwnProperty.call(result, 'domEvent')) {
    Object.defineProperty(result, 'domEvent', { value: result, configurable: true, enumerable: true });
  }
  return result;
}

/** Popconfirm: native bubble with dialog-like variant, status-tone actions and exact Vietnamese copy. */
export function Popconfirm({
  tone = 'info',
  okText = 'Xác nhận',
  cancelText = 'Hủy',
  okType,
  okButtonProps,
  title,
  description,
  onConfirm,
  onCancel,
  onOpenChange,
  open: controlledOpen,
  children,
  icon: _icon,
}: PopconfirmProps) {
  const { mode } = useThemeMode();
  const dangerColor = getStatusTokens(tone, mode);
  const anchorRef = useRef<HTMLElement | null>(null);
  const [innerOpen, setInnerOpen] = useState(false);
  const current = controlledOpen !== undefined ? controlledOpen : innerOpen;
  const setVisibility = useCallback((next: boolean) => {
    if (controlledOpen === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  }, [controlledOpen, onOpenChange]);
  const close = useCallback((reason: 'escape' | 'outside' | 'close' | 'confirm' | 'cancel') => {
    setVisibility(false);
    if (reason === 'confirm') return;
    if (reason === 'cancel' || reason === 'escape' || reason === 'outside') {
      anchorRef.current?.focus();
    }
  }, [setVisibility]);

  const titleNode = typeof title === 'function' ? null : title;
  const descriptionNode = typeof description === 'function' ? null : description;
  const okLabel = typeof okText === 'function' ? 'Xác nhận' : okText;
  const cancelLabel = typeof cancelText === 'function' ? 'Hủy' : cancelText;
  const danger = tone === 'danger' || okType === 'danger' || okButtonProps?.danger === true;
  const okStyle = {
    ...(tone === 'danger' ? { '--ui-status-color': dangerColor } : {}),
    ...okButtonProps?.style,
  } as CSSProperties;
  const okClass = classNames(
    buttonStyles.button,
    buttonStyles.primary,
    danger && buttonStyles.danger,
    danger && 'ant-btn-dangerous',
    okButtonProps?.className,
  );
  const cancelClass = classNames(buttonStyles.button, buttonStyles.secondary);
  const message: ReactNode = (
    <>
      {titleNode !== undefined && titleNode !== null ? <div className={dialogStyles.messageTitle}>{titleNode}</div> : null}
      {descriptionNode !== undefined && descriptionNode !== null ? <div className={dialogStyles.messageBody}>{descriptionNode}</div> : null}
    </>
  );
  const actions: ReactNode = (
    <div className={dialogStyles.buttons}>
      <button type="button" className={cancelClass} onClick={(event) => {
        onCancel?.(withConfirmInfo(event) as never);
        close('cancel');
      }}>
        {cancelLabel}
      </button>
      <button type="button" className={okClass} style={okStyle} onClick={(event) => {
        onConfirm?.(withConfirmInfo(event) as never);
        close('confirm');
      }}>
        {okLabel}
      </button>
    </div>
  );

  // A long confirmation with an explicit controlled open behaves like a small dialog;
  // the common inline case stays a 4px anchored bubble.
  const modalLike = controlledOpen !== undefined && descriptionNode !== undefined;
  const content = (
    <div data-oi-control="popconfirm" data-state={current ? 'expanded' : 'collapsed'}>
      {message}
      {actions}
    </div>
  );

  return (
    <>
      <span
        ref={anchorRef}
        style={{ display: 'inline-flex' }}
        data-state={current ? 'expanded' : 'collapsed'}
        onClick={() => setVisibility(!current)}
      >
        {children}
      </span>
      {modalLike ? (
        <DialogSurface
          open={current}
          title={titleNode}
          footer={actions}
          onClose={(reason) => {
            if (reason === 'escape' || reason === 'outside' || reason === 'close') {
              onCancel?.(undefined as never);
              close(reason);
            }
          }}
          label={typeof titleNode === 'string' ? titleNode : 'Xác nhận'}
        >
          {descriptionNode}
        </DialogSurface>
      ) : (
        <Popup
          open={current}
          anchorRef={anchorRef}
          onClose={(reason) => {
            onCancel?.(undefined as never);
            close(reason ?? 'outside');
          }}
          className={dialogStyles.popup ?? ''}
          control="popconfirm"
          label={typeof titleNode === 'string' ? titleNode : 'Xác nhận'}
        >
          {content}
        </Popup>
      )}
    </>
  );
}
