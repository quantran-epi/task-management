import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { SystemModal } from '../../../src/components/systems/SystemModal';

/**
 * Wave 0 contract for plan 31.2-12 Task 2 (ENT-NORM-02, D-24/D-34, T-31.2-31).
 *
 * Repo invariant violations must surface inline on the responsible field and keep the
 * modal open, instead of a transient `message.error`. RED until plan 12 lands.
 */
describe('SystemModal — inline invariant errors (ENT-NORM-02)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-system-modal-' + Math.random().toString(36).slice(2));
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('surfaces a parent-has-repo invariant error inline and stays open', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Hệ thống cha không được có SSH/Repo'));
    const onClose = vi.fn();

    render(<SystemModal open={true} onClose={onClose} onSave={onSave} db={db} />);

    fireEvent.change(screen.getByPlaceholderText('VD: SmartCard Core API'), {
      target: { value: 'Payment Core' },
    });
    fireEvent.change(screen.getByPlaceholderText('VD: SC-API'), {
      target: { value: 'PAY-CORE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hệ thống' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    // Inline means a Form.Item explain error, not a transient `message.error` toast.
    await waitFor(() => {
      const explain = Array.from(
        document.querySelectorAll<HTMLElement>('.ant-form-item-explain-error')
      ).map((node) => node.textContent);
      expect(explain).toContain('Hệ thống cha không được có SSH/Repo');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('surfaces a subsystem-must-point-to-logical-parent error inline', async () => {
    const onSave = vi.fn().mockRejectedValue(
      new Error('Subsystem phải trỏ tới một Logical Parent')
    );
    const onClose = vi.fn();

    render(<SystemModal open={true} onClose={onClose} onSave={onSave} db={db} />);

    fireEvent.change(screen.getByPlaceholderText('VD: SmartCard Core API'), {
      target: { value: 'Child API' },
    });
    fireEvent.change(screen.getByPlaceholderText('VD: SC-API'), {
      target: { value: 'CHILD-API' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hệ thống' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    await waitFor(() => {
      const explain = Array.from(
        document.querySelectorAll<HTMLElement>('.ant-form-item-explain-error')
      ).map((node) => node.textContent);
      expect(explain).toContain('Subsystem phải trỏ tới một Logical Parent');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the existing form-validation early return without surfacing a message', async () => {
    const onSave = vi.fn();

    render(<SystemModal open={true} onClose={vi.fn()} onSave={onSave} db={db} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hệ thống' }));

    await waitFor(() => {
      expect(screen.getByText('Vui lòng nhập tên hệ thống')).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('normalizes lowercase code input to uppercase without reporting pattern error', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SystemModal open={true} onClose={vi.fn()} onSave={onSave} db={db} />);

    fireEvent.change(screen.getByPlaceholderText('VD: SmartCard Core API'), {
      target: { value: 'Payment Core' },
    });
    fireEvent.change(screen.getByPlaceholderText('VD: SC-API'), {
      target: { value: 'sc-api' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hệ thống' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SC-API',
        })
      );
    });
    const explain = document.querySelectorAll('.ant-form-item-explain-error');
    expect(explain.length).toBe(0);
  });

  it('surfaces duplicate code error inline on code field', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Mã hệ thống "SC-API" đã tồn tại.'));
    render(<SystemModal open={true} onClose={vi.fn()} onSave={onSave} db={db} />);

    fireEvent.change(screen.getByPlaceholderText('VD: SmartCard Core API'), {
      target: { value: 'Payment Core' },
    });
    fireEvent.change(screen.getByPlaceholderText('VD: SC-API'), {
      target: { value: 'SC-API' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hệ thống' }));

    await waitFor(() => {
      const explain = Array.from(
        document.querySelectorAll<HTMLElement>('.ant-form-item-explain-error')
      ).map((node) => node.textContent);
      expect(explain).toContain('Mã hệ thống "SC-API" đã tồn tại.');
    });
  });
});
