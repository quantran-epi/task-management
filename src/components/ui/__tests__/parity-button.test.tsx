import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../button';

/** Phase 59 B4 smoke: real state change, never a static className/style assertion. */
describe('Button parity focused behavior', () => {
  it('fires onClick with the click payload', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]?.type).toBe('click');
  });

  it('toggles aria-pressed on a real click', () => {
    function ToggleButton() {
      const [pressed, setPressed] = React.useState(false);
      return <Button aria-pressed={pressed} onClick={() => setPressed(!pressed)}>Toggle</Button>;
    }
    render(<ToggleButton />);
    const button = screen.getByRole('button', { name: 'Toggle' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('exposes aria-busy and suppresses clicks while loading', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Loading</Button>);
    const button = screen.getByRole('button', { name: 'Loading' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
