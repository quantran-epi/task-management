import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Breadcrumb, BreadcrumbItem, BreadcrumbSeparator } from '../breadcrumb';
import { Card, CardGrid, CardMeta } from '../card';
import { Collapse, CollapsePanel } from '../collapse';
import { Descriptions, DescriptionsItem } from '../descriptions';
import { Form, FormErrorList, FormItem, FormList, useForm, useWatch } from '../form';
import { Input } from '../input';
import { Pagination } from '../pagination';

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});

describe('native Form field store', () => {
  it('keeps AntD-shaped finish/failed payloads and aria-invalid state', async () => {
    const onFinish = vi.fn();
    const onFinishFailed = vi.fn();
    const { container } = render(
      <Form
        initialValues={{ name: '' }}
        onFinish={onFinish}
        onFinishFailed={onFinishFailed}
      >
        <FormItem name="name" label="Tên" rules={[{ required: true, message: 'Bắt buộc' }]}>
          <Input aria-label="Tên" />
        </FormItem>
        <button type="submit">Submit</button>
      </Form>,
    );
    const form = container.querySelector('form') as HTMLFormElement;
    const input = screen.getByLabelText('Tên');
    expect(form).toHaveAttribute('data-required-mark', 'true');
    expect(screen.getByText('*')).toBeInTheDocument();
    fireEvent.submit(form);
    await act(async () => { await Promise.resolve(); });
    expect(onFinishFailed).toHaveBeenCalledTimes(1);
    expect(onFinishFailed.mock.calls[0]![0]).toMatchObject({
      values: { name: '' },
      outOfDate: false,
    });
    expect(onFinishFailed.mock.calls[0]![0].errorFields[0]).toMatchObject({
      name: ['name'],
      errors: ['Bắt buộc'],
    });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(container.querySelector('[data-oi-control="form-error-list"]')).toHaveTextContent('Bắt buộc');

    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.submit(form);
    await act(async () => { await Promise.resolve(); });
    expect(onFinish).toHaveBeenCalledWith({ name: 'x' });
  });

  it('maps labelPolicy to layout and lets caller layout win', () => {
    const { container, rerender } = render(<Form labelPolicy="left" />);
    expect(container.querySelector('form')).toHaveAttribute('data-state', 'horizontal');
    rerender(<Form labelPolicy="left" layout="inline" />);
    expect(container.querySelector('form')).toHaveAttribute('data-state', 'inline');
    rerender(<Form labelPolicy="inline" layout="vertical" />);
    expect(container.querySelector('form')).toHaveAttribute('data-state', 'vertical');
  });

  it('supports eight instance methods, useWatch, FormList and FormErrorList', async () => {
    let captured!: ReturnType<typeof useForm>[0];
    function Host() {
      const [form] = useForm();
      captured = form;
      const name = useWatch('name', form);
      return (
        <Form form={form as never} initialValues={{ name: 'a', links: [] }}>
          <FormItem name="name">
            <Input aria-label="Name" />
          </FormItem>
          <span data-testid="watched">{String(name)}</span>
          <FormList name="links">
            {(fields, { add, remove }) => (
              <div>
                {fields.map((field) => (
                  <FormItem key={field.key} name={[field.name]}>
                    <Input aria-label={`Link ${field.name}`} />
                  </FormItem>
                ))}
                <button type="button" onClick={() => add('x')}>Add</button>
                <button type="button" onClick={() => remove(0)}>Remove</button>
              </div>
            )}
          </FormList>
          <FormErrorList errors={['Lỗi']} />
        </Form>
      );
    }
    const { container } = render(<Host />);
    expect(screen.getByTestId('watched')).toHaveTextContent('a');
    expect(captured.getFieldValue('name')).toBe('a');
    expect(captured.getFieldsValue()).toMatchObject({ name: 'a' });
    act(() => captured.setFieldValue('name', 'b'));
    expect(screen.getByTestId('watched')).toHaveTextContent('b');
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByLabelText('Link 0')).toBeInTheDocument();
    act(() => captured.setFields([{ name: 'name', errors: ['Lỗi field'] }]));
    await act(async () => { await captured.validateFields().catch(() => {}); });
    expect(container.querySelector('[data-oi-control="form-error-list"]')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Remove'));
    expect(screen.queryByLabelText('Link 0')).not.toBeInTheDocument();
    await act(async () => {
      captured.setFieldsValue({ name: 'c' });
      captured.resetFields();
      captured.submit();
      await Promise.resolve();
    });
    expect(captured.getFieldValue('name')).toBe('a');
  });
});

describe('native Collapse', () => {
  it('toggles with keyboard, honours disabled panels and emits onChange(key)', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Collapse defaultActiveKey="first" onChange={onChange}>
        <CollapsePanel key="first" header="First">Nội dung 1</CollapsePanel>
        <CollapsePanel key="second" header="Second" disabled>Nội dung 2</CollapsePanel>
      </Collapse>,
    );
    const headers = container.querySelectorAll('[data-oi-control="collapse-header"]');
    expect(headers[0]).toHaveAttribute('aria-expanded', 'true');
    expect(headers[0]).toHaveAttribute('data-state', 'expanded');
    expect(headers[1]).toHaveAttribute('data-state', 'disabled');
    fireEvent.keyDown(headers[0]!, { key: 'Enter' });
    expect(headers[0]).toHaveAttribute('aria-expanded', 'false');
    expect(onChange).toHaveBeenCalledWith([]);
    fireEvent.click(headers[1]!);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('native Pagination', () => {
  it('keeps active page, boundary disabled state and payload parity', () => {
    const onChange = vi.fn();
    const onShowSizeChange = vi.fn();
    const { container } = render(
      <Pagination
        current={3}
        pageSize={10}
        total={100}
        showSizeChanger
        onChange={onChange}
        onShowSizeChange={onShowSizeChange}
      />,
    );
    const active = container.querySelector('[data-oi-control="pagination-page"][data-state="selected"]');
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active).toHaveAttribute('aria-label', 'Trang 3');
    expect(container.querySelector('[data-oi-control="pagination-prev"]')).toHaveAttribute('data-state', 'default');
    const boundary = render(<Pagination current={1} pageSize={10} total={100} onChange={onChange} />);
    expect(boundary.container.querySelector('[data-oi-control="pagination-prev"]')).toHaveAttribute('data-state', 'disabled');
    fireEvent.click(screen.getAllByLabelText('Trang trước')[1]!);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Trang 4'));
    expect(onChange).toHaveBeenCalledWith(4, 10);
    const size = screen.getByLabelText('Số bản ghi mỗi trang') as HTMLSelectElement;
    fireEvent.change(size, { target: { value: '20' } });
    expect(onShowSizeChange).toHaveBeenCalled();
  });
});

describe('native Breadcrumb', () => {
  it('renders links, separators and aria-current on the last item', () => {
    const { container } = render(
      <Breadcrumb
        items={[{ title: 'Home', href: '/home' }, { title: 'Chi tiết' }]}
      />,
    );
    expect(container.querySelector('nav')).toHaveAttribute('aria-label', 'breadcrumb');
    expect(container.querySelectorAll('[data-oi-control="breadcrumb-separator"]')).toHaveLength(1);
    const links = container.querySelectorAll('[data-oi-control="breadcrumb-item"]');
    expect(links[0]?.querySelector('a')).toHaveAttribute('href', '/home');
    expect(links[links.length - 1]).toHaveAttribute('aria-current', 'page');
    const custom = render(
      <Breadcrumb separator="→">
        <BreadcrumbItem>A</BreadcrumbItem>
        <BreadcrumbSeparator>|</BreadcrumbSeparator>
        <BreadcrumbItem>B</BreadcrumbItem>
      </Breadcrumb>,
    );
    expect(custom.container.querySelector('[data-oi-control="breadcrumb-separator"]')).toHaveTextContent('|');
  });
});

describe('native Card and Descriptions', () => {
  it('exposes loading/empty/hover hooks without inventing copy', () => {
    const { container } = render(
      <Card loading title="Card" extra={<span>Extra</span>} cover={<CardGrid>Grid</CardGrid>}>
        <span data-testid="card-copy">Nội dung</span>
      </Card>,
    );
    expect(container.querySelector('[data-oi-control="card"]')).toHaveAttribute('data-state', 'loading');
    expect(container.querySelector('[data-oi-control="card"]')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Card')).toBeInTheDocument();
    expect(screen.getByText('Grid')).toBeInTheDocument();
    const meta = render(<Card><CardMeta title="Meta" description="Mô tả" /></Card>);
    expect(meta.container.querySelector('[data-oi-control="card-meta-title"]')).toHaveTextContent('Meta');
    expect(meta.container.querySelector('[data-oi-control="card-meta-description"]')).toHaveTextContent('Mô tả');
    const empty = render(<Card hoverable><span data-testid="card-copy-2">Nội dung</span></Card>);
    expect(empty.container.querySelector('[data-oi-control="card"]')).toHaveAttribute('data-state', 'hover');
    expect(screen.getByTestId('card-copy-2')).toBeInTheDocument();
    const blank = render(<Card />);
    expect(blank.container.querySelector('[data-oi-control="card"]')).toHaveAttribute('data-state', 'empty');
  });

  it('renders label/value pairs and marks empty values', () => {
    const { container } = render(
      <Descriptions bordered column={1} size="small">
        <DescriptionsItem label="Đường dẫn">/tmp/db.sqlite</DescriptionsItem>
        <DescriptionsItem label="Ghi chú" />
      </Descriptions>,
    );
    expect(container.querySelector('dl')).toHaveAttribute('data-oi-control', 'descriptions');
    expect(screen.getByText('Đường dẫn').tagName).toBe('DT');
    expect(screen.getByText('/tmp/db.sqlite').tagName).toBe('DD');
    const empty = container.querySelector('[data-state="empty"]');
    expect(empty).toBeInTheDocument();
  });
});

describe('host state preservation', () => {
  it('keeps local component state across form-driven rerenders', () => {
    function Host() {
      const [count, setCount] = useState(0);
      return (
        <Form>
          <button type="button" onClick={() => setCount((value) => value + 1)}>Count {count}</button>
          <FormItem name="name"><Input aria-label="Host name" /></FormItem>
        </Form>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByText('Count 0'));
    fireEvent.change(screen.getByLabelText('Host name'), { target: { value: 'x' } });
    expect(screen.getByText('Count 1')).toBeInTheDocument();
  });
});
