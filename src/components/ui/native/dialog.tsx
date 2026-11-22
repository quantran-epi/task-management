import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { classNames } from './classNames';
import dialogStyles from '../openidea/Dialog.module.css';

/** Reason a DialogSurface was dismissed; mirrors Popup's onClose contract plus the close button. */
export type DialogCloseReason = 'escape' | 'outside' | 'close';

export interface DialogSurfaceProps {
  open: boolean;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode | null;
  width?: number | string;
  /** Panel edge for drawer-style surfaces; center is the default. */
  placement?: 'center' | 'right' | 'left' | 'top' | 'bottom';
  closable?: boolean;
  /** Transparent backdrop when true; when false, no backdrop node is rendered at all. */
  masked?: boolean;
  onClose?: (reason?: DialogCloseReason) => void;
  label?: string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  /** Measurement hook for Phase 57; never a wrapper prop. */
  control?: string;
  /** Optional panel chrome around the dialog, rendered inside the same portal (drawer panels). */
  wrapper?: (dialog: ReactNode) => ReactNode;
}

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const PLACEMENT_CLASS: Record<NonNullable<DialogSurfaceProps['placement']>, string | undefined> = {
  center: undefined,
  right: dialogStyles.right,
  left: dialogStyles.left,
  top: dialogStyles.top,
  bottom: dialogStyles.bottom,
};

/**
 * Native dialog surface: portal to BODY, transparent backdrop, Tab trap and focus
 * restore. Popup deliberately does not trap focus; every modal-like control uses
 * this surface instead.
 */
export function DialogSurface({
  open,
  title,
  children,
  footer,
  width,
  placement = 'center',
  closable = true,
  masked = true,
  onClose,
  label,
  className,
  style,
  control = 'dialog',
  wrapper,
}: DialogSurfaceProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  // Inline onClose arrows are unstable. The effect reads the latest callback
  // through this ref so a parent rerender never re-registers listeners (WR-05).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = useCallback((reason: DialogCloseReason) => {
    onCloseRef.current?.(reason);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!wasOpenRef.current) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      wasOpenRef.current = true;
      const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE);
      (firstFocusable ?? dialog).focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape' && closable) {
        const dialogs = document.querySelectorAll('[role="dialog"][data-oi-control][data-state="open"]');
        if (dialogs.length > 0 && dialogs[dialogs.length - 1] !== dialog) return;
        event.preventDefault();
        event.stopPropagation();
        close('escape');
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (active === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Focus is restored by `close` on dismissal. Cleanup must not steal focus
      // when the whole dialog unmounts with its caller.
      wasOpenRef.current = false;
    };
  }, [open, closable, close]);

  if (!open || typeof document === 'undefined') return null;

  const widthStyle: CSSProperties = width === undefined ? {} : { width };
  const dialog = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={label ?? (typeof title === 'string' ? title : undefined)}
      data-oi-control={control}
      data-state="open"
      tabIndex={-1}
      className={classNames(dialogStyles.dialog, dialogStyles.window, PLACEMENT_CLASS[placement], className)}
      style={{ ...widthStyle, ...style }}
    >
      {(title !== undefined || closable) && (
        <div className={classNames(dialogStyles.titleBar, dialogStyles.macTitleBar)}>
          {closable && (
            <div className={dialogStyles.lights}>
              <button
                type="button"
                aria-label="Đóng"
                data-oi-control="dialog-close"
                className={classNames(dialogStyles.light, dialogStyles.lightClose)}
                onClick={() => close('close')}
              />
            </div>
          )}
          {title !== undefined && <div className={dialogStyles.title}>{title}</div>}
        </div>
      )}
      <div className={dialogStyles.body}>{children}</div>
      {footer !== null && footer !== undefined && (
        <div data-oi-control="dialog-footer" className={dialogStyles.footer}>
          {footer}
        </div>
      )}
    </div>
  );

  const surface = wrapper ? wrapper(dialog) : dialog;
  return createPortal(
    masked ? (
      <div
        data-oi-control="dialog-backdrop"
        className={dialogStyles.backdrop}
        onPointerDown={(event) => {
          if (closable && event.target === event.currentTarget) close('outside');
        }}
      >
        {surface}
      </div>
    ) : (
      surface
    ),
    document.body,
  );
}
