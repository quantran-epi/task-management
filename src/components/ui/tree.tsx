import { Tree as AntTree, type TreeProps as AntTreeProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type { TreeProps, TreeDataNode } from 'antd';

export interface TreeWrapperProps extends AntTreeProps {
  /** Compact row height from the shared control metric. */
  compact?: boolean;
}

/** Tree with token-owned row height/font; statics mirror the AntD API. */
export function Tree({ compact = true, style, ...rest }: TreeWrapperProps) {
  const { controlHeight, fontSize, iconSize } = getSharedControlTokens();
  const treeStyle = {
    '--ui-tree-row-height': `${controlHeight}px`,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-tree-icon-size': iconSize,
    ...style,
  } as CSSProperties;
  return <AntTree {...rest} style={treeStyle} />;
}

export const TreeNode = AntTree.TreeNode;
export const DirectoryTree = AntTree.DirectoryTree;
