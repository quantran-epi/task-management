import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IosInstallModal } from '../../../src/components/pwa/IosInstallModal';

describe('IosInstallModal', () => {
  it('renders modal with steps when open is true', () => {
    const handleClose = vi.fn();
    render(<IosInstallModal open={true} onClose={handleClose} />);

    expect(screen.getByText('Cài đặt trên iOS Safari')).toBeInTheDocument();
    expect(screen.getByText(/Chia sẻ/i)).toBeInTheDocument();
    expect(screen.getByText(/'Thêm vào MH chính'/i)).toBeInTheDocument();
    expect(screen.getByText(/'Thêm'/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đã hiểu' })).toBeInTheDocument();
  });

  it('calls onClose when "Đã hiểu" button is clicked', () => {
    const handleClose = vi.fn();
    render(<IosInstallModal open={true} onClose={handleClose} />);

    const closeBtn = screen.getByRole('button', { name: 'Đã hiểu' });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not display modal content when open is false', () => {
    const handleClose = vi.fn();
    render(<IosInstallModal open={false} onClose={handleClose} />);

    expect(screen.queryByText('Cài đặt trên iOS Safari')).not.toBeInTheDocument();
  });
});
