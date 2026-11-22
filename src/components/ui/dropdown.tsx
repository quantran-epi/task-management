import type { DropdownProps as AntDropdownProps, MenuProps as AntMenuProps } from 'antd';
import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { Popup, preferredSide } from './native/popup';
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

  // Anchor is a real DOM wrapper: callers pass function-component buttons that
  // cannot accept a ref, and event delegation keeps their own handlers intact.
  const trigger = (
    <span
      ref={anchorRef}
      data-state={current ? 'expanded' : 'collapsed'}
      data-oi-control="dropdown-trigger"
      style={{ display: 'inline-flex' }}
      onClick={(event: ReactMouseEvent<HTMLElement>) => {
        if (!disabled && triggers.includes('click')) setVisibility(!current);
        void event;
      }}
      onContextMenu={(event: ReactMouseEvent<HTMLElement>) => {
        if (!disabled && triggers.includes('contextMenu')) {
          event.preventDefault();
          setVisibility(true);
        }
      }}
      onMouseEnter={startHover}
      onMouseLeave={stopHover}
      onFocus={() => {
        if (!disabled && triggers.includes('focus')) setVisibility(true);
      }}
      onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
        if (event.key === 'ArrowDown' && !disabled) { event.preventDefault(); setVisibility(true); }
      }}
    >
      {rest.children}
    </span>
  );

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
        preferredPlacement={preferredSide(rest.placement)}
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
