import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResizeSplitter } from '../../../src/components/common/ResizeSplitter';

describe('ResizeSplitter Component', () => {
  it('unmount tháo listeners, release đúng pointer và bỏ pointer khác', () => {
    const onResize = vi.fn();
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<ResizeSplitter currentWidth={300} minWidth={200} maxWidth={500} onResize={onResize} />);
    const splitter = screen.getByRole('separator');
    splitter.setPointerCapture = vi.fn();
    splitter.hasPointerCapture = vi.fn(() => true);
    splitter.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(splitter, { button: 0, clientX: 100, pointerId: 7 });
    fireEvent.pointerMove(window, { clientX: 150, pointerId: 8 });
    fireEvent.pointerUp(window, { pointerId: 8 });
    expect(onResize).not.toHaveBeenCalled();
    fireEvent.pointerMove(window, { clientX: 150, pointerId: 7 });
    expect(onResize).toHaveBeenCalledExactlyOnceWith(350);
    fireEvent.pointerDown(splitter, { button: 0, clientX: 100, pointerId: 9 });
    expect(splitter.releasePointerCapture).toHaveBeenCalledWith(7);
    unmount();
    expect(splitter.releasePointerCapture).toHaveBeenCalledWith(9);
    expect(splitter.releasePointerCapture).toHaveBeenCalledTimes(2);
    for (const type of ['pointermove', 'pointerup', 'pointercancel']) {
      expect(remove.mock.calls.filter(([name]) => name === type)).toHaveLength(2);
    }
    fireEvent.pointerMove(window, { clientX: 200, pointerId: 9 });
    fireEvent.pointerUp(window, { pointerId: 9 });
    expect(onResize).toHaveBeenCalledTimes(1);
    remove.mockRestore();
  });
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
    fireEvent(window, new PointerEvent('pointermove', { clientX: 150, pointerId: 1 }));
    expect(handleResize).toHaveBeenCalledWith(350);

    // Drag left beyond min (-200px -> 300 - 200 = 100 -> clamped to 200)
    fireEvent(window, new PointerEvent('pointermove', { clientX: -100, pointerId: 1 }));
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
    fireEvent(window, new PointerEvent('pointermove', { clientX: 450, pointerId: 2 }));
    expect(handleResize).toHaveBeenCalledWith(250);

    // Drag right by 100px (clientX = 600) -> width should decrease to 100, clamped to min 140
    fireEvent(window, new PointerEvent('pointermove', { clientX: 600, pointerId: 2 }));
    expect(handleResize).toHaveBeenCalledWith(140);

    // End drag
    fireEvent(window, new PointerEvent('pointerup', { pointerId: 2 }));
  });

  it.each([
    ["right", "ArrowLeft", 380, 396],
    ["right", "ArrowRight", 380, 364],
    ["left", "ArrowLeft", 380, 364],
    ["left", "ArrowRight", 380, 396],
    ["right", "ArrowLeft", 475, 480],
    ["right", "ArrowRight", 325, 320],
    ["left", "ArrowRight", 475, 480],
    ["left", "ArrowLeft", 325, 320],
    ["right", "Home", 380, 320],
    ["right", "End", 380, 480],
    ["left", "Home", 380, 320],
    ["left", "End", 380, 480],
    ["left", "ArrowRight", 380.4, 396],
  ] as const)("resizes %s pane with %s from %s to %s", (side, key, width, expected) => {
    const onResize = vi.fn();
    render(<ResizeSplitter side={side} currentWidth={width} minWidth={320} maxWidth={480} onResize={onResize} />);
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("separator"), event);
    expect(onResize).toHaveBeenCalledExactlyOnceWith(expected);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each(["Enter", " ", "Tab", "Escape"])("leaves %s unhandled", (key) => {
    const onResize = vi.fn();
    render(<ResizeSplitter currentWidth={380} minWidth={320} maxWidth={480} onResize={onResize} />);
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("separator"), event);
    expect(onResize).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("labels its controlled pane and shows focus without changing dimensions", () => {
    render(<ResizeSplitter currentWidth={380} minWidth={320} maxWidth={480} onResize={vi.fn()} ariaLabel="Chat panel width" ariaControls="chat-pane" />);
    const splitter = screen.getByRole("separator", { name: "Chat panel width" });
    expect(splitter).toHaveAttribute("aria-controls", "chat-pane");
    fireEvent.focus(splitter);
    expect(splitter).toHaveStyle({ outline: "2px solid #4f46e5", outlineOffset: "2px", width: "8px" });
    fireEvent.blur(splitter);
    expect(splitter.style.outline).toBe("");
  });
});
