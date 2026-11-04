import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface VirtualizedListProps<T> {
  items: T[];
  estimateSize?: (index: number) => number;
  renderItem: (item: T, index: number) => React.ReactNode;
  height?: number | string;
  overscan?: number;
  className?: string;
  style?: React.CSSProperties;
  role?: string;
  'aria-label'?: string;
}

export function VirtualizedList<T>({
  items,
  estimateSize = () => 36,
  renderItem,
  height = 360,
  overscan = 5,
  className,
  style,
  role = 'listbox',
  'aria-label': ariaLabel,
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan,
  });

  let virtualItems = virtualizer.getVirtualItems();

  // In jsdom / headless test environments without DOM layout engine, getBoundingClientRect() returns 0s.
  // Fallback: render window of items so DOM queries in unit tests and initial frames resolve.
  if (virtualItems.length === 0 && items.length > 0) {
    const fallbackCount = Math.min(items.length, 25);
    virtualItems = Array.from({ length: fallbackCount }, (_, index) => {
      const size = estimateSize(index);
      return {
        key: index,
        index,
        start: index * size,
        end: (index + 1) * size,
        size,
        lane: 0,
      };
    });
  }

  return (
    <div
      ref={parentRef}
      className={className}
      role={role}
      aria-label={ariaLabel}
      style={{
        height,
        overflowY: 'auto',
        contain: 'strict',
        width: '100%',
        ...style,
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize() || items.length * 36}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          if (item === undefined) return null;
          return (
            <div
              key={virtualRow.key ?? virtualRow.index}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
