import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { InputRef } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { Input } from '../input';
import { Textarea } from '../textarea';
import { DateRangePicker } from '../date-picker';
import { EmptyImageSimple } from '../empty';

describe('wave 02 additive wrapper extensions (D-03)', () => {
  it('forwards an InputRef for search fields', () => {
    const ref = createRef<InputRef>();
    render(<Input ref={ref} aria-label="Tìm" />);
    expect(ref.current).not.toBeNull();
    expect(screen.getByLabelText('Tìm')).toBeInTheDocument();
  });

  it('forwards a textarea ref for the standup fallback', () => {
    const ref = createRef<TextAreaRef>();
    render(<Textarea ref={ref} placeholder="Fallback" />);
    expect(ref.current?.nativeElement).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('keeps the AntD range-picker value/onChange signature at the view boundary', () => {
    expect(typeof DateRangePicker).toBe('function');
  });

  it('mirrors the Empty simple image for migrated views', () => {
    expect(EmptyImageSimple).toBeDefined();
  });
});
