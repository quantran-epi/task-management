import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OracleSqlComposer } from '../editor/OracleSqlComposer';
import * as oracleService from '../../services/ai/oracleSqlclService';
import * as sshService from '../../services/sshService';

vi.mock('../../services/ai/oracleSqlclService', async (importOriginal) => {
  const actual = await importOriginal<typeof oracleService>();
  return {
    ...actual,
    getOracleConnectionProfiles: vi.fn(async () => [
      { id: 'c1', name: 'Main SIT', environment: 'SIT', isActive: true, sshConfigId: 'ssh-1', connectionString: 'user/pass@secret-host:1521/SIT' },
    ]),
    executeOracleQuery: vi.fn(async () =>
      JSON.stringify({ success: true, columns: ['ID'], rows: [[1], [2]], rowCount: 2, truncated: false, executionTimeMs: 5 })
    ),
  };
});

vi.mock('../../services/sshService', async (importOriginal) => {
  const actual = await importOriginal<typeof sshService>();
  return { ...actual, cancelToolCall: vi.fn(async () => true) };
});

vi.mock('../../utils/fileExport', () => ({
  saveFileWithPicker: vi.fn(async () => ({ saved: true })),
  sanitizeFilename: (name: string) => name.replace(/[\\/:*?"<>|]/g, '_'),
}));

describe('OracleSqlComposer safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks multi-statement SQL before executing and never shows connection secrets', async () => {
    render(<OracleSqlComposer />);
    fireEvent.change(screen.getByLabelText('Câu lệnh SQL'), {
      target: { value: 'SELECT 1 FROM DUAL; DELETE FROM employees' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Chạy/i }));
    await waitFor(() => expect(screen.getByText(/một câu lệnh SQL duy nhất/)).toBeDefined());
    expect(oracleService.executeOracleQuery).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('pass@secret-host');
  });

  it('cancels a pending query using the same generated call id', async () => {
    (oracleService.executeOracleQuery as any).mockImplementationOnce(() => new Promise(() => {}));
    render(<OracleSqlComposer />);
    fireEvent.click(screen.getByRole('button', { name: /Chạy/i }));
    await waitFor(() => expect(oracleService.executeOracleQuery).toHaveBeenCalled());
    const callId = (oracleService.executeOracleQuery as any).mock.calls[0]?.[2] as string;
    fireEvent.click(screen.getByRole('button', { name: /Hủy/i }));
    await waitFor(() => expect(sshService.cancelToolCall).toHaveBeenCalledWith(callId));
  });

  it('executes a select with a generated callId and renders the result grid', async () => {
    render(<OracleSqlComposer />);
    fireEvent.click(screen.getByRole('button', { name: /Chạy/i }));
    await waitFor(() => expect(oracleService.executeOracleQuery).toHaveBeenCalled());
    const callId = (oracleService.executeOracleQuery as any).mock.calls[0]?.[2] as string;
    expect(callId).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(screen.getByText('2 dòng · 5 ms')).toBeDefined());
    expect(screen.getByRole('grid')).toBeDefined();
  });
});
