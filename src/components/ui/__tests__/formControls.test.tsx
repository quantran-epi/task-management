import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Form, FormItem } from '../form';
import { Radio, RadioButton, RadioGroup } from '../radio';

describe('RadioGroup event parity (CR-02 / WR-01)', () => {
  it('emits a real change event with target.value from RadioButton', () => {
    const onChange = vi.fn();
    const { container } = render(
      <RadioGroup value="a" onChange={onChange}>
        <RadioButton value="a">A</RadioButton>
        <RadioButton value="b">B</RadioButton>
      </RadioGroup>,
    );
    const radios = container.querySelectorAll('input[type="radio"]');
    expect(radios).toHaveLength(2);
    fireEvent.click(radios[1]!);
    expect(onChange.mock.calls[0]![0].target.value).toBe('b');
    expect(onChange.mock.calls[0]![0].target.checked).toBe(true);
  });

  it('tracks defaultValue without caller rerender and keeps groups isolated', () => {
    const { container } = render(
      <>
        <RadioGroup defaultValue="a">
          <Radio value="a">A1</Radio>
          <Radio value="b">B1</Radio>
        </RadioGroup>
        <RadioGroup defaultValue="x">
          <Radio value="x">X2</Radio>
          <Radio value="y">Y2</Radio>
        </RadioGroup>
      </>,
    );
    const inputs = container.querySelectorAll('input[type="radio"]');
    const names = new Set([...inputs].map((input) => (input as HTMLInputElement).name));
    expect(names.size).toBe(2);
    fireEvent.click(inputs[1]!);
    const secondGroup = container.querySelectorAll('[data-oi-control="radio-group"]')[1]!.querySelectorAll('input[type="radio"]');
    expect((inputs[1] as HTMLInputElement).checked).toBe(true);
    expect((secondGroup[0] as HTMLInputElement).checked).toBe(true);
  });

  it('works inside a FormItem using e.target.value as the stored value', async () => {
    const onFinish = vi.fn();
    render(
      <Form
        onFinish={onFinish}
        onFinishFailed={(info) => {
          throw new Error(`form invalid: ${JSON.stringify(info.errorFields)}`);
        }}
      >
        <FormItem name="type" initialValue="a" rules={[{ required: true }]}>
          <RadioGroup>
            <RadioButton value="a">A</RadioButton>
            <RadioButton value="b">B</RadioButton>
          </RadioGroup>
        </FormItem>
        <button type="submit">Submit</button>
      </Form>,
    );
    fireEvent.click(screen.getByText('B').closest('label')!.querySelector('input')!);
    fireEvent.click(screen.getByText('Submit'));
    await vi.waitFor(() => expect(onFinish).toHaveBeenCalled());
    expect(onFinish.mock.calls[0]![0].type).toBe('b');
  });
});
