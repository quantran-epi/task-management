import pptxgenjs from 'pptxgenjs';
import { APP_NAME } from '../constants/app';
import { sanitizeFilename, downloadBlob } from './fileExport';

export interface SlideData {
  title?: string;
  subtitle?: string;
  bullets?: string[];
  table?: string[][];
  notes?: string;
  layout?: 'title' | 'content' | 'section';
}

export interface PptxOptions {
  presentationTitle?: string;
  author?: string;
  company?: string;
  revision?: string;
}

export interface PptxExportResult {
  filename: string;
  format: 'pptx';
  sizeBytes: number;
  slideCount: number;
  blob: Blob;
}

// TaskMate Theme Colors
const THEME = {
  primary: '4F46E5', // Indigo
  primaryLight: 'EEF2FF',
  text: '1E293B', // Dark Slate
  textMuted: '64748B', // Slate
  background: 'FFFFFF',
  accent: '7C3AED', // Purple
  border: 'E2E8F0',
};

/**
 * Parses markdown text into an array of slide definitions.
 * Recognizes headings (#, ##), dividers (---), bullet points (- or *), and speaker notes.
 */
export function parseMarkdownToSlides(markdown: string): { title: string; slides: SlideData[] } {
  const lines = (markdown || '').split('\n');
  const slides: SlideData[] = [];
  let presentationTitle = 'Presentation';

  let currentSlide: SlideData | null = null;
  let inNotes = false;

  const pushCurrentSlide = () => {
    if (currentSlide && (currentSlide.title || (currentSlide.bullets && currentSlide.bullets.length > 0) || currentSlide.subtitle)) {
      slides.push(currentSlide);
    }
    currentSlide = null;
    inNotes = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const line = rawLine.trim();

    // Divider: --- or *** indicates slide split
    if (line === '---' || line === '***' || line === '___') {
      pushCurrentSlide();
      continue;
    }

    // Title slide or Presentation title: # Title
    if (line.startsWith('# ')) {
      const heading = line.slice(2).trim();
      if (slides.length === 0 && !currentSlide) {
        presentationTitle = heading;
        currentSlide = {
          title: heading,
          layout: 'title',
          bullets: [],
        };
      } else {
        pushCurrentSlide();
        currentSlide = {
          title: heading,
          layout: 'section',
          bullets: [],
        };
      }
      continue;
    }

    // Content slide: ## Title
    if (line.startsWith('## ')) {
      pushCurrentSlide();
      const heading = line.slice(3).trim();
      currentSlide = {
        title: heading,
        layout: 'content',
        bullets: [],
      };
      continue;
    }

    // Subtitle or H3: ### Subtitle
    if (line.startsWith('### ')) {
      const sub = line.slice(4).trim();
      if (!currentSlide) {
        currentSlide = { title: sub, layout: 'content', bullets: [] };
      } else if (!currentSlide.subtitle) {
        currentSlide.subtitle = sub;
      } else {
        currentSlide.bullets = currentSlide.bullets || [];
        currentSlide.bullets.push(sub);
      }
      continue;
    }

    // Speaker notes marker: Notes: or Note: or <!-- notes -->
    if (line.toLowerCase().startsWith('note:') || line.toLowerCase().startsWith('notes:')) {
      inNotes = true;
      const noteContent = line.replace(/^notes?:/i, '').trim();
      if (currentSlide) {
        currentSlide.notes = (currentSlide.notes ? `${currentSlide.notes}\n` : '') + noteContent;
      }
      continue;
    }

    if (inNotes) {
      if (line === '') {
        inNotes = false;
      } else if (currentSlide) {
        currentSlide.notes = (currentSlide.notes ? `${currentSlide.notes}\n` : '') + line;
      }
      continue;
    }

    // Table detection: line contains '|'
    if (line.startsWith('|') || (line.includes('|') && i + 1 < lines.length && lines[i + 1]!.includes('-|-'))) {
      const tableRows: string[][] = [];
      while (i < lines.length) {
        const tLine = lines[i]!.trim();
        if (!tLine || !tLine.includes('|')) break;
        // Skip separator row (|---|---|)
        if (/^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(tLine)) {
          i++;
          continue;
        }
        const cells = tLine
          .split('|')
          .map((c) => c.trim())
          .filter((_, idx, arr) => (idx !== 0 || !tLine.startsWith('|')) && (idx !== arr.length - 1 || !tLine.endsWith('|')));
        if (cells.length > 0) {
          tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) {
        if (!currentSlide) {
          currentSlide = { title: 'Data Overview', layout: 'content', bullets: [] };
        }
        currentSlide.table = tableRows;
      }
      continue;
    }

    // Bullet points: - item, * item, + item, 1. item
    const bulletMatch = line.match(/^[-*+]\s+(.*)$/) || line.match(/^\d+\.\s+(.*)$/);
    if (bulletMatch && bulletMatch[1]) {
      if (!currentSlide) {
        currentSlide = { title: 'Slide', layout: 'content', bullets: [] };
      }
      currentSlide.bullets = currentSlide.bullets || [];
      currentSlide.bullets.push(bulletMatch[1].trim());
      continue;
    }

    // Regular text paragraph
    if (line.length > 0) {
      if (!currentSlide) {
        currentSlide = { title: presentationTitle, layout: 'content', bullets: [] };
      }
      if (currentSlide.layout === 'title' && !currentSlide.subtitle) {
        currentSlide.subtitle = line;
      } else {
        currentSlide.bullets = currentSlide.bullets || [];
        currentSlide.bullets.push(line);
      }
    }
  }

  pushCurrentSlide();

  // If no slides detected, fallback to single slide with content
  if (slides.length === 0) {
    slides.push({
      title: presentationTitle,
      subtitle: markdown.slice(0, 100),
      layout: 'title',
    });
  }

  return { title: presentationTitle, slides };
}

/**
 * Builds a PptxGenJS instance and populates it with stylized slides.
 */
export function buildPptxPresentation(
  slides: SlideData[],
  options?: PptxOptions
): pptxgenjs {
  const pptx = new pptxgenjs();

  // Set widescreen 16:9 layout
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = options?.presentationTitle || `${APP_NAME} Presentation`;
  pptx.author = options?.author || `${APP_NAME} AI`;
  pptx.company = options?.company || APP_NAME;
  if (options?.revision) pptx.revision = options.revision;

  slides.forEach((slideData) => {
    const slide = pptx.addSlide();

    // Speaker notes
    if (slideData.notes) {
      slide.addNotes(slideData.notes);
    }

    if (slideData.layout === 'title') {
      // Title Slide Layout: clean centered hero with accent strip
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: '100%',
        h: 0.15,
        fill: { color: THEME.primary },
      });

      slide.addText(slideData.title || options?.presentationTitle || 'Untitled Presentation', {
        x: 0.8,
        y: 2.2,
        w: 11.7,
        h: 1.5,
        fontSize: 40,
        bold: true,
        color: THEME.text,
        fontFace: 'Helvetica Neue',
        align: 'left',
        valign: 'middle',
      });

      if (slideData.subtitle) {
        slide.addText(slideData.subtitle, {
          x: 0.8,
          y: 3.8,
          w: 11.7,
          h: 1.0,
          fontSize: 20,
          color: THEME.textMuted,
          fontFace: 'Helvetica Neue',
          align: 'left',
          valign: 'top',
        });
      }

      // Branding watermark
      slide.addText(`${APP_NAME} Workspace`, {
        x: 0.8,
        y: 6.5,
        w: 5.0,
        h: 0.4,
        fontSize: 11,
        color: THEME.textMuted,
        fontFace: 'Helvetica Neue',
      });
    } else if (slideData.layout === 'section') {
      // Section header slide
      slide.background = { color: THEME.primaryLight };

      slide.addText(slideData.title || 'Section', {
        x: 1.0,
        y: 2.5,
        w: 11.3,
        h: 1.6,
        fontSize: 36,
        bold: true,
        color: THEME.primary,
        fontFace: 'Helvetica Neue',
        align: 'left',
      });

      if (slideData.subtitle) {
        slide.addText(slideData.subtitle, {
          x: 1.0,
          y: 4.2,
          w: 11.3,
          h: 1.0,
          fontSize: 18,
          color: THEME.textMuted,
          fontFace: 'Helvetica Neue',
        });
      }
    } else {
      // Content Slide Layout
      // Top header bar with primary accent
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.8,
        y: 0.5,
        w: 0.1,
        h: 0.7,
        fill: { color: THEME.primary },
      });

      // Title
      slide.addText(slideData.title || 'Overview', {
        x: 1.1,
        y: 0.5,
        w: 11.0,
        h: 0.7,
        fontSize: 26,
        bold: true,
        color: THEME.text,
        fontFace: 'Helvetica Neue',
        valign: 'middle',
      });

      if (slideData.subtitle) {
        slide.addText(slideData.subtitle, {
          x: 1.1,
          y: 1.25,
          w: 11.0,
          h: 0.4,
          fontSize: 13,
          color: THEME.textMuted,
          fontFace: 'Helvetica Neue',
        });
      }

      // Tables
      if (slideData.table && slideData.table.length > 0) {
        const tableData = slideData.table.map((row, rowIdx) => {
          return row.map((cell) => {
            if (rowIdx === 0) {
              return {
                text: cell,
                options: {
                  bold: true,
                  color: 'FFFFFF',
                  fill: { color: THEME.primary },
                  fontSize: 13,
                  align: 'left' as const,
                },
              };
            }
            return {
              text: cell,
              options: {
                color: THEME.text,
                fill: { color: rowIdx % 2 === 0 ? 'F8FAFC' : 'FFFFFF' },
                fontSize: 12,
                align: 'left' as const,
              },
            };
          });
        });

        slide.addTable(tableData as any, {
          x: 1.1,
          y: slideData.subtitle ? 1.8 : 1.4,
          w: 11.0,
          border: { pt: 0.5, color: THEME.border },
          margin: 6,
        });
      }

      // Bullets
      if (slideData.bullets && slideData.bullets.length > 0) {
        const bulletItems = slideData.bullets.map((b) => ({
          text: b,
          options: {
            bullet: { type: 'bullet', code: '2022' },
            color: THEME.text,
            fontSize: 16,
            breakLine: true,
          },
        }));

        slide.addText(bulletItems as any, {
          x: 1.1,
          y: slideData.subtitle ? 1.8 : 1.5,
          w: 11.0,
          h: 4.8,
          fontFace: 'Helvetica Neue',
          valign: 'top',
          lineSpacing: 26,
        });
      }

      // Subtle bottom footer
      slide.addShape(pptx.ShapeType.line, {
        x: 0.8,
        y: 6.8,
        w: 11.7,
        h: 0,
        line: { color: THEME.border, width: 0.5 },
      });

      slide.addText(APP_NAME, {
        x: 0.8,
        y: 6.85,
        w: 4.0,
        h: 0.3,
        fontSize: 9,
        color: THEME.textMuted,
        fontFace: 'Helvetica Neue',
      });
    }
  });

  return pptx;
}

/**
 * Generates a PPTX Blob from an array of slide definitions.
 */
export async function generatePptxBlob(
  slides: SlideData[],
  options?: PptxOptions
): Promise<Blob> {
  const pptx = buildPptxPresentation(slides, options);
  const result = await pptx.write({ outputType: 'blob' });
  return result as Blob;
}

/**
 * Generates a PPTX Blob directly from markdown text.
 */
export async function generatePptxFromMarkdown(
  markdown: string,
  options?: PptxOptions
): Promise<{ blob: Blob; slideCount: number; title: string }> {
  const { title, slides } = parseMarkdownToSlides(markdown);
  const resolvedTitle = options?.presentationTitle || title;
  const blob = await generatePptxBlob(slides, {
    ...options,
    presentationTitle: resolvedTitle,
  });

  return {
    blob,
    slideCount: slides.length,
    title: resolvedTitle,
  };
}

/**
 * Unified helper to export and trigger browser download of a PowerPoint presentation.
 */
export async function exportPresentationAsFile(
  contentOrSlides: string | SlideData[],
  filename?: string,
  options?: PptxOptions,
  autoDownload: boolean = true
): Promise<PptxExportResult> {
  let blob: Blob;
  let slideCount = 0;
  let defaultTitle = 'presentation';

  if (typeof contentOrSlides === 'string') {
    const res = await generatePptxFromMarkdown(contentOrSlides, options);
    blob = res.blob;
    slideCount = res.slideCount;
    defaultTitle = res.title;
  } else {
    slideCount = contentOrSlides.length;
    defaultTitle = options?.presentationTitle || 'presentation';
    blob = await generatePptxBlob(contentOrSlides, options);
  }

  const baseFilename = sanitizeFilename(filename || `${defaultTitle}.pptx`);
  const finalFilename = baseFilename.toLowerCase().endsWith('.pptx')
    ? baseFilename
    : `${baseFilename}.pptx`;

  if (autoDownload) {
    downloadBlob(finalFilename, blob);
  }

  return {
    filename: finalFilename,
    format: 'pptx',
    sizeBytes: blob.size,
    slideCount,
    blob,
  };
}
