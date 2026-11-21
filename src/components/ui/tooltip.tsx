import type { TooltipProps as AntTooltipProps } from 'antd';
import {
  cloneElement,
  isValidElement,
  useEffect,
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
import tooltipStyles from './openidea/Tooltip.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type { TooltipProps } from 'antd';
export type { TooltipPlacement } from 'antd/es/tooltip';

export interface TooltipWrapperProps extends AntTooltipProps {
  /** Max popup width derived from the control height; callers pick a scale, never raw CSS. */
  widthScale?: 'md' | 'lg';
}

const WIDTH_SCALE = { md: 18, lg: 28 } as const;

function triggerOf(children: ReactNode): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(children)) return triggerOf(children[0]);
  return isValidElement<Record<string, unknown>>(children) ? children : null;
}

function titleText(title: ReactNode | ((...args: never[]) => ReactNode)): ReactNode {
  if (title === null || title === undefined || title === '' || typeof title === 'function') return null;
  return title;
}

/** Native S-TT: BODY-portal tooltip with hover/focus delay and caller overlayStyle precedence. */
export function Tooltip({ widthScale = 'md', overlayStyle, ...rest }: TooltipWrapperProps) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const anchorRef = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const text = titleText(rest.title);
  const delay = rest.mouseEnterDelay ?? 0.15;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function show() {
    if (text === null || rest.disabled === true || timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      setOpen(true);
    }, delay * 1000);
  }
  function hide() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setOpen(false);
  }

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
    onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => {
      (anchor.props.onMouseEnter as ((event: ReactMouseEvent<HTMLElement>) => void) | undefined)?.(event);
      show();
    },
    onMouseLeave: (event: ReactMouseEvent<HTMLElement>) => {
      (anchor.props.onMouseLeave as ((event: ReactMouseEvent<HTMLElement>) => void) | undefined)?.(event);
      hide();
    },
    onFocus: (event: ReactFocusEvent<HTMLElement>) => {
      (anchor.props.onFocus as ((event: ReactFocusEvent<HTMLElement>) => void) | undefined)?.(event);
      show();
    },
    onBlur: (event: ReactFocusEvent<HTMLElement>) => {
      (anchor.props.onBlur as ((event: ReactFocusEvent<HTMLElement>) => void) | undefined)?.(event);
      hide();
    },
  }) : rest.children;

  return (
    <>
      {trigger}
      <Popup
        open={open && text !== null}
        anchorRef={anchorRef}
        onClose={hide}
        className={classNames(tooltipStyles.tooltip, 'tooltip')}
        control="tooltip"
        label={typeof text === 'string' ? text : 'Tooltip'}
      >
        <div className={tooltipStyles.text} style={style} data-placed="" data-oi-control="tooltip">
          {text}
        </div>
      </Popup>
    </>
  );
}
