import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogSurface } from '../native/dialog';
import {
  createImperativeChannel,
  useImperativeChannel,
  type ImperativeRecord,
} from '../native/imperativeChannel';

const ROOT = resolve(__dirname, '../../../..');
const cleanup: Array<() => void> = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()?.();
});

function Harness({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

describe('DialogSurface focus contract', () => {
  it('traps Tab/Shift+Tab, closes on Escape and restores the trigger', () => {
    const onClose = vi.fn();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    cleanup.push(() => trigger.remove());

    render(
      <DialogSurface open title="Hộp thoại" onClose={onClose}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </DialogSurface>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Hộp thoại' });
    expect(dialog.getAttribute('data-oi-control')).toBe('dialog');
    expect(dialog.getAttribute('data-state')).toBe('open');
    const first = screen.getByRole('button', { name: 'Đóng' });
    const last = screen.getByRole('button', { name: 'Last' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: 'Tab' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith('escape');
    expect(document.activeElement).toBe(trigger);
  });

  it('renders no backdrop when masked=false and no close button when closable=false', () => {
    const { container } = render(
      <DialogSurface open masked={false} closable={false}>
        <span>Content</span>
      </DialogSurface>,
    );
    expect(container.querySelector('[data-oi-control="dialog-backdrop"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Đóng' })).toBeNull();
    expect(document.querySelector('[data-oi-control="dialog"]')).not.toBeNull();
  });

  it('closes on backdrop pointer down and renders footer measurement hook', () => {
    const onClose = vi.fn();
    render(
      <DialogSurface open title="Panel" onClose={onClose} footer={<button type="button">OK</button>}>
        <span>Content</span>
      </DialogSurface>,
    );
    const backdrop = document.querySelector('[data-oi-control="dialog-backdrop"]')!;
    expect(document.querySelector('[data-oi-control="dialog-footer"]')).not.toBeNull();
    fireEvent.pointerDown(backdrop);
    expect(onClose).toHaveBeenCalledWith('outside');
  });

  it('does not re-focus the trigger when the dialog unmounts with its caller', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    cleanup.push(() => trigger.remove());
    const { unmount } = render(
      <DialogSurface open>
        <span>Content</span>
      </DialogSurface>,
    );
    unmount();
    expect(document.activeElement).not.toBe(trigger);
  });
});

describe('ImperativeChannel', () => {
  it('updates by key in place, removes, clears and stops emitting after unsubscribe', () => {
    const channel = createImperativeChannel<{ text: string }>();
    const listener = vi.fn();
    const unsubscribe = channel.subscribe(listener);

    const beforeUpdate = channel.getSnapshot();
    const first = channel.push({ text: 'one' }, 'a');
    const second = channel.push({ text: 'two' }, 'b');
    expect(first.key).toBe('a');
    expect(second.key).toBe('b');
    expect(channel.getSnapshot()).toHaveLength(2);
    expect(channel.getSnapshot()[1]?.payload.text).toBe('two');

    channel.update('b', { text: 'updated' });
    const snapshot = channel.getSnapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot[1]?.payload.text).toBe('updated');
    expect(snapshot[1]?.key).toBe('b');
    expect(snapshot).not.toBe(beforeUpdate);
    expect(channel.getSnapshot()[0]).toBe(snapshot[0]);

    channel.remove('a');
    expect(channel.getSnapshot()).toHaveLength(1);
    channel.clear();
    expect(channel.getSnapshot()).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(5);

    unsubscribe();
    channel.push({ text: 'later' }, 'c');
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it('generates stable UUID keys and keeps channels independent', () => {
    const a = createImperativeChannel<{ text: string }>();
    const b = createImperativeChannel<{ text: string }>();
    const record = a.push({ text: 'x' });
    expect(record.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    a.update(record.key, { text: 'y' });
    expect(a.getSnapshot()[0]?.payload.text).toBe('y');
    expect(b.getSnapshot()).toHaveLength(0);
  });

  it('re-renders a subscriber when a record updates in place without reload', () => {
    const channel = createImperativeChannel<{ text: string }>();
    const key = channel.push({ text: 'before' }, 'n').key;
    let records: readonly ImperativeRecord<{ text: string }>[] = [];
    function Holder() {
      records = useImperativeChannel(channel);
      return <span>{records.map((record) => record.payload.text).join(',')}</span>;
    }
    render(<Harness><Holder /></Harness>);
    expect(screen.getByText('before')).not.toBeNull();

    act(() => channel.update(key, { text: 'after' }));
    expect(screen.getByText('after')).not.toBeNull();
    expect(records).toHaveLength(1);
  });
});

describe('check-native-imports guard', () => {
  const guard = join(ROOT, 'scripts/check-native-imports.mjs');
  let counter = 0;
  const check = (source: string) => {
    const tempDir = mkdtempSync(join(tmpdir(), 'oi-import-'));
    try {
      const file = join(tempDir, `case-${counter++}.ts`);
      writeFileSync(file, source);
      return execFileSync('node', [guard, file], { cwd: ROOT, stdio: 'pipe' });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  };

  it('exits 1 for a runtime AntD import', () => {
    expect(() => check("import { Modal } from 'antd';\n")).toThrow();
  });

  it('exits 0 for a type-only AntD import', () => {
    expect(() => check("import type { ModalProps } from 'antd';\n")).not.toThrow();
  });
});
