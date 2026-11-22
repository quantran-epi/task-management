import type { CollapsePanelProps as AntCollapsePanelProps } from 'antd/es/collapse/CollapsePanel';
import type { CollapseProps as AntCollapseProps } from 'antd';
import {
  createContext,
  useContext,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { classNames } from './native/classNames';
import menuStyles from './openidea/Menu.module.css';
import tabStyles from './openidea/Tabs.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type CollapseProps = AntCollapseProps;

interface PanelDescriptor {
  key: string;
  header: ReactNode;
  children: ReactNode;
  disabled: boolean;
  className: string | undefined;
  style: CSSProperties | undefined;
  extra: ReactNode;
}

interface CollapseContextValue {
  active: string[];
  toggle: (key: string) => void;
}

const CollapseContext = createContext<CollapseContextValue | null>(null);

function normalizedKeys(value: AntCollapseProps['activeKey']): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((key) => String(key));
}

function isDisabled(item: { disabled?: boolean | undefined; collapsible?: string | undefined }): boolean {
  return item.disabled === true || item.collapsible === 'disabled';
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'none' }}
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Native N-06 panel; uses the surrounding Collapse store when mounted inside one. */
export const CollapsePanel = function CollapsePanel({
  key: panelKey,
  header,
  children,
  collapsible,
  className,
  style,
  extra,
}: AntCollapsePanelProps & { key?: string | number; disabled?: boolean; extra?: ReactNode }) {
  const context = useContext(CollapseContext);
  const key = String(panelKey ?? '');
  const disabled = isDisabled({ collapsible });
  const open = context?.active.includes(key) ?? false;
  return (
    <section
      className={classNames(menuStyles.popup, className)}
      data-oi-control="collapse"
      data-state={disabled ? 'disabled' : open ? 'expanded' : 'collapsed'}
      style={style}
    >
      <button
        type="button"
        className={classNames(tabStyles.tabButton, isDisabled({ collapsible }) && menuStyles.disabled)}
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        data-oi-control="collapse-header"
        data-state={disabled ? 'disabled' : open ? 'expanded' : 'collapsed'}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) context?.toggle(key);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            context?.toggle(key);
          }
        }}
      >
        <Chevron open={open} />
        <span className={menuStyles.label}>{header}</span>
        {extra}
      </button>
      {open && <div data-oi-control="collapse-content">{children}</div>}
    </section>
  );
};

function PanelView({ panel }: { panel: PanelDescriptor }) {
  const context = useContext(CollapseContext);
  const open = context?.active.includes(panel.key) ?? false;
  return (
    <section
      className={classNames(menuStyles.popup, panel.className)}
      data-oi-control="collapse"
      data-state={panel.disabled ? 'disabled' : open ? 'expanded' : 'collapsed'}
      style={panel.style}
    >
      <button
        type="button"
        className={classNames(tabStyles.tabButton, panel.disabled && menuStyles.disabled)}
        aria-expanded={open}
        aria-disabled={panel.disabled || undefined}
        disabled={panel.disabled}
        data-oi-control="collapse-header"
        data-state={panel.disabled ? 'disabled' : open ? 'expanded' : 'collapsed'}
        onClick={(event) => {
          event.stopPropagation();
          if (!panel.disabled) context?.toggle(panel.key);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          if (panel.disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            context?.toggle(panel.key);
          }
        }}
      >
        <Chevron open={open} />
        <span className={menuStyles.label}>{panel.header}</span>
        {panel.extra}
      </button>
      {open && <div data-oi-control="collapse-content">{panel.children}</div>}
    </section>
  );
}

/** Native accordion: `activeKey`/`defaultActiveKey` follow the controlled ternary. */
export function Collapse({ style, items, children, activeKey, defaultActiveKey, accordion, onChange, ...rest }: CollapseProps) {
  void rest;
  const { controlHeight, fontSize, paddingInline } = getSharedControlTokens();
  const [innerActive, setInnerActive] = useState<string[]>(() => normalizedKeys(defaultActiveKey));
  const active = activeKey === undefined ? innerActive : normalizedKeys(activeKey);

  const toggle = (key: string) => {
    const wasOpen = active.includes(key);
    const next = wasOpen
      ? active.filter((entry) => entry !== key)
      : accordion === true
        ? [key]
        : [...active, key];
    if (activeKey === undefined) setInnerActive(next);
    onChange?.(next);
  };

  const descriptors: PanelDescriptor[] = [];
  for (const item of items ?? []) {
    descriptors.push({
      key: String(item.key),
      header: item.label,
      children: item.children,
      disabled: isDisabled(item),
      className: item.className,
      style: item.style,
      extra: item.extra,
    });
  }
  for (const child of Array.isArray(children) ? children.flat() : children ? [children] : []) {
    if (child === null || typeof child !== 'object' || !('props' in child)) continue;
    const element = child as { key?: unknown; props: Omit<PanelDescriptor, 'key'> & { disabled?: boolean; collapsible?: string; key?: string | number } };
    if (element.props.header === undefined && element.props.children === undefined) continue;
    descriptors.push({
      key: String(element.key ?? element.props.key ?? descriptors.length),
      header: element.props.header,
      children: element.props.children,
      disabled: element.props.disabled === true || isDisabled(element.props),
      className: element.props.className,
      style: element.props.style,
      extra: element.props.extra,
    });
  }

  return (
    <CollapseContext.Provider value={{ active, toggle }}>
      <div
        className={menuStyles.menu}
        data-oi-control="collapse-root"
        data-state={active.length > 0 ? 'expanded' : 'collapsed'}
        style={
          {
            '--ui-control-height': `${controlHeight}px`,
            '--ui-control-font-size': `${fontSize}px`,
            '--ui-collapse-padding': `${paddingInline}px`,
            ...style,
          } as CSSProperties
        }
      >
        {descriptors.map((panel) => <PanelView key={panel.key} panel={panel} />)}
      </div>
    </CollapseContext.Provider>
  );
}
