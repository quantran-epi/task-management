import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchOutlined } from '../icon';
import { Button, IconButton, type IconButtonProps } from '../button';
import { getSharedControlTokens } from '../tokens.contract';

const metrics = getSharedControlTokens();

describe('Button wrapper', () => {
  it('applies token-derived metrics on a native button, not a hand-typed font size', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('data-oi-control')).toBe('button');
    expect(button.getAttribute('data-state')).toBe('secondary');
    expect(button.getAttribute('style')).toContain(`--ui-control-font-size: ${metrics.fontSize}px`);
    expect(button.getAttribute('style')).not.toMatch(/(^|;\s*)font-size:/);
  });

  it('maps variant primary/danger to the OpenIDEA native state', () => {
    const { rerender } = render(<Button variant="primary">Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('data-state', 'primary');
    rerender(<Button variant="danger">Delete</Button>);
    const danger = screen.getByRole('button', { name: 'Delete' });
    expect(danger).toHaveAttribute('data-state', 'danger');
    expect(danger.getAttribute('style')).toContain('--bg-button-primary: var(--danger-control)');
  });

  it('lets explicit caller type, danger and style win over the variant (WR-03)', () => {
    render(<Button type="link" danger={false} style={{ padding: 0 }}>Link</Button>);
    const button = screen.getByRole('button', { name: 'Link' });
    expect(button).toHaveAttribute('data-state', 'ghost');
    expect(button.style.padding).toBe('0px');
    expect(button.getAttribute('style')).toContain(`--ui-control-font-size: ${metrics.fontSize}px`);
  });

  it('renders a spinner for loading buttons instead of only a label', () => {
    render(<Button loading>Lưu thay đổi</Button>);
    const button = screen.getByRole('button', { name: /Lưu thay đổi/ });
    expect(button.querySelector('[role="status"]')).not.toBeNull();
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('keeps IconButton square and icon-sized, including small', () => {
    const { rerender } = render(<IconButton aria-label="Cài đặt" icon={<span>⚙</span>} />);
    const button = screen.getByRole('button', { name: 'Cài đặt' });
    expect(button.style.width).toBe('24px');
    expect(button.style.height).toBe('24px');
    expect(button.style.minWidth).toBe('24px');
    rerender(<IconButton aria-label="Cài đặt" size="small" icon={<span>⚙</span>} />);
    expect(button.style.width).toBe('20px');
    expect(button.style.height).toBe('20px');
  });

  it('forwards loading and disabled states with native semantics', () => {
    const { rerender } = render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
    rerender(<Button loading>Loading</Button>);
    const loading = screen.getByRole('button', { name: 'Loading' });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading).toBeDisabled();
  });
});

describe('IconButton wrapper', () => {
  it('forwards the exact aria-label and defaults size to middle', () => {
    render(<IconButton aria-label="Tìm kiếm" icon={<SearchOutlined />} />);
    const button = screen.getByRole('button', { name: 'Tìm kiếm' });
    expect(button).toHaveAttribute('data-oi-control', 'icon-button');
    expect(button).toHaveAttribute('data-size', 'middle');
    expect(button.getAttribute('style')).toContain(`--ui-control-font-size: ${metrics.fontSize}px`);
    expect(button.getAttribute('style')).not.toMatch(/(^|;\s*)font-size:/);
  });

  it('requires aria-label at compile time', () => {
    // @ts-expect-error aria-label is mandatory on IconButton
    const missing: IconButtonProps = { icon: <SearchOutlined /> };
    expect(missing).toBeDefined();
  });
});
