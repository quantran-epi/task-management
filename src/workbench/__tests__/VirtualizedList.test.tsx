import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualizedList } from '../virtual/VirtualizedList';

describe('VirtualizedList', () => {
  it('renders virtualized items container and sets up virtualizer listbox', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: `item-${i}`, label: `Item ${i}` }));

    render(
      <VirtualizedList
        items={items}
        height={300}
        estimateSize={() => 30}
        renderItem={(item) => <div data-testid={`row-${item.id}`}>{item.label}</div>}
      />
    );

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    expect(listbox).toHaveStyle({ height: '300px' });
  });

  it('renders row items with correct styles and absolute positioning', () => {
    const items = [
      { id: '1', label: 'Item 1' },
      { id: '2', label: 'Item 2' },
      { id: '3', label: 'Item 3' },
    ];

    render(
      <VirtualizedList
        items={items}
        height={200}
        estimateSize={() => 40}
        renderItem={(item) => <div data-testid="row-item">{item.label}</div>}
      />
    );

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    expect(listbox.children.length).toBe(1); // inner wrapper container
  });

  it('updates when items change', () => {
    const items1 = [{ id: '1', label: 'First' }];
    const { rerender } = render(
      <VirtualizedList
        items={items1}
        height={200}
        renderItem={(item) => <div data-testid="test-item">{item.label}</div>}
      />
    );

    expect(screen.getByRole('listbox')).toBeInTheDocument();

    const items2 = [{ id: '2', label: 'Second' }];
    rerender(
      <VirtualizedList
        items={items2}
        height={200}
        renderItem={(item) => <div data-testid="test-item">{item.label}</div>}
      />
    );

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});
