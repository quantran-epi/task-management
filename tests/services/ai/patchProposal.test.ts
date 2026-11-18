import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import {
  applyOperation,
  countLogicalLines,
  defaultSha256,
  detectEol,
  isRefusal,
  locateSection,
  PATCH_LINE_CAP,
  preparePatch,
  prepareSkillVersionDiff,
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
    expect('refused' in result).toBe(false);
    if ('refused' in result) return;
    expect(result.section.title).toBe('First');
    expect(result.coreStart).toBe(4);
    expect(result.coreEnd).toBe(4);
  });

  it('refuses an unknown section id', () => {
    const result = locateSection(MARKDOWN, '9.9');
    expect('refused' in result).toBe(true);
    if (!('refused' in result)) return;
    expect(result.code).toBe('SECTION_NOT_FOUND');
  });

  it('detects CRLF and LF documents', () => {
    expect(detectEol('# Note\r\n\r\nBody')).toBe('\r\n');
    expect(detectEol('# Note\n\nBody')).toBe('\n');
  });

  it('appends or replaces section body while preserving surrounding sections', () => {
    const slice = locateSection(MARKDOWN, '1.1');
    expect('refused' in slice).toBe(false);
    if ('refused' in slice) return;
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
    expect('diffText' in result).toBe(true);
    if (!('diffText' in result)) return;
    expect(result.target).toBe('note');
    expect(result.id).toBe(NOTE_ID);
    expect(result.diffText.startsWith(`--- a/note:${NOTE_ID}\n+++ b/note:${NOTE_ID}`)).toBe(true);
    expect(result.patchedMarkdown).toContain('Added.');
    expect(await db.notes.get(NOTE_ID)).toEqual(before);
  });

  it.each(['note', 'skill'])('refuses a missing %s target id', async (target) => {
    const result = await readPatchTarget(db, { target, id: 'missing-target' });
    expect(result).toMatchObject({ refused: true, code: 'ARTIFACT_NOT_FOUND' });
  });

  it('reads and patches skill Markdown without writing', async () => {
    const skill = {
      id: 'skill-35-01', name: 'Skill', description: 'Patch target', body: MARKDOWN,
      createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z',
    };
    await db.aiSkills.add(skill);
    const target = { target: 'skill', id: skill.id };
    expect(await readPatchTarget(db, target)).toMatchObject({
      ...target, markdown: MARKDOWN, version: 0, approvalState: 'unapproved',
      baseHash: await defaultSha256(MARKDOWN.trim()),
      sectionIndex: [{ id: '1' }, { id: '1.1' }, { id: '1.2' }],
    });
    const result = await preparePatch(db, {
      ...target, sectionId: '1.1', expectedHeading: 'First',
      baseHash: await defaultSha256(MARKDOWN.trim()), operation: 'replace', newContent: 'New lesson.',
    });
    expect(result).toMatchObject({ ...target, patchedMarkdown: MARKDOWN.replace('Original text.', 'New lesson.') });
    expect(await db.aiSkills.get(skill.id)).toEqual(skill);
  });

  it('rejects missing and unsupported target arguments without throwing', async () => {
    for (const args of [{}, { target: 'settings', id: NOTE_ID }, { target: 'note', id: '' }]) {
      expect(await readPatchTarget(db, args)).toMatchObject({ refused: true, code: 'INVALID_ARGUMENTS' });
      expect(await preparePatch(db, args)).toMatchObject({ refused: true, code: 'INVALID_ARGUMENTS' });
    }
  });

  it('keeps an existing empty note distinct from a missing note', async () => {
    await db.notes.update(NOTE_ID, { body: '' });
    expect(await readPatchTarget(db, { target: 'note', id: NOTE_ID })).toMatchObject({
      markdown: '', sectionIndex: [], baseHash: await defaultSha256(''),
    });
  });

  it('refuses renamed, unknown and empty sections', async () => {
    const args = {
      target: 'note', id: NOTE_ID, sectionId: '1.1', expectedHeading: 'First',
      baseHash: await defaultSha256(MARKDOWN.trim()), operation: 'append', newContent: 'Added.',
    };
    expect(await preparePatch(db, { ...args, expectedHeading: 'Renamed' })).toMatchObject({ code: 'SECTION_DRIFT' });
    expect(await preparePatch(db, { ...args, sectionId: '9.9' })).toMatchObject({ code: 'SECTION_NOT_FOUND' });
    const empty = MARKDOWN.replace('Original text.', '');
    await db.notes.update(NOTE_ID, { body: empty });
    expect(await preparePatch(db, { ...args, baseHash: await defaultSha256(empty.trim()) })).toMatchObject({ code: 'SECTION_EMPTY' });
  });

  it('builds one hunk per changed field, in name → description → body order (D-11)', () => {
    const result = prepareSkillVersionDiff({
      skillId: 'skill-39-04',
      base: { name: 'Tên cũ', description: 'Mô tả cũ', body: '# Cũ\n\nDòng cũ.' },
      next: { name: 'Tên mới', description: 'Mô tả mới', body: '# Mới\n\nDòng mới.' },
      baseVersion: 0,
    });
    expect(isRefusal(result)).toBe(false);
    if (isRefusal(result)) return;

    const nameAt = result.diffText.indexOf('a/skill:skill-39-04/name');
    const descriptionAt = result.diffText.indexOf('a/skill:skill-39-04/description');
    const bodyAt = result.diffText.indexOf('a/skill:skill-39-04/body');
    expect(nameAt).toBeGreaterThanOrEqual(0);
    expect(descriptionAt).toBeGreaterThan(nameAt);
    expect(bodyAt).toBeGreaterThan(descriptionAt);

    // The sums are the per-field diffs added together, not a whole-document diff.
    // name 1/1 + description 1/1 + body 2/2.
    expect(result.addedLines).toBe(4);
    expect(result.removedLines).toBe(4);
    expect(result.target).toBe('skill');
    expect(result.sectionTitle).toBe('Tên cũ');
    expect(result.patchedMarkdown).toBe('# Mới\n\nDòng mới.');
  });

  it('omits the hunk for an unchanged field (D-11)', () => {
    const base = { name: 'Tên', description: 'Mô tả', body: '# Cũ' };
    const result = prepareSkillVersionDiff({
      skillId: 'skill-39-04',
      base,
      next: { ...base, body: '# Mới' },
      baseVersion: 0,
    });
    expect(isRefusal(result)).toBe(false);
    if (isRefusal(result)) return;

    expect(result.diffText).toContain('/body');
    expect(result.diffText).not.toContain('/name');
    expect(result.diffText).not.toContain('/description');
  });

  it('refuses NO_CHANGES when nothing differs', () => {
    const same = { name: 'Tên', description: 'Mô tả', body: '# Thân' };
    expect(
      prepareSkillVersionDiff({ skillId: 'skill-39-04', base: same, next: { ...same }, baseVersion: 2 })
    ).toMatchObject({ refused: true, code: 'NO_CHANGES' });
  });

  it('labels the base side with the version, or "bản hiện tại" at baseline', () => {
    const base = { name: 'Tên', description: 'Mô tả', body: '# Cũ' };
    const next = { ...base, body: '# Mới' };

    const versioned = prepareSkillVersionDiff({ skillId: 's', base, next, baseVersion: 3 });
    expect(isRefusal(versioned)).toBe(false);
    if (isRefusal(versioned)) return;
    expect(versioned.diffText).toContain('(bản 3)');
    expect(versioned.diffText).toContain('(đề xuất)');

    const baseline = prepareSkillVersionDiff({ skillId: 's', base, next, baseVersion: 0 });
    expect(isRefusal(baseline)).toBe(false);
    if (isRefusal(baseline)) return;
    expect(baseline.diffText).toContain('(bản hiện tại)');
  });

  it('refuses PATCH_TOO_LARGE above the shared line cap', () => {
    const base = { name: 'Tên', description: 'Mô tả', body: '# Cũ' };
    const result = prepareSkillVersionDiff({
      skillId: 's',
      base,
      next: { ...base, body: Array.from({ length: 200 }, (_, i) => `dòng ${i}`).join('\n') },
      baseVersion: 0,
    });
    expect(result).toMatchObject({ refused: true, code: 'PATCH_TOO_LARGE', cap: PATCH_LINE_CAP });
  });

  it('caps combined additions and removals even when supplied content fits', async () => {
    const body = '# First\n' + Array.from({ length: 70 }, (_, i) => `old ${i}`).join('\n');
    await db.notes.update(NOTE_ID, { body });
    expect(await preparePatch(db, {
      target: 'note', id: NOTE_ID, sectionId: '1', expectedHeading: 'First',
      baseHash: await defaultSha256(body.trim()), operation: 'replace',
      newContent: Array.from({ length: 70 }, (_, i) => `new ${i}`).join('\n'),
    })).toMatchObject({ refused: true, code: 'PATCH_TOO_LARGE', cap: 120, addedLines: 70, removedLines: 70 });
  });
});
