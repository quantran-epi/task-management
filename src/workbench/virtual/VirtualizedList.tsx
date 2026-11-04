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
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
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
