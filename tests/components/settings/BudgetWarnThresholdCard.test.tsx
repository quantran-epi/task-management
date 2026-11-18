import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BudgetWarnThresholdCard } from '../../../src/components/settings/BudgetWarnThresholdCard';
import type { TaskPlannerDatabase } from '../../../src/db';

const messageError = vi.fn();
const messageSuccess = vi.fn();

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    message: {
      ...actual.message,
      error: (...args: unknown[]) => messageError(...args),
      success: (...args: unknown[]) => messageSuccess(...args),
    },
  };
});

/** WR-12: a failed read/write must surface, not reject unhandled. */
describe('BudgetWarnThresholdCard error surfaces (WR-12)', () => {
  beforeEach(() => {
    messageError.mockClear();
    messageSuccess.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports a failed load instead of leaving an unhandled rejection', async () => {
    const db = {
      settings: {
        get: vi.fn(async () => {
          throw new Error('read failed');
        }),
        put: vi.fn(async () => undefined),
      },
    } as unknown as TaskPlannerDatabase;

    render(<BudgetWarnThresholdCard db={db} />);

    await waitFor(() => expect(messageError).toHaveBeenCalledTimes(1));
  });

  it('reports a failed save and stops the spinner', async () => {
    const db = {
      settings: {
        get: vi.fn(async () => ({ key: 'ai_budget_warn_threshold_pct', value: 80 })),
        put: vi.fn(async () => {
          throw new Error('write failed');
        }),
      },
    } as unknown as TaskPlannerDatabase;

    render(<BudgetWarnThresholdCard db={db} />);
    fireEvent.click(await screen.findByTestId('budget-warn-threshold-save'));

    await waitFor(() => expect(messageError).toHaveBeenCalledTimes(1));
    expect(messageSuccess).not.toHaveBeenCalled();
    expect(await screen.findByTestId('budget-warn-threshold-save')).not.toHaveClass(
      'ant-btn-loading'
    );
  });
});
