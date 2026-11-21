import type { TabsProps as AntTabsProps } from 'antd';
import {
  Children,
  isValidElement,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { classNames } from './native/classNames';
import tabStyles from './openidea/Tabs.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type TabsProps = AntTabsProps;

interface TabItem {
  key: string;
  label: ReactNode;
  children: ReactNode;
  disabled: boolean;
  closable: boolean;
  closeIcon: ReactNode;
}

interface TabPaneProps {
  key?: React.Key;
  tab?: ReactNode;
  label?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  closable?: boolean;
  closeIcon?: ReactNode;
  forceRender?: boolean;
}

function collectTabs(items: AntTabsProps['items'], children: ReactNode): TabItem[] {
  const result: TabItem[] = [];
  (items ?? []).forEach((item, index) => {
    const source = item as TabPaneProps;
    result.push({
      key: String(source.key ?? index),
      label: source.label ?? source.tab,
      children: (source as { children?: ReactNode }).children,
      disabled: (source as { disabled?: boolean }).disabled === true,
      closable: (source as { closable?: boolean }).closable === true,
      closeIcon: (source as { closeIcon?: ReactNode }).closeIcon,
    });
  });
  Children.forEach(children, (child, index) => {
    if (!isValidElement<TabPaneProps>(child)) return;
    const props = child.props;
    result.push({
      key: String(child.key ?? props.key ?? index),
      label: props.label ?? props.tab,
      children: props.children,
      disabled: props.disabled === true,
      closable: props.closable === true,
      closeIcon: props.closeIcon,
    });
  });
  return result;
}

/** Keep the AntD `key/keyPath/domEvent` shape while preserving native methods. */
function tabInfo(event: ReactMouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, key: string) {
  const info = event as ReactMouseEvent<HTMLElement> & {
    key: string; keyPath: string[]; domEvent: Event; item: { key: string }; itemData: Record<string, never>;
  };
  const define = (name: string, value: unknown) => {
    if (!Object.prototype.hasOwnProperty.call(info, name)) {
      Object.defineProperty(info, name, { value, configurable: true, enumerable: true });
    }
  };
  define('key', key);
  define('keyPath', [key]);
  define('domEvent', 'nativeEvent' in event ? event.nativeEvent : event);
  define('item', { key });
  define('itemData', {});
  return info;
}

/** Self-built TabPane static — value defined here, never re-exported from AntD (no pass-through). */
export function TabPane(_props: TabPaneProps) { return null; }

/** Native S-TAB: vendored Tabs.module.css strip; Arrow lead, closable, caller styles.root wins. */
export function Tabs({ styles, ...rest }: TabsProps) {
  const { controlHeight, fontSize, paddingInline } = getSharedControlTokens();
  const tabs = collectTabs(rest.items, rest.children);
  const listRef = useRef<HTMLDivElement>(null);
  const controlled = rest.activeKey !== undefined;
  const fallback = rest.defaultActiveKey ?? tabs.find((tab) => !tab.disabled)?.key;
  const [innerActive, setInnerActive] = useState<string | undefined>(fallback);
  const active = controlled ? String(rest.activeKey) : innerActive;
  const vertical = rest.tabPosition === 'left' || rest.tabPosition === 'right';

  const stylesObject = typeof styles === 'object' ? styles : undefined;
  const rootStyle = stylesObject?.root;
  const metrics = {
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-tab-gutter': `${paddingInline}px`,
    ...rootStyle,
  } as CSSProperties;

  function choose(tab: TabItem, event: ReactMouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) {
    if (tab.disabled) return;
    if (!controlled) setInnerActive(tab.key);
    rest.onChange?.(tab.key);
    (rest.onTabClick as ((key: string, info: unknown) => void) | undefined)?.(tab.key, tabInfo(event, tab.key));
  }

  function move(delta: number, event: KeyboardEvent<HTMLButtonElement>) {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
    if (buttons.length === 0) return;
    const current = buttons.findIndex((button) => button.getAttribute('aria-selected') === 'true');
    const next = buttons[(current + delta + buttons.length) % buttons.length];
    next?.focus();
    const tab = tabs[buttons.indexOf(next!)];
    if (tab && !tab.disabled) choose(tab, event);
  }

  function close(event: ReactMouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) {
    event.stopPropagation();
    // AntD TabsOnEdit signature: (event, 'add' | 'remove').
    (rest.onEdit as ((event: unknown, action: 'remove') => void) | undefined)?.(event, 'remove');
  }

  return (
    <div
      className={classNames(tabStyles.strip, rest.className, vertical && tabStyles.vertical)}
      style={{ ...metrics, ...rest.style }}
      data-oi-control="tabs"
      data-state="default"
    >
      <div
        ref={listRef}
        role="tablist"
        aria-label={rest['aria-label'] as string | undefined}
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        className={tabStyles.scroller}
      >
        {tabs.map((tab) => {
          const selected = tab.key === active;
          const closable = tab.closable || rest.type === 'editable-card';
          return (
            <div
              key={tab.key}
              className={classNames(tabStyles.tab, selected && tabStyles.selected, closable && tabStyles.closable)}
              data-oi-control="tab"
              data-state={selected ? 'selected' : tab.disabled ? 'disabled' : 'default'}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                disabled={tab.disabled}
                className={tabStyles.tabButton}
                onClick={(event) => choose(tab, event)}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                  const forward = vertical ? event.key === 'ArrowDown' : event.key === 'ArrowRight';
                  const backward = vertical ? event.key === 'ArrowUp' : event.key === 'ArrowLeft';
                  if (forward) { event.preventDefault(); move(1, event); }
                  else if (backward) { event.preventDefault(); move(-1, event); }
                  else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(tab, event); }
                }}
              >
                <span className={tabStyles.tabLabel}>{tab.label}</span>
                {closable ? (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Đóng ${typeof tab.label === 'string' ? tab.label : tab.key}`}
                    className={tabStyles.close}
                    onClick={close}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') close(event);
                    }}
                  >
                    {tab.closeIcon ?? '×'}
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
      {tabs.find((tab) => tab.key === active)?.children ?? null}
    </div>
  );
}
