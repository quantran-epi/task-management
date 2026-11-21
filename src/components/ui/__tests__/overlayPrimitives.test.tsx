import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { Menu, MenuItem, MenuItemGroup, MenuSubMenu } from '../menu';
import { List, ListItem, ListItemMeta } from '../list';
import { DirectoryTree, Tree, TreeNode } from '../tree';
import { TabPane, Tabs } from '../tabs';
import { Splitter, SplitterPanel } from '../splitter';

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});

function mounted(node: ReactNode) {
  const view = render(node);
  return view.container;
}

describe('S-MNU native menu', () => {
  it('renders divider/danger/disabled items with hooks and native click event methods', () => {
    const onClick = vi.fn();
    const container = mounted(
      <Menu
        items={[
          { key: 'edit', label: 'Sửa', icon: <span data-testid="edit-icon" /> },
          { type: 'divider' },
          { key: 'delete', label: 'Xóa', danger: true, onClick },
          { key: 'disabled', label: 'Không dùng', disabled: true },
        ]}
      />,
    );
    expect(container.querySelector('[data-oi-control="menu"]')).not.toBeNull();
    expect(container.querySelector('[data-oi-control="menu-divider"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="edit-icon"]')).not.toBeNull();

    const danger = container.querySelector('[data-oi-control="menu-item"][data-state="default"]') as HTMLElement;
    const disabled = container.querySelector('[data-oi-control="menu-item"][data-state="disabled"]') as HTMLElement;
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    const dangerItem = Array.from(container.querySelectorAll<HTMLElement>('[data-oi-control="menu-item"]'))
      .find((item) => item.textContent === 'Xóa')!;
    expect(dangerItem).toBeDefined();
    fireEvent.click(dangerItem);
    expect(onClick).toHaveBeenCalledTimes(1);
    const info = onClick.mock.calls[0]![0];
    expect(info.key).toBe('delete');
    expect(info.keyPath).toEqual(['delete']);
    expect(typeof info.nativeEvent).not.toBe('undefined');
    expect(typeof info.stopPropagation).toBe('function');
    expect(() => info.stopPropagation()).not.toThrow();
    expect(typeof info.item).toBe('object');
    void danger;
  });

  it('moves arrow lead without resetting on re-render (RR-01)', () => {
    const container = mounted(
      <Menu items={[{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }]} />,
    );
    const menu = container.querySelector('[data-oi-control="menu"]') as HTMLElement;
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    const leads = container.querySelectorAll('[data-lead]');
    expect(leads).toHaveLength(1);
    expect(leads[0]!.textContent).toBe('C');
    expect(menu.getAttribute('aria-activedescendant')).toBe(leads[0]!.id);
  });

  it('keeps self-built statics as real components', () => {
    expect(typeof MenuItem).toBe('function');
    expect(typeof MenuSubMenu).toBe('function');
    expect(typeof MenuItemGroup).toBe('function');
  });
});

describe('S-LST native list', () => {
  it('renders 24px rows with sizer n*24 and active hook', () => {
    const container = mounted(<List dataSource={['one', 'two', 'three']} renderItem={(item) => <ListItem>{item}</ListItem>} />);
    const sizer = container.querySelector('[data-oi-control="list"] > div') as HTMLElement;
    expect(sizer.style.height).toBe('72px');
    const rows = container.querySelectorAll('[data-oi-control="list-row"]');
    expect(rows).toHaveLength(3);
    rows.forEach((row, index) => {
      const element = row as HTMLElement;
      expect(element.style.height).toBe('24px');
      expect(element.style.transform).toBe(`translateY(${index * 24}px)`);
    });
  });

  it('preserves caller empty text and loading aria-busy', () => {
    const empty = mounted(<List dataSource={[]} locale={{ emptyText: 'Không có dữ liệu' }} />);
    expect(empty.querySelector('[data-oi-control="list-empty"]')!.textContent).toContain('Không có dữ liệu');
    const loading = mounted(<List dataSource={['a']} loading renderItem={(item) => <ListItem>{item}</ListItem>} />);
    expect(loading.querySelector('[data-oi-control="list"]')!.getAttribute('aria-busy')).toBe('true');
  });

  it('keeps generic statics and metadata', () => {
    expect(typeof ListItem).toBe('function');
    expect(typeof ListItemMeta).toBe('function');
    expect((ListItem as unknown as { Meta: unknown }).Meta).toBe(ListItemMeta);
  });
});

describe('S-TR native tree', () => {
  it('indents depth-2 node by 16*2+12 and expands via ArrowRight', () => {
    const onExpand = vi.fn();
    const container = mounted(
      <Tree
        treeData={[
          { key: 'root', title: 'root', children: [{ key: 'child', title: 'child', children: [{ key: 'leaf', title: 'leaf' }] }] },
        ]}
        onExpand={onExpand}
      />,
    );
    const leaf = Array.from(container.querySelectorAll<HTMLElement>('[data-oi-control="tree-row"]'))
      .find((row) => row.textContent?.includes('leaf'))!;
    expect(leaf.style.paddingLeft).toBe('44px');
    const root = container.querySelector('[data-oi-control="tree-row"]') as HTMLElement;
    fireEvent.keyDown(container.querySelector('[data-oi-control="tree"]')!, { key: 'ArrowRight' });
    expect(root.getAttribute('aria-expanded')).toBe('true');
    expect(onExpand.mock.calls[0]![0]).toContain('root');
  });

  it('emits check keys and selected state with AntD info payload', () => {
    const onCheck = vi.fn();
    const onSelect = vi.fn();
    const container = mounted(
      <Tree
        checkable
        defaultExpandAll
        treeData={[{ key: 'root', title: 'root', children: [{ key: 'leaf', title: 'leaf' }] }]}
        onCheck={onCheck}
        onSelect={onSelect}
      />,
    );
    const checkbox = container.querySelector('input[data-oi-control="checkbox"]') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(onCheck).toHaveBeenCalled();
    expect(Array.isArray(onCheck.mock.calls[0]![0])).toBe(true);
    const leaf = Array.from(container.querySelectorAll<HTMLElement>('[data-oi-control="tree-row"]'))
      .find((row) => row.textContent?.includes('leaf'))!;
    fireEvent.click(leaf);
    expect(onSelect).toHaveBeenCalled();
    expect(onSelect.mock.calls[0]![1].node).toHaveProperty('key');
    expect(onSelect.mock.calls[0]![1].event).toBe('select');
    expect(leaf.getAttribute('aria-selected')).toBe('true');
  });

  it('keeps statics', () => {
    expect(typeof TreeNode).toBe('function');
    expect(typeof DirectoryTree).toBe('function');
  });
});

describe('S-TAB native tabs', () => {
  it('moves selection with ArrowRight and calls onChange with active key', () => {
    const onChange = vi.fn();
    const onTabClick = vi.fn();
    const container = mounted(
      <Tabs
        defaultActiveKey="a"
        onChange={onChange}
        onTabClick={onTabClick}
        items={[
          { key: 'a', label: 'A', children: 'panel-a' },
          { key: 'b', label: 'B', children: 'panel-b' },
          { key: 'c', label: 'C', disabled: true, children: 'panel-c' },
        ]}
      />,
    );
    const tabs = container.querySelectorAll('[data-oi-control="tab"]');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]!.getAttribute('data-state')).toBe('selected');
    expect(tabs[2]!.getAttribute('data-state')).toBe('disabled');
    const firstButton = tabs[0]!.querySelector('[role="tab"]') as HTMLElement;
    fireEvent.keyDown(firstButton, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
    const secondButton = tabs[1]!.querySelector('[role="tab"]') as HTMLElement;
    expect(secondButton.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(secondButton);
    expect(onTabClick).toHaveBeenCalledWith('b', expect.objectContaining({ key: 'b' }));
  });

  it('closes tab via onEdit with AntD (event, action) signature', () => {
    const onEdit = vi.fn();
    const container = mounted(
      <Tabs type="editable-card" items={[{ key: 'a', label: 'A', children: 'panel-a' }]} onEdit={onEdit} />,
    );
    const close = container.querySelector('[aria-label="Đóng A"]') as HTMLElement;
    fireEvent.click(close);
    expect(onEdit).toHaveBeenCalledWith(expect.anything(), 'remove');
  });

  it('lets caller styles.root win and keeps TabPane static', () => {
    expect(typeof TabPane).toBe('function');
    const container = mounted(<Tabs styles={{ root: { backgroundColor: 'rgb(1, 2, 3)' } }} items={[]} />);
    const root = container.querySelector('[data-oi-control="tabs"]') as HTMLElement;
    expect(root.style.backgroundColor).toBe('rgb(1, 2, 3)');
  });
});

describe('S-SPL native splitter', () => {
  it('resizes via Arrow on separator and emits numeric onResize sizes', () => {
    const onResize = vi.fn();
    const onResizeStart = vi.fn();
    const container = mounted(
      <Splitter onResize={onResize} onResizeStart={onResizeStart}>
        <SplitterPanel defaultSize="50%">left</SplitterPanel>
        <SplitterPanel defaultSize="50%">right</SplitterPanel>
      </Splitter>,
    );
    const handle = container.querySelector('[data-oi-control="splitter-handle"]') as HTMLElement;
    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    fireEvent.focus(handle);
    expect(handle.getAttribute('data-state')).toBe('focus-visible');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenCalled();
    expect(onResize.mock.calls[0]![0].every((size: unknown) => typeof size === 'number')).toBe(true);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onResize.mock.calls.length).toBeGreaterThan(1);
  });

  it('suppresses resize for disabled panel', () => {
    const onResize = vi.fn();
    const container = mounted(
      <Splitter onResize={onResize}>
        <SplitterPanel defaultSize="50%" disabled>left</SplitterPanel>
        <SplitterPanel defaultSize="50%">right</SplitterPanel>
      </Splitter>,
    );
    const handle = container.querySelector('[data-oi-control="splitter-handle"]') as HTMLElement;
    expect(handle.getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onResize).not.toHaveBeenCalled();
  });
});
