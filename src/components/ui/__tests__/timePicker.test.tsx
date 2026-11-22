import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import dayjs from 'dayjs';
import { TimePicker, TimeRangePicker } from '../time-picker';

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { expect(errorSpy).not.toHaveBeenCalled(); errorSpy.mockRestore(); });

const popup = () => document.querySelector('[data-oi-control="time-picker-popup"]');
const rangePopup = () => document.querySelector('[data-oi-control="time-picker-range-popup"]');

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

  it('TimeRangePicker stays closed on Escape after a column holds focus (CR-01)', () => {
    const view = render(<TimeRangePicker value={[null, null]} />);
    const start = view.container.querySelector('[data-oi-control="time-picker"]') as HTMLInputElement;
    fireEvent.focus(start);
    expect(rangePopup()).not.toBeNull();

    // Keyboard navigation moves focus off the input onto a TimeColumn.
    const hourColumn = document.querySelector('[aria-label="Giờ"]') as HTMLElement;
    hourColumn.focus();
    fireEvent.keyDown(hourColumn, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(hourColumn);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(rangePopup()).toBeNull();
    view.unmount();
  });

  it('TimeRangePicker stays closed on outside pointerdown after a column holds focus (CR-01)', () => {
    const view = render(<TimeRangePicker value={[null, null]} />);
    const start = view.container.querySelector('[data-oi-control="time-picker"]') as HTMLInputElement;
    fireEvent.focus(start);
    expect(rangePopup()).not.toBeNull();

    const hourColumn = document.querySelector('[aria-label="Giờ"]') as HTMLElement;
    hourColumn.focus();
    expect(document.activeElement).toBe(hourColumn);
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    fireEvent.pointerDown(outside);

    expect(rangePopup()).toBeNull();
    outside.remove();
    view.unmount();
  });

  it('TimeRangePicker keeps the first end with a gated controlled caller (WR-03)', async () => {
    const onChange = vi.fn();
    type Pair = [dayjs.Dayjs | null, dayjs.Dayjs | null];
    // Caller ignores a half-built range until both ends exist (FeasibilityModal).
    function GatedCaller() {
      const [value, setValue] = useState<Pair | null>(null);
      return (
        <TimeRangePicker
          value={value}
          format="HH:mm"
          onChange={(dates) => {
            onChange(dates);
            if (dates && dates[0] && dates[1]) setValue(dates as Pair);
          }}
        />
      );
    }
    const view = render(<GatedCaller />);
    const inputs = view.container.querySelectorAll('[data-oi-control="time-picker"]');
    const pickHour = (text: string) => {
      const column = document.querySelector('[aria-label="Giờ"]') as HTMLElement;
      const option = Array.from(column.querySelectorAll('[data-oi-control="list-row"]'))
        .find((row) => row.textContent === text) as HTMLElement;
      fireEvent.click(option);
    };

    // First pick on start input: 08:00. Caller ignores the half range.
    fireEvent.focus(inputs[0]!);
    pickHour('08');
    const first = onChange.mock.calls.at(-1)![0];
    expect(first[0]?.format('HH:mm')).toBe('08:00');
    expect(first[1]).toBeNull();

    // Flush the focus-restore guard microtask before the second focus.
    await Promise.resolve();

    // Second pick on end input: 14:00. Draft must carry the first end.
    fireEvent.focus(inputs[1]!);
    pickHour('14');
    const second = onChange.mock.calls.at(-1)![0];
    expect(second[0]?.format('HH:mm')).toBe('08:00');
    expect(second[1]?.format('HH:mm')).toBe('14:00');
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
