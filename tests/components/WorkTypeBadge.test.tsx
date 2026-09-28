import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { WorkTypeBadge, WORK_TYPE_CONFIG } from '../../src/components/tasks/WorkTypeBadge';
import { WORK_TYPES, type WorkType } from '../../src/types/models';

describe('WorkTypeBadge', () => {
  it('renders all 7 work types with correct labels and colors', () => {
    for (const wt of WORK_TYPES) {
      const config = WORK_TYPE_CONFIG[wt];
      const { container, unmount } = render(<WorkTypeBadge workType={wt} />);
      expect(screen.getByText(config.label)).toBeInTheDocument();
      const tag = container.querySelector('.ant-tag');
      expect(tag).toHaveClass(`ant-tag-${config.color}`);
      unmount();
    }
  });

  it('defaults to code when workType is undefined', () => {
    const { container } = render(<WorkTypeBadge />);
    expect(screen.getByText('Lập trình')).toBeInTheDocument();
    const tag = container.querySelector('.ant-tag');
    expect(tag).toHaveClass('ant-tag-blue');
  });

  it('applies custom style prop', () => {
    const { container } = render(
      <WorkTypeBadge workType="document" style={{ opacity: 0.5 }} />
    );
    const tag = container.querySelector('.ant-tag');
    expect(tag).toHaveStyle({ opacity: '0.5' });
  });
});
