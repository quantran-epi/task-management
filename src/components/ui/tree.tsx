import type { TreeProps as AntTreeProps, TreeDataNode } from 'antd';
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
import checkboxStyles from './openidea/Checkbox.module.css';
import treeStyles from './openidea/Tree.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type { TreeProps, TreeDataNode } from 'antd';

export interface TreeWrapperProps extends AntTreeProps {
  /** Compact row height from the shared control metric. */
  compact?: boolean;
}

interface StaticNodeProps {
  key?: React.Key;
  title?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  selectable?: boolean;
  isLeaf?: boolean;
}

interface FlatNode {
  key: string;
  depth: number;
  raw: TreeDataNode;
  title: ReactNode;
  disabled: boolean;
  checkable: boolean;
  isLeaf: boolean;
}

function nodeFromElement(element: ReactElement<StaticNodeProps>, depth: number): FlatNode {
  const props = element.props;
  const key = String(element.key ?? props.key ?? `node-${depth}-${Math.random().toString(36).slice(2)}`);
  return {
    key,
    depth,
    raw: { key, title: props.title, disabled: props.disabled, selectable: props.selectable, isLeaf: props.isLeaf } as TreeDataNode,
    title: props.title,
    disabled: props.disabled === true,
    checkable: false,
    isLeaf: props.isLeaf === true || !props.children,
  };
}

/** Depth-first flatten of AntD `treeData` + optional legacy `<TreeNode>` children. */
function flatten(nodes: TreeDataNode[] | undefined, children: ReactNode, depth = 0): FlatNode[] {
  const result: FlatNode[] = [];
  const visit = (node: TreeDataNode | ReactElement<StaticNodeProps>, level: number) => {
    if (isValidElement<StaticNodeProps>(node)) {
      const flat = nodeFromElement(node, level);
      result.push(flat);
      Children.forEach(node.props.children, (child) => visit(child as TreeDataNode, level + 1));
      return;
    }
    if (!node || typeof node !== 'object') return;
    const source = node as TreeDataNode & { children?: TreeDataNode[]; checkable?: boolean };
    const key = String(source.key);
    result.push({
      key,
      depth: level,
      raw: node,
      title: typeof source.title === 'function' ? source.title(node) : source.title,
      disabled: source.disabled === true,
      checkable: source.checkable === true,
      isLeaf: source.isLeaf === true || !source.children?.length,
    });
    source.children?.forEach((child) => visit(child, level + 1));
  };
  (nodes ?? []).forEach((node) => visit(node, depth));
  Children.forEach(children, (child) => visit(child as TreeDataNode, depth));
  return result;
}

function keySet(keys: readonly React.Key[] | undefined): Set<string> {
  return new Set((keys ?? []).map(String));
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"
      className={treeStyles.chevron}
      data-oi-control="tree-toggle"
      data-state={expanded ? 'expanded' : 'collapsed'}
      style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Native S-TR: vendored Tree.module.css rows, indent 16*depth + 12, AntD event payloads preserved. */
export function Tree({ compact = true, style, ...rest }: TreeWrapperProps) {
  const idBase = useId();
  const { controlHeight, fontSize, iconSize } = getSharedControlTokens();
  void compact;
  const nodes = flatten(rest.treeData as TreeDataNode[] | undefined, rest.children);
  const checkable = rest.checkable === true;

  const controlledExpanded = rest.expandedKeys !== undefined;
  const controlledSelected = rest.selectedKeys !== undefined;
  const controlledChecked = rest.checkedKeys !== undefined;
  const initialExpanded = rest.defaultExpandAll
    ? nodes.map((node) => node.key)
    : (rest.defaultExpandedKeys ?? []).map(String);
  const [innerExpanded, setInnerExpanded] = useState<Set<string>>(() => new Set(initialExpanded));
  const [innerSelected, setInnerSelected] = useState<Set<string>>(() => new Set((rest.defaultSelectedKeys ?? []).map(String)));
  const [innerChecked, setInnerChecked] = useState<Set<string>>(() => {
    return new Set((rest.defaultCheckedKeys ?? []).map(String));
  });
  const [lead, setLead] = useState(0);

  const expanded = controlledExpanded ? keySet(rest.expandedKeys) : innerExpanded;
  const selected = controlledSelected ? keySet(rest.selectedKeys) : innerSelected;
  const checked = controlledChecked
    ? keySet(Array.isArray(rest.checkedKeys) ? rest.checkedKeys : rest.checkedKeys?.checked)
    : innerChecked;
  const activeLead = nodes.length === 0 ? undefined : nodes[Math.min(lead, nodes.length - 1)];

  const treeStyle = {
    '--ui-tree-row-height': `${(compact ? 24 : controlHeight)}px`,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-tree-icon-size': iconSize,
    ...style,
  } as CSSProperties;

  function emitExpand(node: FlatNode, next: Set<string>, nativeEvent: MouseEvent | null, expandedNow: boolean) {
    const keys = [...next].map((key) => (rest.expandedKeys ?? []).find((original) => String(original) === key) ?? key);
    if (!controlledExpanded) setInnerExpanded(next);
    rest.onExpand?.(keys as React.Key[], {
      node: { ...node.raw, key: node.key, expanded: expandedNow } as never,
      expanded: expandedNow,
      nativeEvent: nativeEvent as MouseEvent,
    });
  }

  function toggleExpand(node: FlatNode, nativeEvent: MouseEvent | null) {
    if (node.disabled) return;
    if (!rest.loadData && node.isLeaf) return;
    const next = new Set(expanded);
    const expandedNow = !next.has(node.key);
    if (expandedNow) next.add(node.key); else next.delete(node.key);
    emitExpand(node, next, nativeEvent, expandedNow);
    // RemoteGitExplorer loadData reads EventDataNode fields off the expanded node (rawPath, isLeaf).
    if (expandedNow && rest.loadData) {
      void rest.loadData({ ...node.raw, key: node.key, expanded: true } as never);
    }
  }

  function emitSelect(node: FlatNode, nativeEvent: MouseEvent | null) {
    if (node.disabled || node.raw.selectable === false) return;
    const next = new Set(rest.multiple === true ? selected : []);
    const nowSelected = !next.has(node.key);
    if (nowSelected) next.add(node.key); else next.delete(node.key);
    if (!controlledSelected) setInnerSelected(next);
    const keys = [...next].map((key) => nodes.find((candidate) => candidate.key === key)?.raw.key ?? key);
    const withNode = { ...node.raw, key: node.key, selected: nowSelected } as TreeDataNode & { path?: unknown };
    rest.onSelect?.(keys as React.Key[], {
      event: 'select',
      selected: nowSelected,
      node: withNode as never,
      selectedNodes: [withNode, ...nodes.filter((candidate) => candidate.key !== node.key && next.has(candidate.key)).map((candidate) => candidate.raw)],
      nativeEvent: nativeEvent as MouseEvent,
    });
  }

  function emitCheck(node: FlatNode, nativeEvent: MouseEvent | null) {
    if (node.disabled || (node.raw as { disableCheckbox?: boolean }).disableCheckbox) return;
    const next = new Set(checked);
    const nowChecked = !next.has(node.key);
    if (nowChecked) next.add(node.key); else next.delete(node.key);
    if (!controlledChecked) setInnerChecked(next);
    const keys = [...next].map((key) => nodes.find((candidate) => candidate.key === key)?.raw.key ?? key);
    (rest.onCheck as ((keys: React.Key[], info: unknown) => void) | undefined)?.(keys as React.Key[], {
      checked: keys,
      halfChecked: [],
      node: { ...node.raw, key: node.key, checked: nowChecked } as never,
      checkedNodes: nodes.filter((candidate) => next.has(candidate.key)).map((candidate) => candidate.raw),
      event: 'check',
      nativeEvent,
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const key = event.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      if (nodes.length === 0) return;
      event.preventDefault();
      setLead((current) => key === 'ArrowDown'
        ? Math.min(nodes.length - 1, current + 1)
        : Math.max(0, current - 1));
    } else if (key === 'ArrowRight' && activeLead) {
      event.preventDefault();
      if (expanded.has(activeLead.key)) return;
      toggleExpand(activeLead, null);
    } else if (key === 'ArrowLeft' && activeLead) {
      event.preventDefault();
      if (!expanded.has(activeLead.key)) return;
      toggleExpand(activeLead, null);
    } else if (key === 'Enter' || key === ' ') {
      if (!activeLead) return;
      event.preventDefault();
      emitSelect(activeLead, null);
    }
  }

  return (
    <div
      className={classNames(treeStyles.tree, rest.className)}
      style={treeStyle}
      role="tree"
      tabIndex={0}
      aria-multiselectable={rest.multiple === true || undefined}
      data-oi-control="tree"
      data-state="default"
      onKeyDown={handleKeyDown}
    >
      <div className={treeStyles.sizer} style={{ height: nodes.length * 24 }}>
        {nodes.map((node, index) => {
          const isExpanded = expanded.has(node.key);
          const isSelected = selected.has(node.key);
          const isChecked = checked.has(node.key);
          const state = node.disabled ? 'disabled' : isChecked ? 'checked' : isSelected ? 'selected' : isExpanded ? 'expanded' : 'default';
          const title = rest.titleRender
            ? (rest.titleRender as (node: TreeDataNode, index: number) => ReactNode)(node.raw, index)
            : node.title;
          return (
            <div
              key={node.key}
              id={`${idBase}-node-${index}`}
              role="treeitem"
              aria-level={node.depth + 1}
              aria-expanded={node.isLeaf ? undefined : isExpanded}
              aria-selected={isSelected}
              aria-checked={checkable ? isChecked : undefined}
              aria-disabled={node.disabled || undefined}
              data-oi-control="tree-row"
              data-state={state}
              data-lead={activeLead?.key === node.key || undefined}
              className={classNames(
                treeStyles.row,
                isSelected && treeStyles.selected,
                activeLead?.key === node.key && treeStyles.lead,
              )}
              style={{ paddingLeft: 16 * node.depth + 12, transform: `translateY(${index * 24}px)`, height: 24 }}
              onClick={(event) => {
                if (node.disabled) return;
                setLead(index);
                emitSelect(node, event.nativeEvent);
              }}
              onDoubleClick={(event) => {
                (rest.onDoubleClick as ((event: ReactMouseEvent<HTMLDivElement>, node: unknown) => void) | undefined)?.(
                  event,
                  { ...node.raw, key: node.key } as TreeDataNode,
                );
              }}
              onPointerMove={() => setLead(index)}
            >
              {node.isLeaf ? <span className={treeStyles.chevron} aria-hidden="true" /> : (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                  onClick={(event) => { event.stopPropagation(); toggleExpand(node, event.nativeEvent); }}
                >
                  <Chevron expanded={isExpanded} />
                </span>
              )}
              {checkable && node.raw.checkable !== false ? (
                <input
                  type="checkbox"
                  aria-label={typeof node.title === 'string' ? node.title : `Chọn ${node.key}`}
                  checked={isChecked}
                  disabled={node.disabled}
                  className={checkboxStyles.native}
                  data-oi-control="checkbox"
                  data-state={isChecked ? 'checked' : 'default'}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => emitCheck(node, null)}
                />
              ) : null}
              {rest.showIcon === true && node.raw.icon ? (
                <span className={treeStyles.icon} aria-hidden="true">{node.raw.icon as ReactNode}</span>
              ) : null}
              <span className={treeStyles.label} data-oi-control="tree-label">{title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Self-built statics — values defined here, never re-exported from AntD (no pass-through). */
export function TreeNode(_props: StaticNodeProps) { return null; }
export function DirectoryTree(_props: TreeWrapperProps) { return null; }
