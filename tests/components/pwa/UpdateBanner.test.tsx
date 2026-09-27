import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { UpdateBanner } from '../../../src/components/pwa/UpdateBanner';
import { FormGuardProvider, useFormGuard } from '../../../src/context/FormGuardContext';

// Helper component to register an active form in test tree
const FormRegistrar: React.FC<{ formId: string }> = ({ formId }) => {
  const { registerActiveForm } = useFormGuard();

  React.useEffect(() => {
    const unregister = registerActiveForm(formId);
    return unregister;
  }, [registerActiveForm, formId]);

  return <div data-testid="active-form">{formId}</div>;
};

describe('UpdateBanner component', () => {
  const mockOnUpdate = vi.fn();
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when needRefresh is false', () => {
    const { container } = render(
      <FormGuardProvider>
        <UpdateBanner
          needRefresh={false}
          onUpdate={mockOnUpdate}
          onDismiss={mockOnDismiss}
        />
      </FormGuardProvider>
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('pwa-update-banner')).not.toBeInTheDocument();
  });

  it('renders floating banner with Vietnamese copywriting when needRefresh is true', () => {
    render(
      <FormGuardProvider>
        <UpdateBanner
          needRefresh={true}
          onUpdate={mockOnUpdate}
          onDismiss={mockOnDismiss}
        />
      </FormGuardProvider>
    );

    expect(screen.getByTestId('pwa-update-banner')).toBeInTheDocument();
    expect(screen.getByText('Đã có bản cập nhật mới')).toBeInTheDocument();
    expect(
      screen.getByText('Phiên bản mới đã sẵn sàng. Tải lại để áp dụng cải tiến mới nhất.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cập nhật ngay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Để sau' })).toBeInTheDocument();
  });

  it('calls onDismiss when clicking "Để sau" button', () => {
    render(
      <FormGuardProvider>
        <UpdateBanner
          needRefresh={true}
          onUpdate={mockOnUpdate}
          onDismiss={mockOnDismiss}
        />
      </FormGuardProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    expect(mockOnUpdate).not.toHaveBeenCalled();
  });

  it('calls onDismiss when clicking close icon button', () => {
    render(
      <FormGuardProvider>
        <UpdateBanner
          needRefresh={true}
          onUpdate={mockOnUpdate}
          onDismiss={mockOnDismiss}
        />
      </FormGuardProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    expect(mockOnUpdate).not.toHaveBeenCalled();
  });

  it('calls onUpdate(true) directly when clicking "Cập nhật ngay" and no active form is open', () => {
    render(
      <FormGuardProvider>
        <UpdateBanner
          needRefresh={true}
          onUpdate={mockOnUpdate}
          onDismiss={mockOnDismiss}
        />
      </FormGuardProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật ngay' }));
    expect(mockOnUpdate).toHaveBeenCalledWith(true);
  });

  it('intercepts with ActiveFormGuardModal when an active form is registered', () => {
    render(
      <FormGuardProvider>
        <FormRegistrar formId="task-drawer" />
        <UpdateBanner
          needRefresh={true}
          onUpdate={mockOnUpdate}
          onDismiss={mockOnDismiss}
        />
      </FormGuardProvider>
    );

    // Click "Cập nhật ngay"
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật ngay' }));

    // onUpdate should NOT be called immediately
    expect(mockOnUpdate).not.toHaveBeenCalled();

    // ActiveFormGuardModal should be opened
    expect(screen.getByText('Cảnh báo: Dữ liệu chưa lưu')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Bạn đang mở một biểu mẫu chỉnh sửa. Nếu tải lại trang để cập nhật ngay bây giờ, các thay đổi chưa lưu sẽ bị mất.'
      )
    ).toBeInTheDocument();

    // Cancel preserves state without reloading
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại lưu dữ liệu' }));
    expect(mockOnUpdate).not.toHaveBeenCalled();

    // Click update again and confirm with "Bỏ qua và Tải lại"
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật ngay' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua và Tải lại' }));
    expect(mockOnUpdate).toHaveBeenCalledWith(true);
  });
});
