import { describe, expect, it, vi } from 'vitest';
import {
  DOCUMENT_IMAGE_LIMITS,
  prepareDocumentImages,
  renderMermaidToPng,
  resolveDocumentImage,
} from '../documentImageResolver';

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('documentImageResolver', () => {
  it('accepts data:image/png and decodes bytes', async () => {
    const image = await resolveDocumentImage(`data:image/png;base64,${PNG_1X1}`, 'alt');
    expect(image?.extension).toBe('png');
    expect(image?.data.length).toBeGreaterThan(0);
    expect(image?.alt).toBe('alt');
  });

  it('rejects dangerous schemes and non-image data URLs without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const src of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html;base64,AAAA',
      'ftp://example.com/a.png',
    ]) {
      expect(await resolveDocumentImage(src, '')).toBeNull();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('resolves attachment: token from noteAttachments', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const db = { noteAttachments: { get: vi.fn().mockResolvedValue({ data: blob, mimeType: 'image/png' }) } } as any;
    const image = await resolveDocumentImage('attachment:abc123', 'att', db);
    expect(image?.extension).toBe('png');
    expect(db.noteAttachments.get).toHaveBeenCalledWith('abc123');
  });

  it('fetches http(s) image with strict content-type and no credentials', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      url: 'https://example.com/a.png',
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as Response);
    const image = await resolveDocumentImage('https://example.com/a.png', 'net');
    expect(image?.extension).toBe('png');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/a.png',
      expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' })
    );
    fetchSpy.mockRestore();
  });

  it('drops oversized data URLs', async () => {
    const huge = btoa('x'.repeat(DOCUMENT_IMAGE_LIMITS.maxImageBytes + 1));
    expect(await resolveDocumentImage(`data:image/png;base64,${huge}`, '')).toBeNull();
  });

  it('renders mermaid with injected renderer and rewrites markdown', async () => {
    const fakeSvg = '<svg viewBox="0 0 800 600"><rect width="800" height="600"/></svg>';
    const deps = {
      render: vi.fn().mockResolvedValue({ svg: fakeSvg }),
      rasterize: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
    };
    const result = await renderMermaidToPng('graph TD;A-->B', deps);
    expect(result?.extension).toBe('png');
    expect(result?.width).toBe(800);
    expect(deps.render).toHaveBeenCalled();

    const prepared = await prepareDocumentImages('# Doc\n```mermaid\ngraph TD;A-->B\n```', undefined, deps);
    expect(prepared.markdown).toContain('![Sơ đồ](data:image/png;base64,');
    expect(prepared.images.size).toBe(1);
  });

  it('fetch failure does not throw and image is skipped', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const prepared = await prepareDocumentImages('![x](https://bad.invalid/a.png)');
    expect(prepared.images.size).toBe(0);
    expect(prepared.markdown).toContain('![x](https://bad.invalid/a.png)');
    fetchSpy.mockRestore();
  });
});
