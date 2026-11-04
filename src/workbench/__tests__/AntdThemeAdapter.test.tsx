import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button, theme } from 'antd';
import { AntdThemeAdapter } from '../AntdThemeAdapter';
import '../../styles/workbench-tokens.css';

function TokenConsumer() {
  const { token } = theme.useToken();
  return (
    <div data-testid="token-consumer">
      <span data-testid="color-primary">{token.colorPrimary}</span>
      <span data-testid="border-radius">{token.borderRadius}</span>
      <span data-testid="font-size">{token.fontSize}</span>
      <span data-testid="control-height">{token.controlHeight}</span>
    </div>
  );
}

describe('AntdThemeAdapter', () => {
  it('renders children with compact light tokens', () => {
    render(
      <AntdThemeAdapter>
        <TokenConsumer />
        <Button>Test Button</Button>
      </AntdThemeAdapter>
    );

    expect(screen.getByTestId('color-primary').textContent).toBe('#3871e1');
    expect(screen.getByTestId('border-radius').textContent).toBe('3');
    // compactAlgorithm scales seed token values down (fontSize - 2, controlHeight - 6 etc.)
    expect(Number(screen.getByTestId('font-size').textContent)).toBeGreaterThan(0);
    expect(Number(screen.getByTestId('control-height').textContent)).toBe(22);
    expect(screen.getByText('Test Button')).toBeInTheDocument();
  });
});
