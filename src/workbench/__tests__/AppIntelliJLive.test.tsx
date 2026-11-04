import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AppIntelliJ from '../../AppIntelliJ';

describe('AppIntelliJ Live Mount Check', () => {
  it('mounts AppIntelliJ and renders without unhandled exceptions', () => {
    const { container } = render(<AppIntelliJ />);
    expect(container).toBeDefined();
    expect(screen.getByText('TaskMate')).toBeDefined();
  });
});
