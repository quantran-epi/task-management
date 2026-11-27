import type { RemoteGitTreeNode } from '../types/gitRemote';

/** A merged folder chain: key stays the first path (stable), path is the last (operation target). */
export interface CompactedNode {
  /** Stable key = first folder path in the chain. Survives reveal and expansion persistence. */
  key: string;
  /** Operation target = last folder path in the chain. */
  path: string;
  /** Segment name of the last folder. */
  name: string;
  /** Dotted label built from the merged segment names (e.g. com.acme.orders). */
  label: string;
  /** Every folder path merged into this node, in order. */
  chain: string[];
  children: CompactedNode[];
  isLeaf: boolean;
  size?: number | undefined;
  gitStatus?: string | undefined;
}

export interface CompactOptions {
  /** Paths that must stay selectable as distinct nodes; never merged away (D-12). */
  revealTargets?: readonly string[] | undefined;
}

/**
 * JVM-style source roots end a compact chain so their contents compact independently (D-12).
 * End-anchored so a descendant such as `src/main/java/com` is not itself treated as a root.
 */
const SOURCE_ROOT_RE = /(?:^|\/)(?:src|test)\/(?:main|test)\/(?:java|kotlin|resources|scala|groovy)$/;

function hasBadge(node: RemoteGitTreeNode): boolean {
  return Boolean(node.gitStatus?.trim());
}

/**
 * Pure, synchronous single-child folder chain compaction over already-fetched tree nodes.
 *
 * Stop conditions (D-12/D-13): branch points, a non-directory single child, source roots,
 * and reveal targets. A gitStatus badge rides along on the merged row but is not a boundary.
 * Never mutates the input nodes. No React/db/service imports — cheap to call from render.
 */
export function compactRemoteTree(
  nodes: RemoteGitTreeNode[],
  options: CompactOptions = {}
): CompactedNode[] {
  const reveal = new Set(options.revealTargets ?? []);

  const compactOne = (node: RemoteGitTreeNode): CompactedNode => {
    if (node.isLeaf) return leafNode(node);

    const chain: string[] = [node.key];
    const names: string[] = [node.title || node.key.split('/').at(-1) || node.key];
    let end = node;

    // Directory badges are not a compaction boundary: a dirty folder and a clean folder with
    // the same single-child shape must render identically. Carry the first badge in the chain
    // onto the merged row instead of hiding it or splitting the chain (BUG-03).
    let badge = node.gitStatus;
    for (;;) {
      if (reveal.has(end.key) || SOURCE_ROOT_RE.test(end.key)) break;
      const children = end.children ?? [];
      if (children.length !== 1) break; // branch point (incl. zero children)
      const only = children[0]!;
      if (only.isLeaf) break; // do not swallow a file
      if (reveal.has(only.key)) break; // reveal targets stay distinct and selectable
      end = only;
      chain.push(end.key);
      names.push(end.title || end.key.split('/').at(-1) || end.key);
      if (badge === undefined && hasBadge(only)) badge = only.gitStatus;
    }

    return {
      key: node.key,
      path: end.key,
      name: names.at(-1)!,
      label: names.length > 1 ? names.join('.') : names[0]!,
      chain,
      children: (end.children ?? []).map(compactOne),
      isLeaf: false,
      ...(badge !== undefined ? { gitStatus: badge } : {}),
    };
  };

  return nodes.map(compactOne);
}

function leafNode(node: RemoteGitTreeNode): CompactedNode {
  return {
    key: node.key,
    path: node.key,
    name: node.title || node.key.split('/').at(-1) || node.key,
    label: node.title || node.key.split('/').at(-1) || node.key,
    chain: [node.key],
    children: [],
    isLeaf: true,
    ...(node.size !== undefined ? { size: node.size } : {}),
    ...(node.gitStatus !== undefined ? { gitStatus: node.gitStatus } : {}),
  };
}

/** Map every path in every chain back to its compact node's stable first-path key. */
export function keyOfPathFor(nodes: CompactedNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const visit = (list: CompactedNode[]) => {
    for (const node of list) {
      for (const path of node.chain) map.set(path, node.key);
      visit(node.children);
    }
  };
  visit(nodes);
  return map;
}
