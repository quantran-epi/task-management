import { describe, it, expect, vi } from 'vitest';
import {
  parseMarkdownToSlides,
  generatePptxBlob,
  generatePptxFromMarkdown,
  exportPresentationAsFile,
} from '../pptxExport';
import * as fileExportModule from '../fileExport';

describe('pptxExport utility', () => {
  it('parses markdown with title, section, and bullet points into slide objects', () => {
    const md = `
# Q4 Roadmap & Strategic Goals
Welcome to the presentation

---

## Key Achievements
- Delivered Knowledge Base integration
- Shipped Pomodoro timer and audio alerts
- 99.9% offline local-first availability

---

## Next Steps
- PPTX export capability
- Image generation support
Note: Focus on Q1 timeline during speech
    `.trim();

    const { title, slides } = parseMarkdownToSlides(md);

    expect(title).toBe('Q4 Roadmap & Strategic Goals');
    expect(slides.length).toBe(3);

    // Slide 1: title slide
    expect(slides[0]?.title).toBe('Q4 Roadmap & Strategic Goals');
    expect(slides[0]?.layout).toBe('title');
    expect(slides[0]?.subtitle).toBe('Welcome to the presentation');

    // Slide 2: content slide
    expect(slides[1]?.title).toBe('Key Achievements');
    expect(slides[1]?.bullets).toHaveLength(3);
    expect(slides[1]?.bullets?.[0]).toBe('Delivered Knowledge Base integration');

    // Slide 3: notes slide
    expect(slides[2]?.title).toBe('Next Steps');
    expect(slides[2]?.bullets).toHaveLength(2);
    expect(slides[2]?.notes).toContain('Focus on Q1 timeline');
  });

  it('generates a valid Blob from structured slide objects', async () => {
    const slides = [
      {
        title: 'Project Kickoff',
        subtitle: 'Sprint 1',
        layout: 'title' as const,
      },
      {
        title: 'Agenda',
        bullets: ['Goal 1', 'Goal 2', 'Timeline'],
        notes: 'Speaker notes here',
        layout: 'content' as const,
      },
    ];

    const blob = await generatePptxBlob(slides, { presentationTitle: 'Project Kickoff' });
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(1000);
  });

  it('generates a presentation directly from markdown', async () => {
    const md = '# Fast Deck\n\n## First Slide\n- Bullet A\n- Bullet B';
    const result = await generatePptxFromMarkdown(md);

    expect(result.title).toBe('Fast Deck');
    expect(result.slideCount).toBe(2);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.size).toBeGreaterThan(1000);
  });

  it('exportPresentationAsFile sanitizes filename and triggers download', async () => {
    const downloadSpy = vi.spyOn(fileExportModule, 'downloadBlob').mockImplementation(() => {});

    const res = await exportPresentationAsFile(
      '# My Deck\n\n## Content\n- Point 1',
      '../illegal:deck',
      undefined,
      true
    );

    expect(res.filename).toBe('illegal_deck.pptx');
    expect(res.format).toBe('pptx');
    expect(res.slideCount).toBe(2);
    expect(res.sizeBytes).toBeGreaterThan(1000);
    expect(downloadSpy).toHaveBeenCalledWith('illegal_deck.pptx', res.blob);

    downloadSpy.mockRestore();
  });
});
