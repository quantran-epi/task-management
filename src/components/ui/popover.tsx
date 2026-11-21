import type { PopoverProps as AntPopoverProps } from 'antd';
import {
  cloneElement,
  isValidElement,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { classNames } from './native/classNames';
import { Popup } from './native/popup';
import popupStyles from './openidea/Popup.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type { PopoverProps } from 'antd';

export interface PopoverWrapperProps extends AntPopoverProps {
  widthScale?: 'md' | 'lg';
}

export const WIDTH_SCALE = { md: 18, lg: 28 } as const;

function triggerOf(children: ReactNode): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(children)) return triggerOf(children[0]);
  return isValidElement<Record<string, unknown>>(children) ? children : null;
}

/** Native N-19: BODY-portal popover surface with hover/click/focus triggers. */
export function Popover({ widthScale = 'md', overlayStyle, ...rest }: PopoverWrapperProps) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const anchorRef = useRef<HTMLElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(rest.defaultOpen === true);
  const current = rest.open !== undefined ? rest.open : open;
  const triggers = rest.trigger ?? ['hover'];
  const disabled = rest.disabled === true;

  const setVisibility = useCallback((next: boolean) => {
    if (!next && hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    if (current === next) return;
    if (rest.open === undefined) setOpen(next);
    rest.onOpenChange?.(next);
  }, [current, rest.open, rest.onOpenChange]);
  const close = useCallback(() => setVisibility(false), [setVisibility]);

  const width = `${controlHeight * WIDTH_SCALE[widthScale]}px`;
  const style = {
    maxWidth: width,
    '--ui-control-font-size': `${fontSize}px`,
    borderRadius: `${borderRadius}px`,
    ...overlayStyle,
  } as CSSProperties;

  const anchor = triggerOf(rest.children);
  const trigger = anchor ? cloneElement(anchor, {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      const original = (anchor as unknown as { ref?: (node: HTMLElement | null) => void }).ref;
      if (typeof original === 'function') original(node);
      else if (original && typeof original === 'object') (original as { current: HTMLElement | null }).current = node;
    },
    'data-state': current ? 'expanded' : 'collapsed',
    'data-oi-control': 'popover-trigger',
    onClick: (event: ReactMouseEvent<HTMLElement>) => {
      (anchor.props.onClick as ((event: ReactMouseEvent<HTMLElement>) => void) | undefined)?.(event);
      if (!disabled && triggers.includes('click')) setVisibility(!current);
    },
    onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => {
      (anchor.props.onMouseEnter as ((event: ReactMouseEvent<HTMLElement>) => void) | undefined)?.(event);
      if (disabled || !triggers.includes('hover')) return;
      hoverTimer.current = setTimeout(() => setVisibility(true), rest.mouseEnterDelay ?? 0.1);
    },
    onMouseLeave: (event: ReactMouseEvent<HTMLElement>) => {
      (anchor.props.onMouseLeave as ((event: ReactMouseEvent<HTMLElement>) => void) | undefined)?.(event);
      if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
      if (triggers.includes('hover')) setVisibility(false);
    },
    onFocus: (event: ReactFocusEvent<HTMLElement>) => {
      (anchor.props.onFocus as ((event: ReactFocusEvent<HTMLElement>) => void) | undefined)?.(event);
      if (!disabled && triggers.includes('focus')) setVisibility(true);
    },
  }) : rest.children;

  const title = typeof rest.title === 'function' ? null : rest.title;
  const content = typeof rest.content === 'function' ? null : rest.content;

  return (
    <>
      {trigger}
      <Popup
        open={current && !disabled}
        anchorRef={anchorRef}
        onClose={close}
        className={classNames(popupStyles.surface)}
        control="popover-popup"
        label={typeof title === 'string' ? title : 'Popover'}
      >
        <div style={style}>
          {title !== null && title !== undefined ? <div className={popupStyles.centered}>{title}</div> : null}
          <div className={popupStyles.popup}>{content}</div>
        </div>
      </Popup>
    </>
  );
}
