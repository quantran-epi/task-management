import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchOutlined } from '@ant-design/icons';
import { Button, IconButton, type IconButtonProps } from '../button';
import { getSharedControlTokens } from '../tokens.contract';

const metrics = getSharedControlTokens();

describe('Button wrapper', () => {
  it('applies token-derived metrics, not a hand-typed font size', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('style')).toContain(`--ui-control-font-size: ${metrics.fontSize}px`);
    expect(button.getAttribute('style')).not.toMatch(/(^|;\s*)font-size:/);
  });

  it('maps variant danger to AntD danger semantics', () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('ant-btn-dangerous');
  });

  it('lets explicit caller type, danger and style win over the variant (WR-03)', () => {
    render(<Button type="link" danger={false} style={{ padding: 0 }}>Link</Button>);
    const button = screen.getByRole('button', { name: 'Link' });
    expect(button).toHaveClass('ant-btn-link');
    expect(button).not.toHaveClass('ant-btn-dangerous');
    expect(button.style.padding).toBe('0px');
    expect(button.getAttribute('style')).toContain(`--ui-control-font-size: ${metrics.fontSize}px`);
  });

  it('forwards loading and disabled states', () => {
    const { rerender } = render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
    rerender(<Button loading>Loading</Button>);
    expect(screen.getByRole('button')).toHaveClass('ant-btn-loading');
  });
});

describe('IconButton wrapper', () => {
  it('forwards the exact aria-label and defaults size to middle', () => {
    render(<IconButton aria-label="Tìm kiếm" icon={<SearchOutlined />} />);
    const button = screen.getByRole('button', { name: 'Tìm kiếm' });
    expect(button).not.toHaveClass('ant-btn-sm', 'ant-btn-lg');
    expect(button).toHaveClass('ant-btn-icon-only');
    expect(button.getAttribute('style')).toContain(`--ui-control-font-size: ${metrics.fontSize}px`);
    expect(button.getAttribute('style')).not.toMatch(/(^|;\s*)font-size:/);
  });

  it('requires aria-label at compile time', () => {
    // @ts-expect-error aria-label is mandatory on IconButton
    const missing: IconButtonProps = { icon: <SearchOutlined /> };
    expect(missing).toBeDefined();
  });
});
