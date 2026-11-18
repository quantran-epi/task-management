import { describe, it, expect, vi } from 'vitest';
import { prepareSvgForExport, downloadMermaidSvg } from '../../src/utils/mermaidExport';
import * as fileExport from '../../src/utils/fileExport';

describe('mermaidExport', () => {
  it('prepareSvgForExport adds xmlns, dimensions and background color', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 500 300');
    const { svgString, width, height } = prepareSvgForExport(svg, true);

    expect(width).toBe(500);
    expect(height).toBe(300);
    expect(svgString).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svgString).toContain('width="500"');
    expect(svgString).toContain('height="300"');
    expect(svgString).toContain('background-color: rgb(20, 20, 20)');
  });

  it('downloadMermaidSvg calls saveFileWithPicker with SVG blob', async () => {
    const saveFileSpy = vi.spyOn(fileExport, 'saveFileWithPicker').mockResolvedValue({ saved: true });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 100');

    const res = await downloadMermaidSvg(svg, { filename: 'test-diagram' });
    expect(res).toBe(true);
    expect(saveFileSpy).toHaveBeenCalled();
    const [calledFilename, calledBlob] = saveFileSpy.mock.calls[0]!;
    expect(calledFilename).toContain('test-diagram');
    expect(calledFilename.endsWith('.svg')).toBe(true);
    expect(calledBlob.type).toBe('image/svg+xml;charset=utf-8');

    saveFileSpy.mockRestore();
  });

  it('downloadMermaidSvg returns false when svgEl is null', async () => {
    const res = await downloadMermaidSvg(null);
    expect(res).toBe(false);
  });
});
