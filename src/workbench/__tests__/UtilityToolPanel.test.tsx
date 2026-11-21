import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UtilityToolPanel } from '../toolwindows/UtilityToolPanel';

describe('UtilityToolPanel', () => {
  it('formats JSON with syntax-colored output and reports invalid input', () => {
    render(<UtilityToolPanel viewType="json_formatter" />);
    const input = screen.getByLabelText('JSON input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '{"name":"TaskMate","ok":true}' } });
    fireEvent.click(screen.getByRole('button', { name: /Format/i }));

    const output = screen.getByLabelText('JSON output');
    expect(output.textContent).toContain('"name": "TaskMate"');
    expect(output.querySelector('span[style*="color"]')).not.toBeNull();

    fireEvent.change(input, { target: { value: '{bad}' } });
    fireEvent.click(screen.getByRole('button', { name: /Format/i }));
    expect(screen.getAllByText(/❌/).length).toBeGreaterThan(0);
  });

  it('formats and minifies valid XML', () => {
    render(<UtilityToolPanel viewType="xml_formatter" />);
    const input = screen.getByLabelText('XML input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '<note><to>Quan</to></note>' } });
    fireEvent.click(screen.getByRole('button', { name: /Format/i }));
    const output = screen.getByLabelText('XML output');
    expect(output.textContent).toContain('<to>Quan</to>');
    expect(output.textContent).toContain('\n');

    fireEvent.click(screen.getByRole('button', { name: /Minify/i }));
    expect(output.textContent).toBe('<note><to>Quan</to></note>');
  });

  it('preserves XML comments, CDATA and mixed content', () => {
    render(<UtilityToolPanel viewType="xml_formatter" />);
    const input = screen.getByLabelText('XML input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '<root><!-- keep this --><![CDATA[<raw>]]><?pi go?><p>Hello <b>world</b>!</p></root>' } });
    fireEvent.click(screen.getByRole('button', { name: /Format/i }));

    const output = screen.getByLabelText('XML output');
    expect(output.textContent).toContain('<!-- keep this -->');
    expect(output.textContent).toContain('<![CDATA[<raw>]]>');
    expect(output.textContent).toContain('<?pi go?>');
    expect(output.textContent).toContain('Hello <b>world</b>!');
  });

  it('detects added and removed lines in Text Compare', () => {
    render(<UtilityToolPanel viewType="text_compare" />);
    fireEvent.change(screen.getByLabelText('Text A'), { target: { value: 'one\ntwo' } });
    fireEvent.change(screen.getByLabelText('Text B'), { target: { value: 'one\nthree' } });

    expect(screen.getByText(/2 thay đổi/)).toBeDefined();
    expect(screen.getAllByText(/three/).length).toBeGreaterThan(1);
  });
});
