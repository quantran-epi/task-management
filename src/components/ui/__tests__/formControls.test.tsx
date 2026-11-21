import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Form, FormItem } from '../form';
import { Checkbox, CheckboxGroup } from '../checkbox';
import { Popup } from '../native/popup';
import { Select } from '../select';
import { Radio, RadioButton, RadioGroup } from '../radio';
import { Switch } from '../switch';

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

describe('Switch content and uncontrolled state (WR-02)', () => {
  it('renders checkedChildren/unCheckedChildren without leaking DOM attributes', () => {
    const { container } = render(<Switch checked={false} checkedChildren={<span>ONX</span>} unCheckedChildren={<span>OFFX</span>} />);
    expect(screen.getByText('OFFX')).toBeInTheDocument();
    expect(container.querySelector('[checkedchildren]')).toBeNull();
    expect(container.querySelector('[uncheckedchildren]')).toBeNull();
  });

  it('toggles uncontrolled defaultChecked and reports the next value', () => {
    const onChange = vi.fn();
    render(<Switch defaultChecked onChange={onChange} />);
    const control = screen.getByRole('switch');
    expect(control).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(control);
    expect(onChange.mock.calls[0]![0]).toBe(false);
    expect(control).toHaveAttribute('aria-checked', 'false');
  });
});

describe('Popup focus handling (WR-05)', () => {
  it('keeps search input focused across rerenders and after clear', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Select
        aria-label="Chọn"
        showSearch
        value="a"
        options={[{ value: 'a', label: 'A' }]}
        onChange={onChange}
      />,
    );
    const input = container.querySelector('input') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(document.activeElement).toBe(input);
    fireEvent.click(screen.getAllByLabelText('Xóa lựa chọn')[0]!);
    expect(document.activeElement).toBe(input);
  });

  it('closes only the topmost popup on Escape', () => {
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const anchorRef = { current: anchor };
    const { unmount } = render(
      <>
        <Popup open anchorRef={anchorRef} onClose={onCloseOuter} label="outer"><span>outer</span></Popup>
        <Popup open anchorRef={anchorRef} onClose={onCloseInner} label="inner"><span>inner</span></Popup>
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseInner).toHaveBeenCalledTimes(1);
    expect(onCloseOuter).not.toHaveBeenCalled();
    unmount();
    anchor.remove();
  });
});

describe('Select event parity (WR-04)', () => {
  it('emits the full option and selects the first filtered row after typing', () => {
    const onChange = vi.fn();
    const onSearch = vi.fn();
    const { container } = render(
      <Select
        aria-label="Chọn"
        showSearch
        placeholder="Chọn"
        options={[{ value: 'apple', label: 'Apple' }, { value: 'banana', label: 'Banana' }]}
        onChange={onChange}
        onSearch={onSearch}
      />,
    );
    const input = container.querySelector('input[aria-label="Chọn"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ban' } });
    expect(onSearch).toHaveBeenCalledWith('ban');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange.mock.calls[0]![0]).toBe('banana');
    expect(onChange.mock.calls[0]![1]).toMatchObject({ value: 'banana', label: 'Banana' });
  });

  it('removes only the tag whose onClose was clicked', () => {
    const onChange = vi.fn();
    render(
      <Select
        mode="multiple"
        value={['a', 'b']}
        onChange={onChange}
        tagRender={({ value, onClose }) => (
          <button type="button" onClick={onClose}>remove-{String(value)}</button>
        )}
      />,
    );
    fireEvent.click(screen.getByText('remove-a'));
    expect(onChange.mock.calls[0]![0]).toEqual(['b']);
  });
});

describe('Checkbox event parity (WR-03)', () => {
  it('emits an array from CheckboxGroup', () => {
    const onChange = vi.fn();
    render(<CheckboxGroup options={['a', 'b', 'c']} defaultValue={['a']} onChange={onChange} />);
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[1]!);
    expect(onChange.mock.calls[0]![0]).toEqual(['a', 'b']);
  });

  it('keeps native event methods and submits the indeterminate value', () => {
    const onChange = vi.fn();
    const { container } = render(
      <form>
        <Checkbox value="mixed" name="mixed" indeterminate onChange={onChange}>Mixed</Checkbox>
      </form>,
    );
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box).toHaveAttribute('aria-checked', 'mixed');
    expect(new FormData(container.querySelector('form')!).get('mixed')).not.toBeNull();
    fireEvent.click(box);
    expect(typeof onChange.mock.calls[0]![0].stopPropagation).toBe('function');
    expect(typeof onChange.mock.calls[0]![0].preventDefault).toBe('function');
  });
});
