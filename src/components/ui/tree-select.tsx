import { TreeSelect as AntTreeSelect, type TreeSelectProps as AntTreeSelectProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type { TreeSelectProps, TreeDataNode } from 'antd';
export type { SelectValue } from 'antd/es/tree-select';

export interface TreeSelectWrapperProps extends AntTreeSelectProps {
  width?: 'full' | 'auto';
}

/** TreeSelect with shared control metrics; TreeNode/SHOW_* mirror consumed statics. */
export function TreeSelect({ width = 'full', style, ...rest }: TreeSelectWrapperProps) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const selectStyle = {
    width: width === 'full' ? '100%' : undefined,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-radius': `${borderRadius}px`,
    ...style,
  } as CSSProperties;
  return <AntTreeSelect {...rest} style={selectStyle} />;
}

export const TreeSelectNode = AntTreeSelect.TreeNode;
export const TreeSelectSHOW_ALL = AntTreeSelect.SHOW_ALL;
export const TreeSelectSHOW_CHILD = AntTreeSelect.SHOW_CHILD;
export const TreeSelectSHOW_PARENT = AntTreeSelect.SHOW_PARENT;
