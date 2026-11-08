import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  JetBrainsDiagramIcon,
  JetBrainsSystemsIcon,
  JetBrainsRemoteGitIcon,
  JetBrainsSdlcIcon,
  JetBrainsProjectIcon,
  JetBrainsDocsIcon,
  JetBrainsTasksIcon,
} from '../JetBrainsIcons';

describe('JetBrains Colorful Icons', () => {
  it('renders JetBrainsDiagramIcon with flowchart shapes (polygon diamond, rect, circle)', () => {
    const { container } = render(<JetBrainsDiagramIcon size={20} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('width')).toBe('20');
    expect(container.querySelector('polygon')).toBeDefined();
    expect(container.querySelector('rect')).toBeDefined();
    expect(container.querySelector('circle')).toBeDefined();
  });

  it('renders JetBrainsSystemsIcon with 3-tier isometric architecture paths', () => {
    const { container } = render(<JetBrainsSystemsIcon size={18} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('width')).toBe('18');
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(3); // 3 isometric tier paths
  });

  it('renders JetBrainsRemoteGitIcon with git branch lines and remote globe', () => {
    const { container } = render(<JetBrainsRemoteGitIcon size={16} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('width')).toBe('16');
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThanOrEqual(3); // globe + commit dots
  });

  it('renders JetBrainsSdlcIcon with infinity loop path and milestone dots', () => {
    const { container } = render(<JetBrainsSdlcIcon size={14} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('width')).toBe('14');
    const path = container.querySelector('path');
    expect(path).toBeDefined();
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2); // 2 milestone dots
  });
});
