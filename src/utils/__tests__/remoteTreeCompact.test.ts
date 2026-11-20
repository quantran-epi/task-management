import { describe, expect, it } from 'vitest';
import type { RemoteGitTreeNode } from '../../types/gitRemote';
import { compactRemoteTree, keyOfPathFor } from '../remoteTreeCompact';

function folder(key: string, children?: RemoteGitTreeNode[], gitStatus?: string): RemoteGitTreeNode {
  return {
    key,
    title: key.split('/').at(-1)!,
    isLeaf: false,
    sha: `sha:${key}`,
    ...(children ? { children } : {}),
    ...(gitStatus ? { gitStatus } : {}),
  };
}

function file(key: string, gitStatus?: string): RemoteGitTreeNode {
  return {
    key,
    title: key.split('/').at(-1)!,
    isLeaf: true,
    size: 10,
    sha: `sha:${key}`,
    ...(gitStatus ? { gitStatus } : {}),
  };
}

describe('compactRemoteTree', () => {
  it('merges a single-child folder chain into one dotted node with a stable first-path key', () => {
    const input = [
      folder('src/main/java/com/acme/orders', [
        folder('src/main/java/com/acme/orders/dto', [
          folder('src/main/java/com/acme/orders/dto/request'),
        ]),
      ]),
    ];

    const out = compactRemoteTree(input);

    expect(out).toHaveLength(1);
    expect(out[0]!.key).toBe('src/main/java/com/acme/orders');
    expect(out[0]!.path).toBe('src/main/java/com/acme/orders/dto/request');
    expect(out[0]!.name).toBe('request');
    expect(out[0]!.label).toBe('orders.dto.request');
    expect(out[0]!.chain).toEqual([
      'src/main/java/com/acme/orders',
      'src/main/java/com/acme/orders/dto',
      'src/main/java/com/acme/orders/dto/request',
    ]);
    expect(out[0]!.children).toEqual([]);
  });

  it('leaves a length-1 chain unchanged with no dotted label', () => {
    const out = compactRemoteTree([folder('src')]);
    expect(out[0]!.label).toBe('src');
    expect(out[0]!.chain).toEqual(['src']);
    expect(out[0]!.key).toBe('src');
  });

  it('stops at a branch point (two visible children)', () => {
    const input = [
      folder('com', [
        folder('com/acme', [
          folder('com/acme/one'),
          folder('com/acme/two'),
        ]),
      ]),
    ];

    const out = compactRemoteTree(input);

    // com + acme merge; the two-child branch stays a separate node.
    expect(out[0]!.label).toBe('com.acme');
    expect(out[0]!.path).toBe('com/acme');
    expect(out[0]!.children).toHaveLength(2);
    expect(out[0]!.children.map((c) => c.label)).toEqual(['one', 'two']);
  });

  it('stops when the single child is a file', () => {
    const out = compactRemoteTree([
      folder('com', [folder('com/acme', [file('com/acme/Main.ts')])]),
    ]);
    expect(out[0]!.label).toBe('com.acme');
    expect(out[0]!.children).toHaveLength(1);
    expect(out[0]!.children[0]!.label).toBe('Main.ts');
    expect(out[0]!.children[0]!.isLeaf).toBe(true);
  });

  it('stops at a source root so its children compact independently', () => {
    const input = [
      folder('src', [
        folder('src/main', [
          folder('src/main/java', [
            folder('src/main/java/com/acme', [
              folder('src/main/java/com/acme/orders'),
            ]),
          ]),
        ]),
      ]),
    ];

    const out = compactRemoteTree(input);

    expect(out[0]!.path).toBe('src/main/java');
    expect(out[0]!.label).toBe('src.main.java');
    // Children of the source root compact on their own, producing the dotted package label.
    expect(out[0]!.children).toHaveLength(1);
    expect(out[0]!.children[0]!.label).toBe('com.acme.orders');
  });

  it('never merges a reveal target away', () => {
    const input = [
      folder('com', [folder('com/acme', [folder('com/acme/orders')])]),
    ];

    const out = compactRemoteTree(input, { revealTargets: ['com/acme'] });

    expect(out[0]!.label).toBe('com');
    expect(out[0]!.children).toHaveLength(1);
    expect(out[0]!.children[0]!.key).toBe('com/acme');
    expect(out[0]!.children[0]!.label).toBe('acme');
    expect(out[0]!.children[0]!.children[0]!.key).toBe('com/acme/orders');
  });

  it('never merges a status-badged node and preserves its badge', () => {
    const input = [
      folder('com', [folder('com/acme', undefined, 'M'), folder('com/other')]),
    ];

    const out = compactRemoteTree(input, { revealTargets: [] });

    // com has two children so it is a branch; the badged child stays distinct with its status.
    expect(out[0]!.children).toHaveLength(2);
    const badged = out[0]!.children.find((c) => c.key === 'com/acme')!;
    expect(badged.gitStatus).toBe('M');
    expect(badged.label).toBe('acme');
  });

  it('does not merge past a badged single child', () => {
    const input = [folder('com', [folder('com/acme', undefined, 'M')])];
    const out = compactRemoteTree(input);
    expect(out[0]!.label).toBe('com');
    expect(out[0]!.children[0]!.gitStatus).toBe('M');
  });

  it('passes file leaves through unchanged', () => {
    const out = compactRemoteTree([file('package.json')]);
    expect(out[0]!.key).toBe('package.json');
    expect(out[0]!.label).toBe('package.json');
    expect(out[0]!.isLeaf).toBe(true);
    expect(out[0]!.size).toBe(10);
  });

  it('does not mutate the input nodes', () => {
    const child = folder('com/acme');
    const input = [folder('com', [child])];
    const snapshot = JSON.stringify(input);
    compactRemoteTree(input, { revealTargets: ['com/acme'] });
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(input[0]!.children![0]).toBe(child);
  });
});

describe('keyOfPathFor', () => {
  it('maps every chain path back to the compact node stable key, recursively', () => {
    const compacted = compactRemoteTree([
      folder('com', [
        folder('com/acme', [folder('com/acme/orders'), folder('com/acme/billing')]),
      ]),
    ]);
    const map = keyOfPathFor(compacted);
    expect(map.get('com')).toBe('com');
    expect(map.get('com/acme')).toBe('com');
    expect(map.get('com/acme/orders')).toBe('com');
    expect(map.get('com/acme/billing')).toBe('com');
    expect(map.has('missing')).toBe(false);
  });
});
