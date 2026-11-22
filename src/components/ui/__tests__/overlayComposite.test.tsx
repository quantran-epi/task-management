import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Drawer } from '../drawer';
import { Image, ImagePreviewGroup } from '../image';
import { Modal, getOverlayWidth, resolveMask, useTaskMateModal } from '../modal';
import { Table } from '../table';
import { sharedTokens } from '../../../styles/tokens';

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});

const dialogs = () => document.querySelectorAll('[data-oi-control="dialog"]');

describe('native Modal and Drawer', () => {
  it('traps Tab and Shift+Tab, closes on Escape and restores trigger focus', () => {
    const onCancel = vi.fn();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} title="Xác nhận" footerPolicy="none" onCancel={() => { onCancel(); setOpen(false); }}>
            <button type="button" data-testid="first">First</button>
            <button type="button" data-testid="last">Last</button>
          </Modal>
        </>
      );
    }
    render(<Host />);
    screen.getByTestId('trigger').focus();
    fireEvent.click(screen.getByTestId('trigger'));
    const first = screen.getByTestId('first');
    const last = screen.getByTestId('last');
    const focusables = [screen.getByLabelText('Đóng'), first, last];
    expect(document.activeElement).toBe(focusables[0]);
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    first.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByTestId('trigger'));
  });

  it('keeps mask boolean, silent close and no-footer policies', () => {
    const { unmount } = render(
      <Modal open title="No mask" mask={false} footerPolicy="none" closePolicy="silent" onCancel={() => {}}>
        body
      </Modal>,
    );
    expect(document.querySelector('[data-oi-control="dialog-backdrop"]')).toBeNull();
    expect(document.querySelector('[data-oi-control="dialog-close"]')).toBeNull();
    expect(document.querySelector('[data-oi-control="dialog-footer"]')).toBeNull();
    unmount();
    render(<Drawer open title="Drawer" mask={false} closePolicy="silent" onClose={() => {}}>panel</Drawer>);
    expect(document.querySelector('[data-oi-control="dialog-backdrop"]')).toBeNull();
    expect(document.querySelector('[data-oi-control="dialog-close"]')).toBeNull();
    expect(document.querySelector('[data-oi-control="drawer"]')).not.toBeNull();
  });

  it('preserves token width scales and raw CSS drawer width (WR-04)', () => {
    expect(getOverlayWidth('sm')).toBe(sharedTokens.controlHeight * 10);
    expect(getOverlayWidth('lg')).toBe(sharedTokens.controlHeight * 28);
    expect(resolveMask(false, true, true)).toBe(false);
    const { unmount } = render(<Modal open title="Defaults" onCancel={() => {}}>body</Modal>);
    expect((dialogs()[0] as HTMLElement).style.width).toBe(`${getOverlayWidth('md')}px`);
    unmount();
    render(<Drawer open title="Wide" width="calc(100vw - 32px)" onClose={() => {}}>panel</Drawer>);
    expect((document.querySelector('[data-oi-control="drawer"]') as HTMLElement).style.width).toBe('calc(100vw - 32px)');
  });

  it('traps focus inside the inner drawer dialog and restores on Escape', () => {
    const onClose = vi.fn();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-testid="drawer-trigger" onClick={() => setOpen(true)}>Open drawer</button>
          <Drawer open={open} title="Panel" onClose={() => { onClose(); setOpen(false); }}>
            <button type="button" data-testid="drawer-first">A</button>
            <button type="button" data-testid="drawer-last">B</button>
          </Drawer>
        </>
      );
    }
    render(<Host />);
    screen.getByTestId('drawer-trigger').focus();
    fireEvent.click(screen.getByTestId('drawer-trigger'));
    const closeButton = screen.getByLabelText('Đóng');
    expect(document.activeElement).toBe(closeButton);
    const last = screen.getByTestId('drawer-last');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByTestId('drawer-trigger'));
  });
});

describe('imperative confirm', () => {
  it('renders caller copy, runs onOk and supports destroy()', async () => {
    const onOk = vi.fn();
    function Consumer() {
      const { modal, contextHolder } = useTaskMateModal();
      return (
        <>
          <button type="button" onClick={() => { (window as unknown as { handle: { destroy: () => void } }).handle = modal.confirm({ title: 'Xóa tác vụ', content: 'Chắc chứ?', okText: 'Xóa', cancelText: 'Hủy', onOk }); }}>
            Confirm
          </button>
          {contextHolder}
        </>
      );
    }
    render(<Consumer />);
    (window as unknown as { handle: { destroy: () => void } }).handle = { destroy: () => {} };
    fireEvent.click(screen.getByText('Confirm'));
    expect(screen.getByText('Xóa tác vụ')).toBeTruthy();
    expect(screen.getByText('Chắc chứ?')).toBeTruthy();
    expect(screen.getByText('Xóa')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getAllByText('Xóa').at(-1)!);
      (window as unknown as { handle: { destroy: () => void } }).handle.destroy();
    });
    expect(onOk).toHaveBeenCalled();
    expect(dialogs()).toHaveLength(0);
  });

  it('keeps default footer button props (disabled/loading/style/className)', () => {
    const onOk = vi.fn();
    const onCancel = vi.fn();
    render(
      <Modal
        open
        title="Footer props"
        onOk={onOk}
        onCancel={onCancel}
        okButtonProps={{ disabled: true, loading: true, className: 'custom-ok', style: { width: '111px' } }}
        cancelButtonProps={{ disabled: true, className: 'custom-cancel' }}
      >
        body
      </Modal>,
    );
    const footer = document.querySelector('[data-oi-control="dialog-footer"]')!;
    const ok = Array.from(footer.querySelectorAll('button')).find((button) => button.textContent === 'OK')!;
    const cancel = Array.from(footer.querySelectorAll('button')).find((button) => button.textContent === 'Hủy')!;
    expect(ok.disabled).toBe(true);
    expect(ok.getAttribute('aria-busy')).toBe('true');
    expect(ok.className).toContain('custom-ok');
    expect(ok.style.width).toBe('111px');
    // A loading OK locks Cancel, matching AntD's default footer semantics.
    expect(cancel.disabled).toBe(true);
    expect(cancel.className).toContain('custom-cancel');
    fireEvent.click(ok);
    fireEvent.click(cancel);
    expect(onOk).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('keeps confirm open on rejected onOk without unhandled rejection, dismisses on resolve', async () => {
    const onUnhandled = vi.fn();
    window.addEventListener('unhandledrejection', onUnhandled);
    const rejecting = vi.fn(async () => { throw new Error('reject'); });
    const resolving = vi.fn(async () => {});
    type Handle = { destroy: () => void };
    function Consumer() {
      const { modal, contextHolder } = useTaskMateModal();
      return (
        <>
          <button type="button" onClick={() => { (window as unknown as { handle: Handle }).handle = modal.confirm({ title: 'Reject', onOk: rejecting }); }}>
            Reject
          </button>
          <button type="button" onClick={() => { (window as unknown as { handle: Handle }).handle = modal.confirm({ title: 'Resolve', onOk: resolving }); }}>
            Resolve
          </button>
          {contextHolder}
        </>
      );
    }
    try {
      render(<Consumer />);
      fireEvent.click(screen.getByText('Reject'));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(rejecting).toHaveBeenCalled();
      expect(dialogs()).toHaveLength(1);
      expect(onUnhandled).not.toHaveBeenCalled();

      await act(async () => { (window as unknown as { handle: Handle }).handle.destroy(); });
      fireEvent.click(screen.getByText('Resolve'));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(resolving).toHaveBeenCalled();
      expect(dialogs()).toHaveLength(0);
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
    }
  });

  it('renders exactly two dialogs from one hook across three mounted holders', () => {
    function Holder() {
      const { modal, contextHolder } = useTaskMateModal();
      return (
        <>
          <button type="button" data-testid="add" onClick={() => modal.confirm({ title: `Dialog ${dialogs().length + 1}` })}>Add</button>
          {contextHolder}
        </>
      );
    }
    render(<><Holder /><Holder /><Holder /></>);
    const buttons = screen.getAllByTestId('add');
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[1]!);
    expect(dialogs()).toHaveLength(2);
    expect(screen.getByText('Dialog 1')).toBeTruthy();
    expect(screen.getByText('Dialog 2')).toBeTruthy();
    expect(screen.getAllByText('OK')).toHaveLength(2);
  });
});

describe('native Image', () => {
  it('keeps alt accessible name, preview keyboard navigation and focus restore', () => {
    render(
      <ImagePreviewGroup>
        <Image src="/a.png" alt="First image" />
        <Image src="/b.png" alt="Second image" />
      </ImagePreviewGroup>,
    );
    const image = screen.getByAltText('First image');
    image.focus();
    fireEvent.click(image);
    const preview = dialogs()[0] as HTMLElement;
    expect(preview).toBeTruthy();
    expect(screen.getAllByAltText('First image')).toHaveLength(2);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getAllByAltText('Second image')).toHaveLength(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialogs()).toHaveLength(0);
    expect(document.activeElement).toBe(image);
  });
});

describe('native Table', () => {
  const rows = [
    { key: 'a', name: 'Alpha', status: 'done' },
    { key: 'b', name: 'Beta', status: 'open' },
  ];

  it('emits AntD-shaped onChange, rowSelection and live context-menu event', () => {
    const onChange = vi.fn();
    const onSelection = vi.fn();
    const onContextMenu = vi.fn();
    render(
      <Table
        dataSource={rows}
        columns={[{ title: 'Name', dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name) }]}
        onChange={onChange}
        rowSelection={{ selectedRowKeys: ['a'], onChange: onSelection }}
        onRow={() => ({ onContextMenu: onContextMenu })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /sort Name/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [pagination, filters, sorter, extra] = onChange.mock.calls[0]!;
    expect(pagination).toMatchObject({ current: 1, pageSize: 10 });
    expect(filters).toEqual({});
    expect(sorter).toMatchObject({ field: 'name', order: 'ascend' });
    expect(extra.currentDataSource).toHaveLength(2);
    expect(extra.action).toBe('sort');
    expect(onSelection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Chọn b'));
    expect(onSelection).toHaveBeenCalledWith(['a', 'b'], rows, { type: 'single' });
    const row = screen.getAllByTestId('native-table-row')[0]!;
    fireEvent.contextMenu(row);
    const event = onContextMenu.mock.calls[0]![0] as MouseEvent;
    expect(typeof event.preventDefault).toBe('function');
    expect(typeof event.stopPropagation).toBe('function');
  });

  it('single-select filter replaces its value instead of accumulating stale values', () => {
    const onChange = vi.fn();
    const columns = [{
      title: 'Status', dataIndex: 'status', key: 'status',
      filters: [{ text: 'Done', value: 'done' }, { text: 'Open', value: 'open' }],
    }];
    render(<Table dataSource={rows} columns={columns} onChange={onChange} />);
    const filter = screen.getByLabelText('lọc Status') as HTMLSelectElement;

    fireEvent.change(filter, { target: { value: 'done' } });
    expect(onChange.mock.calls[0]![1]).toEqual({ status: ['done'] });

    // Changing the choice must replace, not append to, the previous value.
    fireEvent.change(filter, { target: { value: 'open' } });
    const [, filters] = onChange.mock.calls.at(-1)!;
    expect(filters).toEqual({ status: ['open'] });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('reports post-change currentDataSource on filter and sort (WR-02)', () => {
    const onChange = vi.fn();
    const columns = [
      {
        title: 'Status', dataIndex: 'status', key: 'status',
        filters: [{ text: 'Done', value: 'done' }, { text: 'Open', value: 'open' }],
      },
      { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name) },
    ];
    const filterView = render(<Table dataSource={rows} columns={columns} onChange={onChange} />);
    const filter = screen.getByLabelText('lọc Status') as HTMLSelectElement;

    // Filter must report only rows that pass, not the pre-change snapshot.
    fireEvent.change(filter, { target: { value: 'done' } });
    const extraFilter = onChange.mock.calls.at(-1)![3];
    expect(extraFilter.action).toBe('filter');
    expect(extraFilter.currentDataSource).toHaveLength(1);
    expect(extraFilter.currentDataSource[0]).toMatchObject({ status: 'done' });
    filterView.unmount();

    // Sort must report the just-applied order (ascend then descend).
    const nameSort = { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name) };
    const sortView = render(<Table dataSource={rows} columns={[nameSort]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /sort Name/i }));
    const extraAsc = onChange.mock.calls.at(-1)![3];
    expect(extraAsc.action).toBe('sort');
    expect(extraAsc.currentDataSource.map((r: { name: string }) => r.name)).toEqual(['Alpha', 'Beta']);
    fireEvent.click(screen.getByRole('button', { name: /sort Name/i }));
    const extraDesc = onChange.mock.calls.at(-1)![3];
    expect(extraDesc.currentDataSource.map((r: { name: string }) => r.name)).toEqual(['Beta', 'Alpha']);
    sortView.unmount();
  });

  it('does not double-reverse a 3-arg order-aware sorter (WR-02 R3)', () => {
    const onChange = vi.fn();
    // Mirrors TaskTable deadline: nulls first on descend via the sortOrder branch.
    const deadlineRows = [
      { key: 'a', deadline: null as string | null },
      { key: 'b', deadline: '2026-01-01' },
      { key: 'c', deadline: '2026-02-01' },
    ];
    const deadlineSorter = (a: typeof deadlineRows[number], b: typeof deadlineRows[number], sortOrder: unknown) => {
      if (a.deadline === null && b.deadline === null) return 0;
      if (a.deadline === null) return sortOrder === 'descend' ? -1 : 1;
      if (b.deadline === null) return sortOrder === 'descend' ? 1 : -1;
      return a.deadline.localeCompare(b.deadline);
    };
    const columns = [{ title: 'Deadline', dataIndex: 'deadline', key: 'deadline', sorter: deadlineSorter }];
    render(<Table dataSource={deadlineRows} columns={columns} onChange={onChange} />);

    // Two clicks: ascend -> descend.
    fireEvent.click(screen.getByRole('button', { name: /sort Deadline/i }));
    fireEvent.click(screen.getByRole('button', { name: /sort Deadline/i }));
    const extra = onChange.mock.calls.at(-1)![3];
    // sortOrder='descend' branch puts null first, non-nulls stay ascending;
    // the old extra reverse() pushed null to the bottom ([b, c, a]).
    expect(extra.currentDataSource.map((r: { key: string }) => r.key)).toEqual(['a', 'b', 'c']);
    // Rendered order must match the reported data source (null deadline = empty cell).
    const renderedDeadlines = screen.getAllByTestId('native-table-row').map((row) => row.querySelector('td')?.textContent ?? '');
    expect(renderedDeadlines).toEqual(['', '2026-01-01', '2026-02-01']);
  });

  it('renders emptyText and loading hooks and honours row density', () => {
    const { unmount } = render(
      <Table dataSource={[]} columns={[]} locale={{ emptyText: <span data-testid="custom-empty">Không có dữ liệu</span> }} />,
    );
    expect(screen.getByTestId('custom-empty')).toBeTruthy();
    expect(document.querySelector('[data-oi-control="table"]')?.getAttribute('data-state')).toBe('empty');
    unmount();
    render(<Table dataSource={rows} columns={[]} loading density="small" />);
    expect(document.querySelector('[data-oi-control="table"]')?.getAttribute('aria-busy')).toBe('true');
    expect((screen.getAllByTestId('native-table-row')[0] as HTMLElement).style.height).toBe('22px');
  });
});
