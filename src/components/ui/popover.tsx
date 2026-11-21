import type { PopoverProps as AntPopoverProps } from 'antd';
import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
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

  // Delegating wrapper: caller children are often function components and cannot take a ref.
  const trigger = (
    <span
      ref={anchorRef}
      data-state={current ? 'expanded' : 'collapsed'}
      data-oi-control="popover-trigger"
      style={{ display: 'inline-flex' }}
      onClick={() => {
        if (!disabled && triggers.includes('click')) setVisibility(!current);
      }}
      onMouseEnter={() => {
        if (disabled || !triggers.includes('hover')) return;
        hoverTimer.current = setTimeout(() => setVisibility(true), rest.mouseEnterDelay ?? 0.1);
      }}
      onMouseLeave={() => {
        if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
        if (triggers.includes('hover')) setVisibility(false);
      }}
      onFocus={() => {
        if (!disabled && triggers.includes('focus')) setVisibility(true);
      }}
    >
      {rest.children}
    </span>
  );

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
