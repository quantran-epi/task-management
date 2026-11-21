import type { TreeSelectProps as AntTreeSelectProps } from 'antd';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { classNames } from './native/classNames';
import { Popup } from './native/popup';
import inputStyles from './openidea/Input.module.css';
import selectStyles from './openidea/Select.module.css';
import { Tree } from './tree';
import { getSharedControlTokens } from './tokens.contract';

export type { TreeSelectProps, TreeDataNode } from 'antd';
export type { SelectValue } from 'antd/es/tree-select';

export interface TreeSelectWrapperProps extends AntTreeSelectProps {
  width?: 'full' | 'auto';
}

interface StaticNodeProps {
  key?: React.Key;
  title?: ReactNode;
  children?: ReactNode;
  value?: string | number;
}

/** Self-built static tree node; callers may use it instead of `treeData`. */
export function TreeSelectNode(_props: StaticNodeProps) {
  return null;
}

/** Static strategy values, wrapper-defined rather than re-exported from AntD. */
export const TreeSelectSHOW_ALL = 'SHOW_ALL';
export const TreeSelectSHOW_CHILD = 'SHOW_CHILD';
export const TreeSelectSHOW_PARENT = 'SHOW_PARENT';

type Strategy = typeof TreeSelectSHOW_ALL | typeof TreeSelectSHOW_CHILD | typeof TreeSelectSHOW_PARENT;

function keyOf(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

/** Native S-SEL + S-TR tree select: combobox trigger, portal tree, AntD payloads. */
export function TreeSelect({ width = 'full', style, ...rest }: TreeSelectWrapperProps) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const anchorRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const controlled = rest.value !== undefined;
  const rawValue = rest.value;
  const initial = Array.isArray(rawValue) ? rawValue.map(keyOf) : rawValue === undefined || rawValue === null ? [] : [keyOf(rawValue)];
  const [innerKeys, setInnerKeys] = useState<string[]>(initial);
  useEffect(() => {
    setInnerKeys(Array.isArray(rawValue) ? rawValue.map(keyOf) : rawValue === undefined || rawValue === null ? [] : [keyOf(rawValue)]);
  }, [rawValue]);
  const keys = controlled ? initial : innerKeys;

  const data = rest.treeData ?? [];
  const titleByKey = new Map<string, ReactNode>();
  const visit = (nodes: typeof data) => {
    nodes.forEach((node) => {
      titleByKey.set(keyOf(node.value ?? node.key), node.title as ReactNode);
      if (Array.isArray(node.children)) visit(node.children as typeof data);
    });
  };
  visit(data);

  const strategy = rest.showCheckedStrategy as Strategy | undefined;
  const reportKeys = useMemo(() => {
    if (strategy !== TreeSelectSHOW_CHILD) return keys;
    // Keep only child keys when the caller asks for SHOW_CHILD.
    const parents = new Set<string>();
    const walk = (nodes: typeof data) => nodes.forEach((node) => {
      if (Array.isArray(node.children) && node.children.length > 0) {
        parents.add(keyOf(node.value ?? node.key));
        walk(node.children as typeof data);
      }
    });
    walk(data);
    return keys.filter((key) => !parents.has(key));
  }, [keys, strategy, data]);

  const disabled = rest.disabled === true;
  const selectedTitle = keys.length === 0
    ? rest.placeholder ?? null
    : rest.treeCheckable === true
      ? `${keys.length} mục`
      : titleByKey.get(keys[0]!) ?? keys[0];
  const renderedStyle = {
    width: width === 'full' ? '100%' : undefined,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-radius': `${borderRadius}px`,
    ...style,
  } as CSSProperties;

  function commit(nextKeys: string[]) {
    if (!controlled) setInnerKeys(nextKeys);
    const value = (rest.treeCheckable === true ? reportKeys : nextKeys[0] ?? undefined) as never;
    const labels = nextKeys.map((key) => titleByKey.get(key) ?? key) as never;
    (rest.onChange as ((value: never, labels: never, extra: unknown) => void) | undefined)?.(
      value,
      labels,
      { checkedNodes: nextKeys, triggerType: 'tree' },
    );
    if (rest.treeCheckable !== true) setOpen(false);
  }

  return (
    <>
      <input
        ref={anchorRef}
        type="text"
        readOnly
        role="combobox"
        aria-expanded={open}
        aria-controls="tree-select-popup"
        aria-label={rest['aria-label'] as string | undefined}
        placeholder={rest.placeholder as string | undefined}
        disabled={disabled}
        value={selectedTitle === null ? '' : String(selectedTitle)}
        className={classNames(inputStyles.input, inputStyles.framed, selectStyles.trigger, selectStyles.treeIndent)}
        style={renderedStyle}
        data-oi-control="tree-select"
        data-state={open ? 'expanded' : 'collapsed'}
        onClick={() => { if (!disabled) setOpen(!open); }}
        onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); }
          if (event.key === 'Escape') setOpen(false);
        }}
      />
      {rest.allowClear === true && !disabled && keys.length > 0 ? (
        <button type="button" aria-label="Xóa lựa chọn" onClick={() => commit([])}>×</button>
      ) : null}
      <Popup
        open={open && !disabled}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        className={selectStyles.popup ?? ''}
        control="tree-select-popup"
        label="Cây lựa chọn"
      >
        <div id="tree-select-popup" className={selectStyles.popupInner}>
          <Tree
            treeData={data as never}
            checkable={rest.treeCheckable === true}
            {...(rest.treeDefaultExpandAll !== undefined ? { defaultExpandAll: rest.treeDefaultExpandAll } : {})}
            selectedKeys={keys}
            checkedKeys={keys}
            onCheck={(checked) => commit(Array.isArray(checked) ? checked.map(keyOf) : [])}
            onSelect={(selected) => {
              if (rest.treeCheckable === true) return;
              commit(Array.isArray(selected) ? selected.map(keyOf) : []);
            }}
            onExpand={rest.onTreeExpand as never}
          />
        </div>
      </Popup>
    </>
  );
}
