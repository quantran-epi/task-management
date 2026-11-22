import type { BreadcrumbProps as AntBreadcrumbProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { classNames } from './native/classNames';
import menuStyles from './openidea/Menu.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type BreadcrumbProps = AntBreadcrumbProps;

type Crumb = NonNullable<AntBreadcrumbProps['items']>[number];

/** Native breadcrumb item; keeps href and children semantics from caller items. */
export const BreadcrumbItem = function BreadcrumbItem({
  title,
  href,
  children,
  className,
  style,
  ...rest
}: {
  title?: ReactNode;
  href?: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
} & Record<string, unknown>) {
  void rest;
  const content = children ?? title;
  const current = rest['aria-current'] === 'page';
  return (
    <li
      className={classNames(menuStyles.item, className)}
      data-oi-control="breadcrumb-item"
      data-state={current ? 'selected' : 'default'}
      aria-current={current ? 'page' : undefined}
      style={style}
    >
      {href !== undefined ? <a href={href}>{content}</a> : <span>{content}</span>}
    </li>
  );
};

/** Separator is presentational; callers may override the default '/'. */
export const BreadcrumbSeparator = function BreadcrumbSeparator({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <li
      aria-hidden="true"
      className={classNames(menuStyles.separator, className)}
      data-oi-control="breadcrumb-separator"
      data-state="default"
      style={style}
    >
      {children ?? '/'}
    </li>
  );
};

function itemOf(child: ReactNode): { key?: string | number; type: unknown; props: Record<string, unknown> } | null {
  if (child === null || typeof child !== 'object' || !('props' in child)) return null;
  return child as { key?: string | number; type: unknown; props: Record<string, unknown> };
}

/** Native N-04 breadcrumb; last item is the current page. */
export function Breadcrumb({ style, items, children, separator = '/', className, ...rest }: BreadcrumbProps) {
  void rest;
  const { fontSize, paddingInline } = getSharedControlTokens();
  const crumbs: Crumb[] = [];
  let explicitSeparator: ReactNode | undefined;
  for (const item of items ?? []) {
    crumbs.push({
      key: item.key,
      title: item.title,
      href: item.href,
      className: item.className,
      style: item.style,
      path: item.path,
    } as Crumb);
  }
  for (const child of Array.isArray(children) ? children.flat() : children ? [children] : []) {
    const element = itemOf(child);
    if (!element || element.type === BreadcrumbSeparator) {
      if (element) explicitSeparator = element.props.children as ReactNode;
      else explicitSeparator = child;
      continue;
    }
    crumbs.push({
      key: element.key,
      title: element.props.title as ReactNode,
      href: element.props.href as string | undefined,
      className: element.props.className as string | undefined,
      style: element.props.style as CSSProperties | undefined,
    } as Crumb);
  }

  return (
    <nav
      aria-label="breadcrumb"
      className={className}
      data-oi-control="breadcrumb"
      data-state="default"
      style={
        {
          '--ui-breadcrumb-font-size': `${fontSize}px`,
          '--ui-breadcrumb-gap': paddingInline,
          ...style,
        } as CSSProperties
      }
    >
      <ol style={{ display: 'flex', listStyle: 'none', margin: 0, padding: 0 }}>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          const href = crumb.href ?? (typeof crumb.path === 'string' ? crumb.path : undefined);
          return (
            <span key={String(crumb.key ?? index)} style={{ display: 'contents' }}>
              <li
                // Current crumb carries aria-current="page" for the measurement hook.
                className={classNames(menuStyles.item, crumb.className)}
                data-oi-control="breadcrumb-item"
                data-state={last ? 'selected' : 'default'}
                aria-current={last ? 'page' : undefined}
                data-aria-current={last ? 'page' : undefined}
                data-current-token="page"
                style={crumb.style}
              >
                {href !== undefined
                  ? <a href={href} className={menuStyles.label}>{crumb.title}</a>
                  : <span className={menuStyles.label}>{crumb.title}</span>}
              </li>
              {last ? null : (
                <BreadcrumbSeparator>
                  {explicitSeparator ?? (typeof separator === 'string' || typeof separator === 'number' ? separator : '/')}
                </BreadcrumbSeparator>
              )}
            </span>
          );
        })}
      </ol>
    </nav>
  );
}
