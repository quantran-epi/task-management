import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../../../types/models';

const mocks = vi.hoisted(() => ({
  onOpenDrawer: vi.fn(),
  onSelectRows: vi.fn(),
}));

vi.mock('../../../hooks/useTimer', () => ({
  useTimer: () => ({
    getTimerForTask: () => undefined,
    getElapsedSeconds: () => 0,
    startTimer: vi.fn(),
    pauseTimer: vi.fn(),
    finishTimer: vi.fn(),
  }),
}));
vi.mock('../../../hooks/useTaskMenuItems', () => ({
  useTaskMenuItems: () => ({
    getTaskMenuItems: () => [],
    reminderModal: null,
    modal: { confirm: vi.fn() },
    contextHolder: null,
  }),
}));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => undefined }));
vi.mock('../../../utils/date', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/date')>()),
  getTodayDateString: () => '2026-11-28',
}));

vi.mock('../../ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ui')>();
  return {
    ...actual,
    useAntdToken: () => ({ token: { colorPrimary: '#1677ff', colorBorderSecondary: '#eee', colorSuccess: '#52c41a', colorError: '#ff4d4f', colorWarning: '#faad14' } }),
    useMessage: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
    Table: ({ className, columns, dataSource, rowSelection }: any) => (
      <div className={`ant-table-wrapper ${className ?? ''}`}>
        <table>
          <thead>
            <tr>
              <th>Yêu cầu</th>
              {columns.map((col: any) => <th key={col.key}>{col.title}</th>)}
            </tr>
          </thead>
          <tbody>
            {dataSource.map((row: any) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${row.name}`}
                    checked={Boolean(rowSelection?.selectedRowKeys?.includes(row.id))}
                    onChange={(e) => rowSelection?.onChange(e.target.checked ? [row.id] : [])}
                  />
                </td>
                {columns.map((col: any) => (
                  <td key={col.key}>{col.render ? col.render(row[col.dataIndex], row) : null}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    Tag: ({ children, ...rest }: any) => <span {...rest}>{children}</span>,
    Space: ({ children }: any) => <div>{children}</div>,
    Popover: ({ children }: any) => <>{children}</>,
    Tooltip: ({ children }: any) => <>{children}</>,
    Dropdown: ({ children }: any) => <>{children}</>,
    Select: ({ 'aria-label': ariaLabel }: any) => <select aria-label={ariaLabel} />,
    Modal: ({ open, children }: any) => (open ? <div>{children}</div> : null),
    Progress: () => null,
    Checkbox: ({ children }: any) => <label>{children}</label>,
    Textarea: () => <textarea />,
  };
});

import { TaskTable } from '../TaskTable';

const task: Task = {
  id: 'task-late',
  name: 'Review API contract',
  status: 'In Progress',
  priority: 'Urgent',
  estimateMinutes: 60,
  deadline: '2026-11-26',
  crId: 'cr-1',
  systemId: 'sys-1',
  links: [],
  isRecurring: false,
  progress: 0,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

describe('TaskTable dense layout (sketch 017 winner A)', () => {
  it('renders dense header, priority dots, coloured due date and keeps keyboard/selection', () => {
    const { container } = render(
      <TaskTable
        tasks={[task]}
        changeRequests={[]}
        systems={[]}
        selectedRowKeys={[]}
        onSelectRows={mocks.onSelectRows}
        onOpenDrawer={mocks.onOpenDrawer}
      />
    );

    expect(screen.getByText('Tên tác vụ · CR · Mốc')).toBeTruthy();
    expect(container.querySelector('.tm-tasklist__table')).not.toBeNull();
    expect(screen.getByLabelText('Ưu tiên Khẩn cấp/4')).toBeTruthy();
    expect(container.querySelector('.tm-tasklist__due--late')?.textContent).toBe('2026-11-26');
    expect(container.querySelector('.tm-tasklist__meta')).not.toBeNull();
    expect(container.querySelector('.tm-tasklist__status')).not.toBeNull();

    fireEvent.click(screen.getByLabelText('Chọn Review API contract'));
    expect(mocks.onSelectRows).toHaveBeenCalledWith(['task-late']);

    const table = screen.getByTestId('task-table-container');
    fireEvent.keyDown(table, { key: 'ArrowDown' });
    fireEvent.keyDown(table, { key: 'Enter' });
    expect(mocks.onOpenDrawer).toHaveBeenCalledWith('task-late');
  });
});
