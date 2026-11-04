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
}

export function Stripe({ slot, items }: StripeProps) {
  const activeId = useLayoutStore((state) => {
    if (slot === 'left') return state.leftActiveId;
    if (slot === 'right') return state.rightActiveId;
    return state.bottomActiveId;
  });
  const toggleToolWindow = useLayoutStore((state) => state.toggleToolWindow);

  const isHorizontal = slot === 'bottom';

  return (
    <aside
      aria-label={`${slot} tool window stripe`}
      style={{
        width: isHorizontal ? '100%' : 'var(--stripe-width, 32px)',
        minWidth: isHorizontal ? 'auto' : 'var(--stripe-width, 32px)',
        height: isHorizontal ? 'var(--stripe-width, 32px)' : '100%',
        minHeight: isHorizontal ? 'var(--stripe-width, 32px)' : 'auto',
        background: 'var(--bg-island, #f7f8f9)',
        borderRight: slot === 'left' ? '1px solid var(--border, #e9eaee)' : undefined,
        borderLeft: slot === 'right' ? '1px solid var(--border, #e9eaee)' : undefined,
        borderTop: slot === 'bottom' ? '1px solid var(--border, #e9eaee)' : undefined,
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        alignItems: 'center',
        padding: isHorizontal ? '0 4px' : '4px 0',
        gap: 2,
        userSelect: 'none',
        boxSizing: 'border-box',
        zIndex: 5,
      }}
    >
      {items.map((item) => {
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
                width: 28,
                height: 28,
                padding: 0,
                border: 'none',
                background: isActive ? 'var(--bg-hover, #ededed)' : 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                color: isActive ? 'var(--fg, #000000)' : 'var(--fg-icon, #6c707e)',
                outline: 'none',
              }}
            >
              {/* Active 2px blue indicator bar */}
              {isActive && (
                <span
                  style={{
                    position: 'absolute',
                    background: 'var(--accent, #3871e1)',
                    ...(slot === 'left'
                      ? { left: 0, top: 2, bottom: 2, width: 2 }
                      : slot === 'right'
                      ? { right: 0, top: 2, bottom: 2, width: 2 }
                      : { bottom: 0, left: 2, right: 2, height: 2 }),
                  }}
                />
              )}

              <Badge
                count={item.badge ?? 0}
                overflowCount={99}
                size="small"
                offset={[4, -4]}
                styles={{ indicator: { fontSize: 9, padding: '0 3px', minWidth: 14, height: 14, lineHeight: '14px' } }}
              >
                <span style={{ fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.icon}
                </span>
              </Badge>
            </button>
          </Tooltip>
        );
      })}
    </aside>
  );
}
