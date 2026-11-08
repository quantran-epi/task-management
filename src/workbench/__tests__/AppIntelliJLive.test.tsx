import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AppIntelliJ from '../../AppIntelliJ';

describe('AppIntelliJ Live Mount Check', () => {
  it('mounts AppIntelliJ and renders without unhandled exceptions', () => {
    const { container } = render(<AppIntelliJ />);
    expect(container).toBeDefined();
    // The splash screen and the title bar both render the app name, so match all of them.
    expect(screen.getAllByText('TaskMate').length).toBeGreaterThan(0);
  });
});
