import type { TaskPlannerDatabase } from '../db';
import { stripAnsiSequences } from '../services/diagramSaveBridge';

// ponytail: DOCX/PPTX export ceiling — extend to vector/SVG embedding if fidelity demands it.
export const DOCUMENT_IMAGE_LIMITS = {
  maxImageBytes: 10 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxImages: 20,
  fetchTimeoutMs: 10000,
} as const;

export type DocumentImageExtension = 'png' | 'jpeg' | 'gif';

export interface ResolvedDocumentImage {
  data: Uint8Array;
  extension: DocumentImageExtension;
  alt?: string;
  width: number;
  height: number;
}

export interface PreparedDocumentImages {
  markdown: string;
  images: Map<string, ResolvedDocumentImage>;
}

export interface MermaidRenderer {
  render: (id: string, code: string) => Promise<{ svg: string }>;
}

const DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg|gif);base64,([A-Za-z0-9+/=\s]+)$/i;
const IMAGE_MARKDOWN_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const MERMAID_FENCE_RE = /```mermaid\s*\r?\n([\s\S]*?)```/gi;

function bytesFromBase64(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export function extensionForMime(mime: string): DocumentImageExtension | null {
  const normalized = mime.trim().toLowerCase().split(';')[0];
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpeg';
  if (normalized === 'image/gif') return 'gif';
  return null;
}

export function extractImageSources(markdown: string): { src: string; alt: string }[] {
  const found: { src: string; alt: string }[] = [];
  for (const match of markdown.matchAll(IMAGE_MARKDOWN_RE)) {
    const src = (match[2] || '').trim();
    if (src) found.push({ src, alt: match[1] || '' });
  }
  return found;
}

async function defaultMermaidRenderer(): Promise<MermaidRenderer> {
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: 'default',
  });
  return {
    render: async (id, code) => {
      const result = await mermaid.render(id, code);
      return { svg: result.svg };
    },
  };
}

function dimensionsFromSvg(svg: string): { width: number; height: number } {
  const viewBox = svg.match(/viewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  const parts = viewBox?.trim().split(/[\s,]+/).map(Number);
  if (parts && parts.length === 4 && parts[2]! > 0 && parts[3]! > 0) {
    return { width: Math.ceil(parts[2]!), height: Math.ceil(parts[3]!) };
  }
  const width = Number(svg.match(/\bwidth\s*=\s*["']([\d.]+)/i)?.[1]);
  const height = Number(svg.match(/\bheight\s*=\s*["']([\d.]+)/i)?.[1]);
  return {
    width: Number.isFinite(width) && width > 0 ? Math.ceil(width) : 800,
    height: Number.isFinite(height) && height > 0 ? Math.ceil(height) : 600,
  };
}

function rasterizeSvg(svg: string, width: number, height: number): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width * scale);
      canvas.height = Math.max(1, height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      const dataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
      const img = new Image();
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/png').split(',')[1];
          resolve(base64 ? bytesFromBase64(base64) : null);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUri;
    } catch {
      resolve(null);
    }
  });
}

export async function renderMermaidToPng(
  code: string,
  deps?: Partial<MermaidRenderer> & { rasterize?: (svg: string, w: number, h: number) => Promise<Uint8Array | null> }
): Promise<ResolvedDocumentImage | null> {
  try {
    const renderer = deps?.render ? (deps as MermaidRenderer) : await defaultMermaidRenderer();
    const id = `doc-diagram-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { svg } = await renderer.render(id, code);
    if (!svg || !/<svg[\s>]/i.test(svg)) return null;
    const { width, height } = dimensionsFromSvg(svg);
    const rasterize = deps?.rasterize ?? rasterizeSvg;
    const data = await rasterize(svg, width, height);
    if (!data || data.length > DOCUMENT_IMAGE_LIMITS.maxImageBytes) return null;
    return { data, extension: 'png', width, height };
  } catch (err) {
    console.warn('[documentImageResolver] Mermaid render failed:', err);
    return null;
  }
}

async function resolveInlineImage(
  src: string,
  alt: string,
  db?: TaskPlannerDatabase
): Promise<ResolvedDocumentImage | null> {
  const dataMatch = src.match(DATA_IMAGE_RE);
  if (dataMatch) {
    const extension = extensionForMime(`image/${dataMatch[1]}`)!;
    const data = bytesFromBase64(dataMatch[2]!);
    if (!data.length || data.length > DOCUMENT_IMAGE_LIMITS.maxImageBytes) return null;
    return { data, extension, alt, width: 0, height: 0 };
  }

  const attachmentMatch = src.match(/^(?:attachment|a):([A-Za-z0-9-]+)$/i);
  if (attachmentMatch) {
    const attachment = await db?.noteAttachments?.get(attachmentMatch[1]!);
    if (!attachment || !(attachment.data instanceof Blob)) return null;
    const extension = extensionForMime(attachment.mimeType || '');
    if (!extension) return null;
    const buffer = await attachment.data.arrayBuffer();
    const data = new Uint8Array(buffer);
    if (!data.length || data.length > DOCUMENT_IMAGE_LIMITS.maxImageBytes) return null;
    return { data, extension, alt, width: 0, height: 0 };
  }

  if (/^https?:\/\//i.test(src)) {
    try {
      const response = await fetch(src, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(DOCUMENT_IMAGE_LIMITS.fetchTimeoutMs),
      });
      if (!response.ok) return null;
      const finalProtocol = new URL(response.url || src).protocol;
      if (finalProtocol !== 'http:' && finalProtocol !== 'https:') return null;
      const contentType = response.headers.get('content-type') || '';
      const extension = extensionForMime(contentType);
      if (!extension) return null;
      const data = new Uint8Array(await response.arrayBuffer());
      if (!data.length || data.length > DOCUMENT_IMAGE_LIMITS.maxImageBytes) return null;
      return { data, extension, alt, width: 0, height: 0 };
    } catch (err) {
      console.warn('[documentImageResolver] image fetch failed:', err);
      return null;
    }
  }

  return null;
}

export async function resolveDocumentImage(
  src: string,
  alt: string,
  db?: TaskPlannerDatabase
): Promise<ResolvedDocumentImage | null> {
  try {
    return await resolveInlineImage(src.trim(), alt, db);
  } catch (err) {
    console.warn('[documentImageResolver] image resolve failed:', err);
    return null;
  }
}

export async function prepareDocumentImages(
  markdown: string,
  db?: TaskPlannerDatabase,
  deps?: Parameters<typeof renderMermaidToPng>[1]
): Promise<PreparedDocumentImages> {
  const images = new Map<string, ResolvedDocumentImage>();
  let totalBytes = 0;

  const addImage = (src: string, image: ResolvedDocumentImage | null) => {
    if (!image || images.size >= DOCUMENT_IMAGE_LIMITS.maxImages) return false;
    if (totalBytes + image.data.length > DOCUMENT_IMAGE_LIMITS.maxTotalBytes) return false;
    images.set(src, image);
    totalBytes += image.data.length;
    return true;
  };

  const sourceList = extractImageSources(markdown);
  for (const { src, alt } of sourceList) {
    if (images.has(src)) continue;
    const image = await resolveDocumentImage(src, alt, db);
    addImage(src, image);
  }

  let prepared = markdown;
  const clean = stripAnsiSequences(markdown);
  const fenced: { block: string; code: string }[] = [];
  for (const match of clean.matchAll(MERMAID_FENCE_RE)) {
    const code = (match[1] || '').trim();
    if (!code) continue;
    fenced.push({ block: match[0], code });
  }
  for (const { block, code } of fenced) {
    const image = await renderMermaidToPng(code, deps);
    if (!image || !addImage(`mermaid:${code}`, image)) continue;
    const dataUrl = `data:image/png;base64,${base64FromBytes(image.data)}`;
    prepared = prepared.replace(block, `![Sơ đồ](${dataUrl})`);
  }

  return { markdown: prepared, images };
}
