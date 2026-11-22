import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
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

interface Position {
  left: number;
  top: number;
  width: number;
}

const OFFSET = 4; // 52-UI-SPEC §8 --popup-offset; mirror of sharedTokens.popupOffset.
const EDGE_PADDING = 6; // OpenIDEA middleware flip/shift padding.

function place(anchor: DOMRect, element: HTMLElement, preferred?: PopupProps['preferredPlacement']): Position {
  const width = Math.max(anchor.width, Math.min(element.offsetWidth, window.innerWidth - 2 * EDGE_PADDING));
  const height = element.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const clampLeft = (value: number) => Math.min(
    Math.max(EDGE_PADDING, value),
    Math.max(EDGE_PADDING, viewportWidth - width - EDGE_PADDING),
  );
  const clampTop = (value: number) => Math.max(EDGE_PADDING, Math.min(value, viewportHeight - height - EDGE_PADDING));
  const below = anchor.bottom + OFFSET;
  const above = anchor.top - height - OFFSET;
  const right = anchor.right + OFFSET;
  const leftSide = anchor.left - width - OFFSET;

  // Preferred side wins when it fits; otherwise keep the legacy below→above→shift
  // fallback so existing flip/shift behavior is unchanged.
  const candidates: Array<() => Position> = [];
  if (preferred === 'top') {
    candidates.push(() => ({ left: clampLeft(anchor.left), top: above, width }));
  } else if (preferred === 'left') {
    candidates.push(() => ({ left: leftSide, top: clampTop(anchor.top), width }));
  } else if (preferred === 'right') {
    candidates.push(() => ({ left: right, top: clampTop(anchor.top), width }));
  }
  candidates.push(() => ({ left: clampLeft(anchor.left), top: below, width }));
  if (preferred === 'top') candidates.push(() => ({ left: clampLeft(anchor.left), top: above, width }));
  candidates.push(() => ({ left: clampLeft(anchor.left), top: Math.max(EDGE_PADDING, Math.min(below, viewportHeight - height - EDGE_PADDING)), width }));

  for (const candidate of candidates) {
    const next = candidate();
    const fitsVertical = next.top >= EDGE_PADDING && next.top + height <= viewportHeight - EDGE_PADDING;
    const fitsHorizontal = next.left >= EDGE_PADDING && next.left + width <= viewportWidth - EDGE_PADDING;
    if (fitsVertical && fitsHorizontal) return next;
  }
  return candidates[candidates.length - 1]!();
}

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
  const popupRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [position, setPosition] = useState<Position | null>(null);
  // Inline onClose arrows are unstable; effect identity must not follow them
  // or every parent rerender re-registers listeners and steals field focus (WR-05).
  onCloseRef.current = onClose;

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const element = popupRef.current;
    if (anchor && element) setPosition(place(anchor, element, preferredPlacement));
  }, [anchorRef, preferredPlacement]);

  useLayoutEffect(() => {
    if (!open || typeof document === 'undefined') return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Only the innermost open popup handles Escape (nested popup guard).
      const popups = document.querySelectorAll('[role="dialog"][data-positioned]');
      if (popups.length > 0 && popups[popups.length - 1] !== popupRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current('escape');
      anchorRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popupRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onCloseRef.current('outside');
      anchorRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, anchorRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popupRef}
      role="dialog"
      aria-label={label}
      data-oi-control={control}
      data-positioned=""
      className={classNames(popupStyles.popup, popupStyles.surface, className)}
      style={{
        position: 'fixed',
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        width: position?.width ?? anchorRef.current?.getBoundingClientRect().width,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
