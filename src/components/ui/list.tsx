import type { ListProps as AntListProps } from 'antd';
import type { ListItemProps as AntListItemProps, ListItemMetaProps as AntListItemMetaProps } from 'antd/es/list/Item';
import {
  isValidElement,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { classNames } from './native/classNames';
import listStyles from './openidea/List.module.css';
import spinnerStyles from './openidea/Spinner.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type ListProps<T> = AntListProps<T>;

/** Native statics keep AntD's full prop surface (actions, onClick, data-* …) so callers stay untouched. */
function ListItemImpl({ children, className, style, classNames: _classNames, styles: _styles, extra: _extra, actions: _actions, colStyle: _colStyle, prefixCls: _prefixCls, ...domProps }: AntListItemProps) {
  void _classNames; void _styles; void _extra; void _actions; void _colStyle; void _prefixCls;
  return <div {...domProps} className={classNames(listStyles.row, className)} style={style}>{children}</div>;
}
function ListItemMetaImpl({ title, description, avatar, className, style, prefixCls: _prefixCls, children: _children }: AntListItemMetaProps) {
  void _prefixCls; void _children;
  return (
    <div className={classNames(listStyles.row, className)} style={style}>
      {avatar ? <span className={listStyles.section}>{avatar}</span> : null}
      {title ? <span>{title}</span> : null}
      {description ? <span className={listStyles.section}>{description}</span> : null}
    </div>
  );
}
export const ListItem = ListItemImpl as typeof ListItemImpl & {
  Meta: typeof ListItemMetaImpl;
};
ListItem.Meta = ListItemMetaImpl;
export const ListItemMeta = ListItemMetaImpl;

function rowKey(item: unknown, index: number, rowKeyProp: AntListProps<unknown>['rowKey']): string {
  const source = item as { id?: unknown; key?: unknown } | null | undefined;
  const fromProp = typeof rowKeyProp === 'function' ? rowKeyProp(item as never)
    : typeof rowKeyProp === 'string' ? (source as Record<string, unknown> | null)?.[rowKeyProp]
    : source?.key ?? source?.id;
  return fromProp === undefined || fromProp === null ? `row-${index}` : String(fromProp);
}

/** Native S-LST: 24px absolute rows + sizer; generic <T> preserved for callers. */
export function List<T>({ style, ...rest }: ListProps<T>) {
  const { controlHeight, fontSize } = getSharedControlTokens();
  const items = (rest.dataSource ?? []) as T[];
  const render = rest.renderItem as ((item: T, index: number) => ReactNode) | undefined;
  const loading = rest.loading === true;
  const emptyNode = rest.locale?.emptyText
    ?? (rest as { empty?: ReactNode }).empty
    ?? (items.length === 0 ? rest.children : null);

  const tokenStyle = {
    '--ui-list-row-height': `${controlHeight}px`,
    '--ui-list-font-size': `${fontSize}px`,
  } as CSSProperties;

  return (
    <div
      className={classNames(listStyles.list, rest.className)}
      style={{ ...tokenStyle, ...style }}
      data-oi-control="list"
      data-state={loading ? 'loading' : items.length === 0 ? 'empty' : 'default'}
      aria-busy={loading || undefined}
    >
      {loading ? <div className={spinnerStyles.spinner} role="status" aria-label="Đang tải" data-oi-control="spinner" /> : null}
      {items.length === 0 ? (
        <div className={listStyles.emptyWrap} data-oi-control="list-empty" data-state="empty">
          {emptyNode}
        </div>
      ) : (
        <div className={listStyles.sizer} style={{ height: items.length * 24 }}>
          {items.map((item, index) => {
            const content = render
              ? render(item, index)
              : isValidElement(item) ? item : String(item ?? '');
            return (
              <div
                key={rowKey(item, index, rest.rowKey as AntListProps<unknown>['rowKey'])}
                className={listStyles.row}
                role="option"
                aria-selected={false}
                data-oi-control="list-row"
                data-state="default"
                style={{ transform: `translateY(${index * 24}px)`, height: 24 }}
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
      {rest.footer ?? null}
      {items.length > 0 ? rest.children ?? null : null}
    </div>
  );
}
