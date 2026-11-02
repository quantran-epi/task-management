import React, { useCallback, useState } from 'react';

export interface ResizeSplitterProps {
  /** Direction of the resizing pane relative to the splitter.
   * 'left': dragging right increases width (e.g. left folder tree).
   * 'right': dragging left increases width (e.g. right ToC rail).
   */
  side?: 'left' | 'right';
  currentWidth: number;
  minWidth: number;
  maxWidth: number;
  defaultWidth?: number;
  onResize: (newWidth: number) => void;
  onReset?: () => void;
  ariaLabel?: string;
  ariaControls?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const ResizeSplitter: React.FC<ResizeSplitterProps> = ({
  side = 'left',
  currentWidth,
  minWidth,
  maxWidth,
  defaultWidth,
  onResize,
  onReset,
  ariaLabel,
  ariaControls,
  className,
  style,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only primary mouse button or touch
      if (e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth = currentWidth;
      setIsDragging(true);

      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = side === 'left' ? startWidth + delta : startWidth - delta;
        const clamped = Math.max(minWidth, Math.min(maxWidth, newWidth));
        onResize(Math.round(clamped));
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        try {
          if (target.hasPointerCapture(upEvent.pointerId)) {
            target.releasePointerCapture(upEvent.pointerId);
          }
        } catch {}

        setIsDragging(false);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [currentWidth, minWidth, maxWidth, onResize, side]
  );

  const handleDoubleClick = useCallback(() => {
    if (onReset) {
      onReset();
    } else if (defaultWidth !== undefined) {
      onResize(defaultWidth);
    }
  }, [defaultWidth, onReset, onResize]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let width: number;
    switch (event.key) {
      case "ArrowLeft":
        width = currentWidth + (side === "right" ? 16 : -16);
        break;
      case "ArrowRight":
        width = currentWidth + (side === "right" ? -16 : 16);
        break;
      case "Home":
        width = minWidth;
        break;
      case "End":
        width = maxWidth;
        break;
      default:
        return;
    }
    event.preventDefault();
    onResize(Math.round(Math.max(minWidth, Math.min(maxWidth, width))));
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-controls={ariaControls}
      aria-orientation="vertical"
      aria-valuenow={currentWidth}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      data-testid="resize-splitter"
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className={className}
      style={{
        width: 8,
        minWidth: 8,
        cursor: 'col-resize',
        userSelect: 'none',
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 5,
        backgroundColor: 'transparent',
        margin: '0 -3px',
        transition: 'background-color 0.15s ease',
        ...style,
        outline: isFocused ? "2px solid #4f46e5" : undefined,
        outlineOffset: 2,
      }}
    >
      {/* Visual divider line inside the touch target */}
      <div
        style={{
          width: 2,
          height: '100%',
          backgroundColor: isDragging || isFocused ? '#4f46e5' : '#e5e7eb',
          borderRadius: 1,
          transition: 'background-color 0.15s ease, width 0.15s ease',
        }}
      />
    </div>
  );
};
