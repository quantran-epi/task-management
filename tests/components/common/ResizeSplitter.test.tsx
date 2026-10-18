import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResizeSplitter } from '../../../src/components/common/ResizeSplitter';

describe('ResizeSplitter Component', () => {
  it('renders with accessible separator role and bounds attributes', () => {
    render(
      <ResizeSplitter
        currentWidth={320}
        minWidth={200}
        maxWidth={600}
        defaultWidth={320}
        onResize={vi.fn()}
      />
    );

    const splitter = screen.getByRole('separator');
    expect(splitter).toBeInTheDocument();
    expect(splitter).toHaveAttribute('aria-valuenow', '320');
    expect(splitter).toHaveAttribute('aria-valuemin', '200');
    expect(splitter).toHaveAttribute('aria-valuemax', '600');
  });

  it('triggers onReset or resets to defaultWidth on double-click', () => {
    const handleReset = vi.fn();
    const handleResize = vi.fn();

    render(
      <ResizeSplitter
        currentWidth={450}
        minWidth={200}
        maxWidth={600}
        defaultWidth={320}
        onResize={handleResize}
        onReset={handleReset}
      />
    );

    const splitter = screen.getByRole('separator');
    fireEvent.doubleClick(splitter);

    expect(handleReset).toHaveBeenCalledTimes(1);
    expect(handleResize).not.toHaveBeenCalled();
  });

  it('calls onResize with defaultWidth on double-click when onReset is not provided', () => {
    const handleResize = vi.fn();

    render(
      <ResizeSplitter
        currentWidth={450}
        minWidth={200}
        maxWidth={600}
        defaultWidth={320}
        onResize={handleResize}
      />
    );

    const splitter = screen.getByRole('separator');
    fireEvent.doubleClick(splitter);

    expect(handleResize).toHaveBeenCalledWith(320);
  });

  it('handles pointer dragging to resize left side and clamps within min/max bounds', () => {
    const handleResize = vi.fn();

    render(
      <ResizeSplitter
        side="left"
        currentWidth={300}
        minWidth={200}
        maxWidth={500}
        onResize={handleResize}
      />
    );

    const splitter = screen.getByRole('separator');
    splitter.setPointerCapture = vi.fn();
    splitter.releasePointerCapture = vi.fn();

    // Start dragging
    fireEvent.pointerDown(splitter, { button: 0, clientX: 100, pointerId: 1 });
    expect(splitter.setPointerCapture).toHaveBeenCalledWith(1);

    // Drag right (+50px)
    fireEvent(window, new PointerEvent('pointermove', { clientX: 150 }));
    expect(handleResize).toHaveBeenCalledWith(350);

    // Drag left beyond min (-200px -> 300 - 200 = 100 -> clamped to 200)
    fireEvent(window, new PointerEvent('pointermove', { clientX: -100 }));
    expect(handleResize).toHaveBeenCalledWith(200);

    // End drag
    fireEvent(window, new PointerEvent('pointerup', { pointerId: 1 }));
  });

  it('handles pointer dragging to resize right side (inverted delta)', () => {
    const handleResize = vi.fn();

    render(
      <ResizeSplitter
        side="right"
        currentWidth={200}
        minWidth={140}
        maxWidth={400}
        onResize={handleResize}
      />
    );

    const splitter = screen.getByRole('separator');
    splitter.setPointerCapture = vi.fn();

    // Start dragging at clientX = 500
    fireEvent.pointerDown(splitter, { button: 0, clientX: 500, pointerId: 2 });

    // Drag left by 50px (clientX = 450) -> width should increase to 250
    fireEvent(window, new PointerEvent('pointermove', { clientX: 450 }));
    expect(handleResize).toHaveBeenCalledWith(250);

    // Drag right by 100px (clientX = 600) -> width should decrease to 100, clamped to min 140
    fireEvent(window, new PointerEvent('pointermove', { clientX: 600 }));
    expect(handleResize).toHaveBeenCalledWith(140);

    // End drag
    fireEvent(window, new PointerEvent('pointerup', { pointerId: 2 }));
  });
});
