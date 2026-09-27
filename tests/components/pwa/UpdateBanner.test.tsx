import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { UpdateBanner } from '../../../src/components/pwa/UpdateBanner';
import { FormGuardProvider, useFormGuard, useRegisterActiveForm } from '../../../src/context/FormGuardContext';

// Helper component to register an active form in test tree using manual registerActiveForm
const FormRegistrar: React.FC<{ formId: string }> = ({ formId }) => {
  const { registerActiveForm } = useFormGuard();

  React.useEffect(() => {
    const unregister = registerActiveForm(formId);
    return unregister;
  }, [registerActiveForm, formId]);

  return <div data-testid="active-form">{formId}</div>;
};

// Helper component to register an active form using useRegisterActiveForm hook
const HookFormRegistrar: React.FC<{ formId: string; active?: boolean }> = ({
  formId,
  active = true,
}) => {
  useRegisterActiveForm(formId, active);
  return <div data-testid="hook-active-form">{formId}</div>;
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

  it('useRegisterActiveForm dynamically activates and deactivates reload guard', () => {
    const { rerender } = render(
      <FormGuardProvider>
        <HookFormRegistrar formId="task-drawer" active={true} />
        <UpdateBanner
          needRefresh={true}
          onUpdate={mockOnUpdate}
          onDismiss={mockOnDismiss}
        />
      </FormGuardProvider>
    );

    // Active=true: intercepted
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật ngay' }));
    expect(mockOnUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Cảnh báo: Dữ liệu chưa lưu')).toBeInTheDocument();

    // Dismiss modal
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại lưu dữ liệu' }));

    // Re-render with active=false
    rerender(
      <FormGuardProvider>
        <HookFormRegistrar formId="task-drawer" active={false} />
        <UpdateBanner
          needRefresh={true}
          onUpdate={mockOnUpdate}
          onDismiss={mockOnDismiss}
        />
      </FormGuardProvider>
    );

    // Active=false: calls onUpdate(true) directly without guard modal
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật ngay' }));
    expect(mockOnUpdate).toHaveBeenCalledWith(true);
  });

  it.each([
    'task-drawer',
    'project-modal',
    'milestone-modal',
    'allocation-modal',
    'capacity-settings-modal',
    'feasibility-modal',
  ])('guards reload when %s is actively registered', (formId) => {
    render(
      <FormGuardProvider>
        <HookFormRegistrar formId={formId} active={true} />
        <UpdateBanner
          needRefresh={true}
          onUpdate={mockOnUpdate}
          onDismiss={mockOnDismiss}
        />
      </FormGuardProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật ngay' }));
    expect(mockOnUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Cảnh báo: Dữ liệu chưa lưu')).toBeInTheDocument();
  });
});
