import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UpgradeModal } from '../src/components/shell/UpgradeModal';
import { ResetDbModal } from '../src/components/common/ResetDbModal';
import * as seeds from '../src/db/seeds';

describe('UpgradeModal concurrency listeners (DATA-04, D-09, D-10)', () => {
  it('does not display modal initially', () => {
    render(<UpgradeModal />);
    expect(screen.queryByText('Nâng cấp cơ sở dữ liệu bị chặn')).not.toBeInTheDocument();
  });

  it('displays modal when db-upgrade-blocked event is dispatched', async () => {
    render(<UpgradeModal />);
    window.dispatchEvent(new CustomEvent('db-upgrade-blocked'));
    expect(await screen.findByText('Nâng cấp cơ sở dữ liệu bị chặn')).toBeInTheDocument();
    expect(screen.getByText(/Nâng cấp cơ sở dữ liệu bị chặn bởi một tab khác/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tải lại trang/i })).toBeInTheDocument();
  });

  it('displays modal when db-version-changed event is dispatched', async () => {
    render(<UpgradeModal />);
    window.dispatchEvent(new CustomEvent('db-version-changed'));
    expect(await screen.findByText('Nâng cấp cơ sở dữ liệu bị chặn')).toBeInTheDocument();
  });

  it('removes event listeners on unmount', () => {
    const { unmount } = render(<UpgradeModal />);
    unmount();
    window.dispatchEvent(new CustomEvent('db-upgrade-blocked'));
    expect(screen.queryByText('Nâng cấp cơ sở dữ liệu bị chặn')).not.toBeInTheDocument();
  });
});

describe('ResetDbModal guarded purge (DATA-04, D-07, D-08, T-01-03)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with disabled confirm button when open', () => {
    render(<ResetDbModal open={true} onClose={onClose} />);
    expect(screen.getByText('Đặt lại cơ sở dữ liệu')).toBeInTheDocument();
    const okBtn = screen.getByRole('button', { name: /Xác nhận đặt lại/i });
    expect(okBtn).toBeDisabled();
  });

  it('keeps button disabled when input does not strictly match RESET', () => {
    render(<ResetDbModal open={true} onClose={onClose} />);
    const input = screen.getByPlaceholderText('RESET');
    const okBtn = screen.getByRole('button', { name: /Xác nhận đặt lại/i });

    fireEvent.change(input, { target: { value: 'reset' } });
    expect(okBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'RESET ' } });
    expect(okBtn).toBeDisabled();
  });

  it('enables button when exact text RESET is typed and calls resetDatabaseToDefaults on submit', async () => {
    const resetSpy = vi.spyOn(seeds, 'resetDatabaseToDefaults').mockResolvedValue(undefined);

    render(<ResetDbModal open={true} onClose={onClose} />);
    const input = screen.getByPlaceholderText('RESET');
    const okBtn = screen.getByRole('button', { name: /Xác nhận đặt lại/i });

    fireEvent.change(input, { target: { value: 'RESET' } });
    expect(okBtn).not.toBeDisabled();

    fireEvent.click(okBtn);

    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
