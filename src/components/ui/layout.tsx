import type {
  LayoutProps as AntLayoutProps,
  SiderProps as AntSiderProps,
} from 'antd';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { classNames } from './native/classNames';
import { getSharedControlTokens } from './tokens.contract';

export type LayoutProps = AntLayoutProps;
export type SiderProps = AntSiderProps;

type Landmark = 'header' | 'footer' | 'main' | 'aside';

/** Token-derived structural heights; caller style wins. */
function layoutStyle(): CSSProperties {
  const { controlHeight, paddingInline } = getSharedControlTokens();
  return {
    '--ui-layout-row-height': `${controlHeight}px`,
    '--ui-layout-gutter': paddingInline,
  } as CSSProperties;
}

function LandmarkBlock({
  landmark,
  children,
  style,
  className,
  ...rest
}: Omit<AntLayoutProps, 'children'> & { landmark: Landmark; children?: ReactNode }) {
  const shared = {
    className,
    style: { ...layoutStyle(), ...style },
    ...rest,
  } as React.HTMLAttributes<HTMLElement>;
  if (landmark === 'header') return <header data-oi-control="layout-header" {...shared}>{children}</header>;
  if (landmark === 'footer') return <footer data-oi-control="layout-footer" {...shared}>{children}</footer>;
  if (landmark === 'aside') return <aside data-oi-control="layout-aside" {...shared}>{children}</aside>;
  return <main data-oi-control="layout-content" {...shared}>{children}</main>;
}

export function LayoutHeader(props: AntLayoutProps) {
  return <LandmarkBlock landmark="header" {...props} />;
}

export function LayoutFooter(props: AntLayoutProps) {
  return <LandmarkBlock landmark="footer" {...props} />;
}

export function LayoutContent(props: AntLayoutProps) {
  return <LandmarkBlock landmark="main" {...props} />;
}

/** Native sider with collapse trigger and `data-state` measurement hook. */
export function LayoutSider({
  collapsed,
  defaultCollapsed,
  onCollapse,
  width = 200,
  style,
  className,
  children,
  ...rest
}: SiderProps) {
  const [innerCollapsed, setInnerCollapsed] = useState(defaultCollapsed ?? false);
  const isCollapsed = collapsed ?? innerCollapsed;
  const toggle = () => {
    const next = !isCollapsed;
    if (collapsed === undefined) setInnerCollapsed(next);
    onCollapse?.(next, 'clickTrigger');
  };
  const siderStyle = {
    ...layoutStyle(),
    width: isCollapsed ? 48 : width,
    ...style,
  } as CSSProperties;
  const nativeProps = {
    className: classNames(className),
    style: siderStyle,
    ...rest,
  } as React.HTMLAttributes<HTMLElement>;
  return (
    <aside data-oi-control="layout-sider" data-state={isCollapsed ? 'collapsed' : 'expanded'} {...nativeProps}>
      <button
        type="button"
        data-oi-control="layout-sider-trigger"
        aria-label={isCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
        aria-expanded={!isCollapsed}
        onClick={toggle}
      >
        {isCollapsed ? '»' : '«'}
      </button>
      {children}
    </aside>
  );
}

/** Native Layout shell; landmark statics are caller-composed as children. */
export function Layout({ style, children, ...rest }: LayoutProps) {
  const nativeProps = { style: { ...layoutStyle(), ...style }, ...rest } as React.HTMLAttributes<HTMLDivElement>;
  return <div data-oi-control="layout" {...nativeProps}>{children}</div>;
}
