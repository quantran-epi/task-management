import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import {
  applyOperation,
  countLogicalLines,
  defaultSha256,
  detectEol,
  isRefusal,
  locateSection,
  preparePatch,
  readPatchTarget,
} from '../../../src/services/ai/patchProposal';

const NOTE_ID = 'note-35-01';
const MARKDOWN = '# Note\n\n## First\n\nOriginal text.\n\n## Second\n\nKeep this.';

async function seedNote(db: TaskPlannerDatabase, body = MARKDOWN): Promise<void> {
  await db.notes.add({
    id: NOTE_ID,
    title: 'Patch target',
    body,
    isPinned: false,
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
  });
}

describe('generic patch proposal core', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-patch-proposal-${Date.now()}-${Math.random()}`);
    await db.open();
    await seedNote(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('locates a section and its non-blank body core', () => {
    const result = locateSection(MARKDOWN, '1.1');
    expect(isRefusal(result)).toBe(false);
    if (isRefusal(result)) return;
    expect(result.section.title).toBe('First');
    expect(result.coreStart).toBe(4);
    expect(result.coreEnd).toBe(4);
  });

  it('refuses an unknown section id', () => {
    const result = locateSection(MARKDOWN, '9.9');
    expect(isRefusal(result)).toBe(true);
    if (!isRefusal(result)) return;
    expect(result.code).toBe('SECTION_NOT_FOUND');
  });

  it('detects CRLF and LF documents', () => {
    expect(detectEol('# Note\r\n\r\nBody')).toBe('\r\n');
    expect(detectEol('# Note\n\nBody')).toBe('\n');
  });

  it('appends or replaces section body while preserving surrounding sections', () => {
    const slice = locateSection(MARKDOWN, '1.1');
    expect(isRefusal(slice)).toBe(false);
    if (isRefusal(slice)) return;
    expect(applyOperation(MARKDOWN, slice, 'append', 'Added.')).toBe(
      '# Note\n\n## First\n\nOriginal text.\nAdded.\n\n## Second\n\nKeep this.'
    );
    expect(applyOperation(MARKDOWN, slice, 'replace', 'Replaced.')).toBe(
      '# Note\n\n## First\n\nReplaced.\n\n## Second\n\nKeep this.'
    );
  });

  it('counts logical lines without counting a trailing newline', () => {
    expect(countLogicalLines('')).toBe(0);
    expect(countLogicalLines('a\nb\n')).toBe(2);
  });

  it('refuses a stale base hash without a diff', async () => {
    const result = await preparePatch(db, {
      target: 'note', id: NOTE_ID, sectionId: '1.1', expectedHeading: 'First',
      baseHash: 'a'.repeat(64), operation: 'append', newContent: 'Changed.',
    });
    expect(isRefusal(result)).toBe(true);
    if (!isRefusal(result)) return;
    expect(result.code).toBe('SECTION_DRIFT');
    expect(result).not.toHaveProperty('diffText');
  });

  it('refuses content over the 120-line cap', async () => {
    const result = await preparePatch(db, {
      target: 'note', id: NOTE_ID, sectionId: '1.1', expectedHeading: 'First',
      baseHash: await defaultSha256(MARKDOWN.trim()), operation: 'append',
      newContent: Array.from({ length: 121 }, (_, index) => `line ${index}`).join('\n'),
    });
    expect(isRefusal(result)).toBe(true);
    if (!isRefusal(result)) return;
    expect(result.code).toBe('PATCH_TOO_LARGE');
    expect(result.cap).toBe(120);
  });

  it('refuses identical replacement as NO_CHANGES', async () => {
    const result = await preparePatch(db, {
      target: 'note', id: NOTE_ID, sectionId: '1.1', expectedHeading: 'First',
      baseHash: await defaultSha256(MARKDOWN.trim()), operation: 'replace', newContent: 'Original text.',
    });
    expect(isRefusal(result)).toBe(true);
    if (!isRefusal(result)) return;
    expect(result.code).toBe('NO_CHANGES');
  });

  it('returns a diff proposal and patched Markdown without writing', async () => {
    const before = await db.notes.get(NOTE_ID);
    const result = await preparePatch(db, {
      target: 'note', id: NOTE_ID, sectionId: '1.1', expectedHeading: 'First',
      baseHash: await defaultSha256(MARKDOWN.trim()), operation: 'append', newContent: 'Added.',
    });
    expect(isRefusal(result)).toBe(false);
    if (isRefusal(result)) return;
    expect(result.target).toBe('note');
    expect(result.id).toBe(NOTE_ID);
    expect(result.diffText.startsWith(`--- a/note:${NOTE_ID}\n+++ b/note:${NOTE_ID}`)).toBe(true);
    expect(result.patchedMarkdown).toContain('Added.');
    expect(await db.notes.get(NOTE_ID)).toEqual(before);
  });

  it('refuses a missing target id', async () => {
    const result = await readPatchTarget(db, { target: 'note', id: 'missing-note' });
    expect(isRefusal(result)).toBe(true);
    if (!isRefusal(result)) return;
    expect(result.code).toBe('ARTIFACT_NOT_FOUND');
  });
});
