import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import { TimePicker } from '../time-picker';

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { expect(errorSpy).not.toHaveBeenCalled(); errorSpy.mockRestore(); });

const popup = () => document.querySelector('[data-oi-control="time-picker-popup"]');

describe('native TimePicker', () => {
  it('stays closed after picking a time (focus restore must not reopen it)', () => {
    const onChange = vi.fn();
    const view = render(<TimePicker value={dayjs('2026-01-05T08:30:00')} onChange={onChange} />);
    const input = view.container.querySelector('[data-oi-control="time-picker"]') as HTMLInputElement;

    fireEvent.focus(input);
    expect(popup()).not.toBeNull();

    // Pick minute 45 from the minute column.
    const minuteColumn = document.querySelector('[aria-label="Phút"]') as HTMLElement;
    const option = minuteColumn.querySelector('[data-oi-control="list-row"]') as HTMLElement;
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(popup()).toBeNull();
    view.unmount();
  });

  it('gives each picker instance unique option ids', () => {
    const view = render(<><TimePicker /><TimePicker /></>);
    const inputs = view.container.querySelectorAll('[data-oi-control="time-picker"]');
    fireEvent.focus(inputs[0]!);
    fireEvent.focus(inputs[1]!);
    const ids = Array.from(document.querySelectorAll('[data-oi-control="list-row"]'))
      .map((row) => row.id)
      .filter(Boolean);
    // Both pickers render hour/minute/second options; no two share an id.
    expect(ids.length).toBe(288);
    expect(new Set(ids).size).toBe(288);
    view.unmount();
  });
});
