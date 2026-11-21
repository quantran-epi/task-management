import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { classNames } from './classNames';
import popupStyles from '../openidea/Popup.module.css';

/** Native popup helper: portal to BODY, fixed placement, flip/shift, focus-safe dismissal. */
export interface PopupProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  className?: string;
  children: ReactNode;
  label?: string;
  /** Measurement hook for the owning control; defaults to the generic popup hook. */
  control?: string;
}

interface Position {
  left: number;
  top: number;
  width: number;
}

const OFFSET = 4; // 52-UI-SPEC §8 --popup-offset; mirror of sharedTokens.popupOffset.
const EDGE_PADDING = 6; // OpenIDEA middleware flip/shift padding.

function place(anchor: DOMRect, element: HTMLElement): Position {
  const width = Math.max(anchor.width, Math.min(element.offsetWidth, window.innerWidth - 2 * EDGE_PADDING));
  const height = element.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const left = Math.min(
    Math.max(EDGE_PADDING, anchor.left),
    Math.max(EDGE_PADDING, viewportWidth - width - EDGE_PADDING),
  );
  const below = anchor.bottom + OFFSET;
  const above = anchor.top - height - OFFSET;
  const top = below + height <= viewportHeight - EDGE_PADDING
    ? below
    : above >= EDGE_PADDING
      ? above
      : Math.max(EDGE_PADDING, Math.min(below, viewportHeight - height - EDGE_PADDING));

  return { left, top, width };
}

export function Popup({ open, anchorRef, onClose, className, children, label, control = 'popup' }: PopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const element = popupRef.current;
    if (anchor && element) setPosition(place(anchor, element));
  }, [anchorRef]);

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
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popupRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
      anchorRef.current?.focus();
    };
  }, [open, onClose, anchorRef]);

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
