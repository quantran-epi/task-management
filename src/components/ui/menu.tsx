import type { MenuProps as AntMenuProps } from 'antd';
import {
  Children,
  isValidElement,
  useId,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { classNames } from './native/classNames';
import menuStyles from './openidea/Menu.module.css';
import { getSharedControlTokens, getStatusTokens } from './tokens.contract';

export type { MenuProps, MenuItemProps, MenuRef, MenuTheme } from 'antd';

export interface MenuWrapperProps extends AntMenuProps {
  /** Compact row height comes from the shared control height metric. */
  compact?: boolean;
}

/** AntD MenuInfo shape. Native methods on the real event stay alive (RR-02). */
export interface MenuClickInfo {
  key: string;
  keyPath: string[];
  domEvent: MouseEvent;
  item: { key: string };
  itemData: Record<string, never>;
}

type ItemKind = 'item' | 'divider' | 'group' | 'submenu';

interface RenderItem {
  domId: string;
  key: string;
  kind: ItemKind;
  label: ReactNode | undefined;
  icon: ReactNode | undefined;
  danger: boolean | undefined;
  disabled: boolean | undefined;
  onClick: ((info: MenuClickInfo) => void) | undefined;
}

interface StaticItemProps {
  key?: React.Key;
  type?: string;
  label?: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onClick?: (info: MenuClickInfo) => void;
}

/** Add AntD's key/keyPath/domEvent onto the ORIGINAL event, never a synthetic object (53-REVIEW RR-02). */
function withMenuInfo(event: ReactMouseEvent<HTMLElement>, key: string): ReactMouseEvent<HTMLElement> & MenuClickInfo {
  const info = event as ReactMouseEvent<HTMLElement> & MenuClickInfo;
  const define = (name: string, value: unknown) => {
    if (!Object.prototype.hasOwnProperty.call(info, name)) {
      Object.defineProperty(info, name, { value, configurable: true, enumerable: true });
    }
  };
  define('key', key);
  define('keyPath', [key]);
  define('domEvent', event.nativeEvent);
  define('item', { key });
  define('itemData', {});
  return info;
}

function keyOf(value: React.Key | undefined, fallback: number): string {
  return value === undefined || value === null ? `item-${fallback}` : String(value);
}

/** Flatten AntD `items` + self-built static children into one measurable list. */
function collectItems(items: AntMenuProps['items'], children: ReactNode, idBase: string): RenderItem[] {
  const result: RenderItem[] = [];
  let index = 0;
  const pushNode = (node: unknown) => {
    if (node === null || node === undefined || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(pushNode); return; }
    const element = node as ReactElement<StaticItemProps>;
    // `items[]` entries are plain AntD ItemType objects; static children are React elements.
    const props = (isValidElement<StaticItemProps>(node) ? element.props : node) as StaticItemProps | null;
    if (!props || typeof props !== 'object') return;
    const key = keyOf((isValidElement(node) ? element.key : undefined) ?? props.key, index);
    const kind: ItemKind = props.type === 'divider' ? 'divider'
      : props.type === 'group' ? 'group'
      : props.type === 'submenu' ? 'submenu' : 'item';
    result.push({
      domId: `${idBase}-item-${index}`,
      key,
      kind,
      label: props.label,
      icon: props.icon,
      danger: props.danger,
      disabled: props.disabled,
      onClick: props.onClick,
    });
    index += 1;
    if (kind === 'group' || kind === 'submenu') Children.forEach(props.children, pushNode);
  };
  (items ?? []).forEach((item) => pushNode(item));
  Children.forEach(children, pushNode);
  return result;
}

/** Native S-MNU: vendored Menu.module.css DOM, AntD API/statics unchanged. */
export function Menu({ compact = true, style, ...rest }: MenuWrapperProps) {
  void compact;
  const idBase = useId();
  const { controlHeight, fontSize, iconSize } = getSharedControlTokens();
  const dangerColor = getStatusTokens('danger');
  const rendered = collectItems(rest.items, rest.children, idBase);
  const selectedKeys = Array.isArray(rest.selectedKeys) ? rest.selectedKeys.map(String) : [];
  const nav = rendered.filter((item) => item.kind === 'item' && item.disabled !== true);
  const [lead, setLead] = useState(0);
  const activeLead = nav.length === 0 ? undefined : nav[Math.min(lead, nav.length - 1)];

  const menuStyle = {
    '--ui-menu-row-height': `${(compact ? 24 : controlHeight)}px`,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-menu-icon-size': iconSize,
    ...style,
  } as CSSProperties;

  function activate(item: RenderItem, event: ReactMouseEvent<HTMLElement>) {
    if (item.disabled === true || item.kind !== 'item') return;
    const info = withMenuInfo(event, item.key);
    item.onClick?.(info);
    (rest.onClick as ((info: MenuClickInfo) => void) | undefined)?.(info);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (nav.length === 0) return;
      event.preventDefault();
      setLead((current) => {
        if (event.key === 'ArrowDown') return Math.min(nav.length - 1, current + 1);
        return Math.max(0, current - 1);
      });
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (!activeLead) return;
      event.preventDefault();
      document.getElementById(activeLead.domId)?.click();
    } else {
      // Popup helper owns Escape/outside close in 54-03; forward so an enclosing Popup can react.
      (rest.onKeyDown as ((event: KeyboardEvent<HTMLDivElement>) => void) | undefined)?.(event);
    }
  }

  return (
    <div
      id={rest.id}
      className={classNames(menuStyles.menu, rest.className)}
      style={menuStyle}
      role="menu"
      tabIndex={0}
      aria-label={rest['aria-label'] as string | undefined}
      aria-activedescendant={activeLead?.domId}
      data-oi-control="menu"
      data-state="expanded"
      onKeyDown={handleKeyDown}
    >
      {rendered.map((item) => {
        if (item.kind === 'divider') {
          return (
            <div
              key={item.domId}
              className={menuStyles.separator}
              role="separator"
              data-oi-control="menu-divider"
              data-state="default"
            />
          );
        }
        if (item.kind === 'group' || item.kind === 'submenu') {
          return (
            <div
              key={item.domId}
              className={menuStyles.menuHeading}
              data-oi-control="menu-heading"
              data-state="default"
            >
              {item.label}
            </div>
          );
        }
        const active = selectedKeys.includes(item.key);
        const disabled = item.disabled === true;
        const state = active ? 'selected' : disabled ? 'disabled' : 'default';
        return (
          <div
            key={item.domId}
            id={item.domId}
            className={classNames(
              menuStyles.item,
              (active || item.danger) && menuStyles.active,
              disabled && menuStyles.disabled,
              item.danger && menuStyles.danger,
            )}
            style={item.danger ? ({ '--ui-status-color': dangerColor } as CSSProperties) : undefined}
            role="menuitem"
            aria-disabled={disabled || undefined}
            data-oi-control="menu-item"
            data-state={state}
            data-lead={activeLead?.domId === item.domId || undefined}
            onClick={(event) => activate(item, event)}
            onPointerMove={() => {
              const position = nav.findIndex((candidate) => candidate.domId === item.domId);
              if (position >= 0) setLead(position);
            }}
          >
            {item.icon ? <span className={menuStyles.icon} aria-hidden="true">{item.icon}</span> : null}
            <span className={menuStyles.label}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function StaticItem({ children }: { children?: ReactNode }) {
  return <>{children ?? null}</>;
}

/** Self-built statics — values defined here, never re-exported from AntD (no pass-through). */
export const MenuItem = StaticItem;
export const MenuSubMenu = StaticItem;
export const MenuItemGroup = StaticItem;
