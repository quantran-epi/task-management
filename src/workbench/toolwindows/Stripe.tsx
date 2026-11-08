import React from 'react';
import { Badge, Tooltip } from 'antd';
import { useLayoutStore, type ToolWindowSlot } from '../store/layoutStore';

export interface ToolWindowItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  shortcut?: string;
  badge?: number;
}

export interface StripeProps {
  slot: ToolWindowSlot;
  items: ToolWindowItem[];
  bottomItems?: ToolWindowItem[];
}

export function Stripe({ slot, items, bottomItems }: StripeProps) {
  const activeId = useLayoutStore((state) => {
    if (slot === 'left') return state.leftActiveId;
    if (slot === 'right') return state.rightActiveId;
    return state.bottomActiveId;
  });
  const toggleToolWindow = useLayoutStore((state) => state.toggleToolWindow);

  const isHorizontal = slot === 'bottom';

  const renderButton = (item: ToolWindowItem) => {
    const isActive = activeId === item.id;
    const tooltipTitle = item.shortcut ? `${item.shortcut}: ${item.name}` : item.name;

    return (
      <Tooltip key={item.id} title={tooltipTitle} placement={isHorizontal ? 'top' : slot === 'left' ? 'right' : 'left'}>
        <button
          type="button"
          onClick={() => toggleToolWindow(slot, item.id)}
          aria-label={tooltipTitle}
          aria-pressed={isActive}
          style={{
            width: 30,
            height: 30,
            padding: 0,
            border: 'none',
            background: isActive ? 'var(--bg-island, #ffffff)' : 'transparent',
            borderRadius: 'var(--radius-control, 4px)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            color: isActive ? 'var(--fg-strong, #000000)' : 'var(--fg-muted, #6c707e)',
            boxShadow: isActive ? '0 1px 2px rgba(0, 0, 0, 0.08)' : 'none',
            outline: 'none',
            transition: 'all 0.15s ease',
          }}
        >
          {/* Active blue indicator bar */}
          {isActive && (
            <span
              style={{
                position: 'absolute',
                background: 'var(--accent, #3871e1)',
                borderRadius: 1,
                ...(slot === 'left'
                  ? { left: 0, top: 4, bottom: 4, width: 2.5 }
                  : slot === 'right'
                  ? { right: 0, top: 4, bottom: 4, width: 2.5 }
                  : { bottom: 0, left: 4, right: 4, height: 2.5 }),
              }}
            />
          )}

          <Badge
            count={item.badge ?? 0}
            overflowCount={99}
            size="small"
            offset={[4, -4]}
            styles={{ indicator: { fontSize: 9.5, padding: '0 3px', minWidth: 14, height: 14, lineHeight: '14px' } }}
          >
            <span style={{ fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {item.icon}
            </span>
          </Badge>
        </button>
      </Tooltip>
    );
  };

  return (
    <aside
      aria-label={`${slot} tool window stripe`}
      style={{
        width: isHorizontal ? '100%' : 'var(--stripe-width, 36px)',
        minWidth: isHorizontal ? 'auto' : 'var(--stripe-width, 36px)',
        height: isHorizontal ? 'var(--stripe-width, 36px)' : '100%',
        minHeight: isHorizontal ? 'var(--stripe-width, 36px)' : 'auto',
        background: 'transparent',
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        alignItems: 'center',
        padding: isHorizontal ? '0 8px' : '8px 0',
        gap: 4,
        userSelect: 'none',
        boxSizing: 'border-box',
        zIndex: 5,
        flexShrink: 0,
      }}
    >
      {items.map(renderButton)}
      {bottomItems && bottomItems.length > 0 && (
        <>
          <div style={{ flex: 1 }} />
          {bottomItems.map(renderButton)}
        </>
      )}
    </aside>
  );
}
