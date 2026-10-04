import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../../../src/components/common/PageHeader';
import { Button } from 'antd';

describe('PageHeader', () => {
  it('renders title and subtitle correctly', () => {
    render(
      <PageHeader
        title="Tiêu đề trang"
        subtitle="Mô tả phụ của trang"
      />
    );

    expect(screen.getByText('Tiêu đề trang')).toBeInTheDocument();
    expect(screen.getByText('Mô tả phụ của trang')).toBeInTheDocument();
  });

  it('renders extra actions and children when provided', () => {
    render(
      <PageHeader
        title="Trang có nút"
        extra={<Button>Thao tác</Button>}
      >
        <div>Nội dung toolbar con</div>
      </PageHeader>
    );

    expect(screen.getByText('Trang có nút')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thao tác' })).toBeInTheDocument();
    expect(screen.getByText('Nội dung toolbar con')).toBeInTheDocument();
  });
});
