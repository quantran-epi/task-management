import type { RemoteGitTreeNode } from '../types/gitRemote';

export interface CompactedNode {
  key: string;
  path: string;
  name: string;
  label: string;
  chain: string[];
  children: CompactedNode[];
  isLeaf: boolean;
  size?: number | undefined;
  gitStatus?: string | undefined;
}

export interface CompactOptions {
  revealTargets?: readonly string[] | undefined;
}

// RED stub — implementation follows in the GREEN step.
export function compactRemoteTree(
  _nodes: RemoteGitTreeNode[],
  _options: CompactOptions = {}
): CompactedNode[] {
  return [];
}

// RED stub — implementation follows in the GREEN step.
export function keyOfPathFor(_nodes: CompactedNode[]): Map<string, string> {
  return new Map();
}
