import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { createSystem } from '../../../src/db/repositories/systemRepo';
import { TargetSystemsSelector } from '../../../src/components/changeRequests/TargetSystemsSelector';

/**
 * Wave 0 contract for plan 31.2-12 Task 1 (ENT-NORM-02, D-24/D-25, T-31.2-55).
 *
 * The live `parentId === null || type === 'LOGICAL_GROUP'` predicate makes an unparented
 * subsystem unselectable as a CR target — verified against the current component, where an
 * unparented SERVICE renders as a purple folder group header instead of a cyan selectable
 * leaf. This suite pins the corrected classification: `isLogicalParent` decides headers,
 * `isSubsystem` decides selectable leaves, and an unparented subsystem lands under the
 * synthetic `Chưa phân nhóm hệ thống` node as a selectable leaf. RED until plan 12 lands.
 */
describe('TargetSystemsSelector — parent vs subsystem classification (ENT-NORM-02)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-target-selector-' + Math.random().toString(36).slice(2));
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  async function openDropdown(): Promise<HTMLElement> {
    render(<TargetSystemsSelector value={[]} onChange={() => {}} db={db} />);
    fireEvent.mouseDown(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(document.querySelector('.ant-select-tree')).not.toBeNull();
    });
    return document.querySelector('.ant-select-tree') as HTMLElement;
  }

  function treeNodeContaining(tree: HTMLElement, text: string): HTMLElement | undefined {
    return Array.from(tree.querySelectorAll<HTMLElement>('.ant-select-tree-treenode')).find(
      (node) => node.textContent?.includes(text)
    );
  }

  it('renders an unparented subsystem as a selectable leaf under the synthetic group', async () => {
    await createSystem({ parentId: null, name: 'Orphan Ledger', code: 'ORPHAN-LEDGER', type: 'SERVICE' }, db);

    const tree = await openDropdown();

    expect(tree.textContent).toContain('Chưa phân nhóm hệ thống');
    const orphanNode = treeNodeContaining(tree, 'ORPHAN-LEDGER');
    expect(orphanNode).toBeDefined();
    // antd marks a selectable tree node with `aria-selected`; a group header has none.
    expect(orphanNode?.hasAttribute('aria-selected')).toBe(true);
  });

  it('renders a LOGICAL_GROUP as a non-selectable group header', async () => {
    const parent = await createSystem(
      { parentId: null, name: 'SmartCard Core', code: 'SC-CORE', type: 'LOGICAL_GROUP' },
      db
    );
    await createSystem(
      { name: 'Card Auth API', code: 'SC-AUTH-API', parentId: parent.id, type: 'SERVICE' },
      db
    );

    const tree = await openDropdown();

    const parentNode = treeNodeContaining(tree, 'SC-CORE');
    expect(parentNode).toBeDefined();
    // `selectable: false` renders no `aria-selected` attribute.
    expect(parentNode?.hasAttribute('aria-selected')).toBe(false);
  });

  it('nests a parented subsystem under its logical parent', async () => {
    const parent = await createSystem(
      { parentId: null, name: 'SmartCard Core', code: 'SC-CORE', type: 'LOGICAL_GROUP' },
      db
    );
    await createSystem(
      { name: 'Card Auth API', code: 'SC-AUTH-API', parentId: parent.id, type: 'SERVICE' },
      db
    );

    const tree = await openDropdown();

    const parentNode = treeNodeContaining(tree, 'SC-CORE') as HTMLElement;
    const childNode = treeNodeContaining(tree, 'SC-AUTH-API') as HTMLElement;
    expect(parentNode).toBeDefined();
    expect(childNode).toBeDefined();
    // The child renders after its parent (nested tree order) and carries the leaf class.
    expect(parentNode.compareDocumentPosition(childNode)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(childNode.className).toContain('ant-select-tree-treenode-leaf');
  });

  it('classifies by type alone, not by parentId presence', async () => {
    // A SERVICE with no parent is still a subsystem, and a LOGICAL_GROUP is still a
    // parent. This is the exact inversion the live predicate makes.
    await createSystem({ parentId: null, name: 'Loose Worker', code: 'LOOSE-WORKER', type: 'WORKER' }, db);

    const tree = await openDropdown();

    const looseNode = treeNodeContaining(tree, 'LOOSE-WORKER');
    expect(looseNode).toBeDefined();
    expect(looseNode?.hasAttribute('aria-selected')).toBe(true);
    expect(looseNode?.className).toContain('ant-select-tree-treenode-leaf');
  });
});
