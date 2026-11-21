import type { DropdownProps as AntDropdownProps, MenuProps as AntMenuProps } from 'antd';
import {
  cloneElement,
  isValidElement,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Popup } from './native/popup';
import { Menu, type MenuClickInfo } from './menu';
import menuStyles from './openidea/Menu.module.css';
import selectStyles from './openidea/Select.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type DropdownProps = AntDropdownProps;

interface DropdownButtonProps {
  children?: ReactNode;
  icon?: ReactNode;
  type?: string;
  disabled?: boolean;
  onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
  [key: string]: unknown;
}

/** Self-built AntD Dropdown.Button shape: action button + chevron. */
export function DropdownButton({ children, icon, type, disabled, onClick, ...rest }: DropdownButtonProps) {
  return (
    <span className={selectStyles.trigger} data-oi-control="dropdown-button" data-state={disabled ? 'disabled' : 'default'}>
      <button type="button" disabled={disabled} onClick={onClick} {...rest}>
        {icon}{children}
      </button>
      <span aria-hidden="true" className={selectStyles.chevron}>▾</span>
    </span>
  );
}

function triggerOf(children: ReactNode): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(children)) return triggerOf(children[0]);
  return isValidElement<Record<string, unknown>>(children) ? children : null;
}

/** Native S-SEL/S-MNU dropdown: click/hover/focus/contextMenu trigger + BODY portal menu. */
export function Dropdown({ styles, ...rest }: DropdownProps) {
  const { borderRadius, controlHeight, fontSize } = getSharedControlTokens();
  const anchorRef = useRef<HTMLElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const current = rest.open !== undefined ? rest.open : open;
  const triggers = (rest.trigger ?? ['hover']) as string[];
  const disabled = rest.disabled === true;
  const onOpenChange = rest.onOpenChange as ((open: boolean) => void) | undefined;

  const setVisibility = useCallback((next: boolean) => {
    if (!next && hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    if (current === next) return;
    if (rest.open === undefined) setOpen(next);
    onOpenChange?.(next);
  }, [current, rest.open, onOpenChange]);
  const close = useCallback(() => setVisibility(false), [setVisibility]);

  function startHover() {
    if (disabled || !triggers.includes('hover')) return;
    hoverTimer.current = setTimeout(() => setVisibility(true), rest.mouseEnterDelay);
  }
  function stopHover() {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    if (triggers.includes('hover')) setVisibility(false);
  }

  const callerRoot = styles && typeof styles === 'object' && 'root' in styles ? styles.root : undefined;
  const menuMetrics = {
    '--ui-control-radius': `${borderRadius}px`,
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-font-size': `${fontSize}px`,
    ...callerRoot,
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
    'data-oi-control': 'dropdown-trigger',
    onClick: (event: ReactMouseEvent<HTMLElement>) => {
      (anchor.props.onClick as ((event: ReactMouseEvent<HTMLElement>) => void) | undefined)?.(event);
      if (!disabled && triggers.includes('click')) setVisibility(!current);
    },
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
      (anchor.props.onContextMenu as ((event: ReactMouseEvent<HTMLElement>) => void) | undefined)?.(event);
      if (!disabled && triggers.includes('contextMenu')) {
        event.preventDefault();
        setVisibility(true);
      }
    },
    onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => {
      (anchor.props.onMouseEnter as ((event: ReactMouseEvent<HTMLElement>) => void) | undefined)?.(event);
      startHover();
    },
    onMouseLeave: (event: ReactMouseEvent<HTMLElement>) => {
      (anchor.props.onMouseLeave as ((event: ReactMouseEvent<HTMLElement>) => void) | undefined)?.(event);
      stopHover();
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      (anchor.props.onFocus as ((event: React.FocusEvent<HTMLElement>) => void) | undefined)?.(event);
      if (!disabled && triggers.includes('focus')) setVisibility(true);
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      (anchor.props.onKeyDown as ((event: ReactKeyboardEvent<HTMLElement>) => void) | undefined)?.(event);
      if (event.key === 'ArrowDown' && !disabled) { event.preventDefault(); setVisibility(true); }
    },
  }) : rest.children;

  const menuProps = rest.menu ?? {};
  const menuOnClick = menuProps.onClick as ((info: MenuClickInfo) => void) | undefined;
  const dropdownOnClick = 'onClick' in rest ? (rest.onClick as ((info: MenuClickInfo) => void) | undefined) : undefined;
  const handleMenuClick: ((info: MenuClickInfo) => void) | undefined =
    menuOnClick || dropdownOnClick
      ? (info: MenuClickInfo) => {
          menuOnClick?.(info);
          dropdownOnClick?.(info);
        }
      : undefined;

  return (
    <>
      {trigger}
      <Popup
        open={current && !disabled}
        anchorRef={anchorRef}
        onClose={close}
        className={menuStyles.popup ?? ''}
        control="dropdown-popup"
        label="Menu"
      >
        <div style={menuMetrics} className={menuStyles.popup}>
          <Menu
            {...menuProps as AntMenuProps}
            {...(handleMenuClick ? { onClick: handleMenuClick as unknown as NonNullable<AntMenuProps['onClick']> } : {})}
          />
        </div>
      </Popup>
    </>
  );
}
