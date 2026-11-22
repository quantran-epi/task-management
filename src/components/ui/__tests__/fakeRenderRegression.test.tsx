import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import { CalendarOutlined } from '../icon';
import { DatePicker } from '../date-picker';
import { Title, Text } from '../typography';
import { Col } from '../grid';
import { Slider } from '../slider';
import { List, ListItem } from '../list';
import { TreeSelect, TreeSelectNode } from '../tree-select';
import { DirectoryTree } from '../tree';

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { expect(errorSpy).not.toHaveBeenCalled(); errorSpy.mockRestore(); });

describe('fake-render regression: real behavior + metrics (N-08)', () => {
  it('default icon renders at the 16px OpenIDEA baseline (never the 300x150 SVG fallback)', () => {
    const view = render(<CalendarOutlined aria-label="Lịch" />);
    const svg = view.container.querySelector('[data-oi-control="icon"]') as SVGSVGElement;
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('height')).toBe('16');
    expect(svg.style.fontSize).toBe('16px');
    view.unmount();
  });

  it('icon honours an explicit small size (14px)', () => {
    const view = render(<CalendarOutlined size={14} aria-label="Lịch" />);
    const svg = view.container.querySelector('[data-oi-control="icon"]') as SVGSVGElement;
    expect(svg.getAttribute('width')).toBe('14');
    expect(svg.getAttribute('height')).toBe('14');
    view.unmount();
  });

  it('DatePicker prev/next changes the month and header reflects it', () => {
    const view = render(<DatePicker value={dayjs('2026-01-05')} />);
    fireEvent.click(view.container.querySelector('[data-oi-control="date-picker"]')!);
    const month = () => view.baseElement.querySelector('[data-oi-control="calendar-month"]') as HTMLSelectElement;
    expect(month().value).toBe('0');
    fireEvent.click(view.baseElement.querySelector('[data-oi-control="calendar-next"]')!);
    expect(month().value).toBe('1');
    fireEvent.click(view.baseElement.querySelector('[data-oi-control="calendar-prev"]')!);
    expect(month().value).toBe('0');
    view.unmount();
  });

  it('DatePicker keyboard: ArrowRight moves lead, Enter commits that day', () => {
    const onChange = vi.fn();
    const view = render(<DatePicker value={dayjs('2026-01-05')} onChange={onChange} />);
    fireEvent.click(view.container.querySelector('[data-oi-control="date-picker"]')!);
    const cell = view.baseElement.querySelector('[data-oi-control="calendar-cell"][data-date="2026-01-05"]') as HTMLElement;
    fireEvent.keyDown(cell, { key: 'ArrowRight' });
    const next = view.baseElement.querySelector('[data-oi-control="calendar-cell"][data-date="2026-01-06"]') as HTMLElement;
    expect(document.activeElement).toBe(next);
    fireEvent.keyDown(next, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(expect.anything(), '2026-01-06');
    view.unmount();
  });

  it('DatePicker clear emits null when allowClear', () => {
    const onChange = vi.fn();
    const view = render(<DatePicker value={dayjs('2026-01-05')} onChange={onChange} />);
    fireEvent.click(view.container.querySelector('[data-oi-control="date-picker"]')!);
    fireEvent.click(view.baseElement.querySelector('[data-oi-control="calendar-clear"]')!);
    expect(onChange).toHaveBeenCalledWith(null, '');
    view.unmount();
  });

  it('Typography.Title honours level and strong/code/type props', () => {
    const view = render(
      <>
        <Title level={5}>Heading</Title>
        <Text strong code type="danger">Danger</Text>
      </>,
    );
    const heading = view.container.querySelector('[data-oi-control="heading"]')!;
    expect(heading.tagName).toBe('H5');
    expect(heading.getAttribute('data-level')).toBe('5');
    const text = view.container.querySelector('[data-oi-control="text"]')!;
    expect((text as HTMLElement).style.fontWeight).toBe('600');
    expect(text.querySelector('code')).not.toBeNull();
    view.unmount();
  });

  it('Grid.Col maps responsive span to gridColumn without leaking DOM attributes', () => {
    const view = render(<Col span={8} xs={12} offset={2} data-testid="col">x</Col>);
    const col = screen.getByTestId('col');
    expect(col.style.gridColumn).toBe('2 / span 12');
    expect(col.hasAttribute('xs')).toBe(false);
    expect(col.hasAttribute('span')).toBe(false);
    expect(col.hasAttribute('offset')).toBe(false);
    view.unmount();
  });

  it('Slider.onAfterChange reports the freshly committed value, not the stale render value', () => {
    const after = vi.fn();
    const view = render(<Slider defaultValue={10} min={0} max={100} onAfterChange={after} />);
    const handle = view.container.querySelector('[role="slider"]') as HTMLElement;
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(after).toHaveBeenCalledWith(11);
    view.unmount();
  });

  it('List.Item renders extra and actions instead of dropping them', () => {
    const view = render(
      <List
        dataSource={[{ id: 'a' }]}
        renderItem={(item) => <ListItem extra="extra-node" actions={[<button key="x">X</button>]}>{item.id}</ListItem>}
      />,
    );
    expect(view.container.textContent).toContain('extra-node');
    expect(view.container.querySelector('button')?.textContent).toBe('X');
    view.unmount();
  });

  it('TreeSelect reads TreeSelectNode children instead of ignoring them', () => {
    const onChange = vi.fn();
    const view = render(
      <TreeSelect onChange={onChange}>
        <TreeSelectNode value="root" title="Root">
          <TreeSelectNode value="child" title="Child" />
        </TreeSelectNode>
      </TreeSelect>,
    );
    const trigger = view.container.querySelector('[data-oi-control="tree-select"]') as HTMLInputElement;
    fireEvent.click(trigger);
    expect(view.baseElement.textContent).toContain('Root');
    expect(view.baseElement.textContent).toContain('Child');
    view.unmount();
  });

  it('DirectoryTree renders a real tree instead of null', () => {
    const view = render(<DirectoryTree treeData={[{ key: 'r', title: 'Root', children: [{ key: 'c', title: 'Child' }] }]} />);
    expect(view.container.querySelector('[data-oi-control="tree"]')).not.toBeNull();
    expect(view.container.querySelectorAll('[data-oi-control="tree-row"]').length).toBeGreaterThan(0);
    view.unmount();
  });
});
