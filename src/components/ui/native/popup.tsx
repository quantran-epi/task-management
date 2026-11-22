import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react-dom';
import { classNames } from './classNames';
import popupStyles from '../openidea/Popup.module.css';

/** Native popup helper: portal to BODY, fixed placement, flip/shift, focus-safe dismissal. */
export interface PopupProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  /** Called on Escape/outside-click. `code` lets owners restore focus only for keyboard dismissal. */
  onClose: (reason?: 'escape' | 'outside') => void;
  className?: string;
  children: ReactNode;
  label?: string;
  /** Measurement hook for the owning control; defaults to the generic popup hook. */
  control?: string;
  /** Preferred side from the caller's AntD `placement` prop; flip/shift still applies. */
  preferredPlacement?: 'top' | 'bottom' | 'left' | 'right' | undefined;
}

const EDGE_PADDING = 6; // OpenIDEA middleware flip/shift padding; offset is 4px per 52-UI-SPEC §8.

/** AntD placement values carry alignment suffixes; Popup only needs the side. */
export function preferredSide(placement?: string): PopupProps['preferredPlacement'] {
  if (!placement) return undefined;
  if (placement.startsWith('top')) return 'top';
  if (placement.startsWith('left')) return 'left';
  if (placement.startsWith('right')) return 'right';
  if (placement.startsWith('bottom')) return 'bottom';
  return undefined;
}

export function Popup({ open, anchorRef, onClose, className, children, label, control = 'popup', preferredPlacement }: PopupProps) {
  const onCloseRef = useRef(onClose);
  const requestedPlacement = `${preferredPlacement ?? 'bottom'}-start` as const;
  const { refs, floatingStyles, placement } = useFloating({
    open,
    placement: requestedPlacement,
    strategy: 'fixed',
    transform: false,
    elements: { reference: anchorRef.current },
    middleware: [
      offset(4),
      // Only flip across the main axis so the caller's side is kept; shift()
      // still clamps cross-axis overflow without choosing the opposite side.
      flip({ padding: EDGE_PADDING, fallbackPlacements: [`${preferredPlacement === 'top' ? 'bottom' : preferredPlacement === 'left' ? 'right' : preferredPlacement === 'right' ? 'left' : 'top'}-start`] }),
      shift({ padding: EDGE_PADDING }),
    ],
    whileElementsMounted: autoUpdate,
  });
  // Inline onClose arrows are unstable; effect identity must not follow them
  // or every parent rerender re-registers listeners and steals field focus (WR-05).
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Only the innermost open popup handles Escape (nested popup guard).
      const popups = document.querySelectorAll('[role="dialog"][data-positioned]');
      if (popups.length > 0 && popups[popups.length - 1] !== refs.floating.current) return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current('escape');
      anchorRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (refs.floating.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onCloseRef.current('outside');
      anchorRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, anchorRef, refs.floating]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={refs.setFloating}
      role="dialog"
      aria-label={label}
      data-oi-control={control}
      data-positioned=""
      data-floating=""
      data-placement={placement}
      className={classNames(popupStyles.popup, popupStyles.surface, className)}
      style={{ ...floatingStyles, width: anchorRef.current?.getBoundingClientRect().width }}
    >
      {children}
    </div>,
    document.body,
  );
}
