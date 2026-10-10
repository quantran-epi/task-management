import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../src/db';
import {
  createNote,
  addNoteAttachment,
  deleteNoteAttachment,
  getNoteWithAttachments,
} from '../src/db/repositories/noteRepo';
import { exportBackupPayload } from '../src/services/backup/exportBackup';
import { restoreBackupPayload } from '../src/services/backup/restoreBackup';
import { validateBackupPayload } from '../src/services/backup/validateBackup';

describe('Note Attachments & Backup Serialization', () => {
  beforeEach(async () => {
    await db.notes.clear();
    await db.noteAttachments.clear();
    await db.tasks.clear();
    await db.milestones.clear();
    await db.projects.clear();
    await db.capacityRules.clear();
    await db.capacityOverrides.clear();
    await db.plannedAllocations.clear();
    await db.workSessions.clear();
  });

  describe('Attachment constraints (MIME, 5MB, max 5 per note)', () => {
    it('saves valid image attachment correctly', async () => {
      const note = await createNote({ body: 'Note with attachment' });
      const fakeBlob = new Blob(['sample-png-data'], { type: 'image/png' });

      const attachment = await addNoteAttachment({
        noteId: note.id,
        fileName: 'screenshot.png',
        mimeType: 'image/png',
        sizeBytes: fakeBlob.size,
        data: fakeBlob,
        caption: 'Màn hình lỗi',
      });

      expect(attachment.id).toBeDefined();
      expect(attachment.noteId).toBe(note.id);
      expect(attachment.fileName).toBe('screenshot.png');
      expect(attachment.caption).toBe('Màn hình lỗi');

      const fetched = await getNoteWithAttachments(note.id);
      expect(fetched?.attachments).toHaveLength(1);
      expect(fetched?.attachments[0]?.fileName).toBe('screenshot.png');

      await deleteNoteAttachment(attachment.id);
      const afterDelete = await getNoteWithAttachments(note.id);
      expect(afterDelete?.attachments).toHaveLength(0);
    });

    it('rejects non-image MIME types', async () => {
      const note = await createNote({ body: 'Note test' });
      const fakePdf = new Blob(['pdf-data'], { type: 'application/pdf' });

      await expect(
        addNoteAttachment({
          noteId: note.id,
          fileName: 'doc.pdf',
          mimeType: 'application/pdf' as any,
          sizeBytes: fakePdf.size,
          data: fakePdf,
        })
      ).rejects.toThrow();
    });

    it('rejects files larger than 5MB', async () => {
      const note = await createNote({ body: 'Note test' });
      const over5Mb = 5 * 1024 * 1024 + 1;
      const largeBlob = new Blob([new Uint8Array(10)], { type: 'image/png' });

      await expect(
        addNoteAttachment({
          noteId: note.id,
          fileName: 'huge.png',
          mimeType: 'image/png',
          sizeBytes: over5Mb,
          data: largeBlob,
        })
      ).rejects.toThrow();
    });

    it('enforces maximum 5 attachments per note', async () => {
      const note = await createNote({ body: 'Note test' });

      for (let i = 1; i <= 5; i++) {
        const blob = new Blob([`image-${i}`], { type: 'image/jpeg' });
        await addNoteAttachment({
          noteId: note.id,
          fileName: `img-${i}.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: blob.size,
          data: blob,
        });
      }

      const extraBlob = new Blob(['image-6'], { type: 'image/jpeg' });
      await expect(
        addNoteAttachment({
          noteId: note.id,
          fileName: 'img-6.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: extraBlob.size,
          data: extraBlob,
        })
      ).rejects.toThrow(/tối đa 5/i);
    });
  });

  describe('Backup export and restore round-trip (D-19)', () => {
    it('exports attachments without binary data in backup payload version 4 and restores metadata faithfully', async () => {
      const note = await createNote({
        title: 'Note for backup',
        body: 'Markdown content',
        isPinned: true,
      });

      const blobData = 'hello-png-image-bytes';
      const fakeBlob = new Blob([blobData], { type: 'image/png' });

      const att = await addNoteAttachment({
        noteId: note.id,
        fileName: 'backup-image.png',
        mimeType: 'image/png',
        sizeBytes: fakeBlob.size,
        data: fakeBlob,
        caption: 'Ảnh đính kèm sao lưu',
      });

      // Export
      const backup = await exportBackupPayload();
      expect(backup.schemaVersion).toBe(10);
      expect(backup.tables.notes).toHaveLength(1);
      expect((backup.tables as any).noteAttachments).toHaveLength(1);

      const exportedAttachment = (backup.tables as any).noteAttachments[0];
      expect(exportedAttachment.data).toBeUndefined();
      expect(exportedAttachment.filePath).toBe(`attachments/${att.id}_${att.fileName}`);

      // Validate
      const validation = validateBackupPayload(backup);
      expect(validation.valid).toBe(true);

      // Clear DB
      await db.notes.clear();
      await db.noteAttachments.clear();

      // Restore
      const restoreResult = await restoreBackupPayload(backup);
      expect(restoreResult.totalRestored).toBeGreaterThan(0);

      // Verify restored in DB
      const restoredNotes = await db.notes.toArray();
      expect(restoredNotes).toHaveLength(1);
      expect(restoredNotes[0]?.title).toBe('Note for backup');

      const restoredAttachments = await db.noteAttachments.toArray();
      expect(restoredAttachments).toHaveLength(1);
      expect(restoredAttachments[0]?.fileName).toBe('backup-image.png');
      expect(restoredAttachments[0]?.caption).toBe('Ảnh đính kèm sao lưu');
      expect(restoredAttachments[0]?.filePath).toBe(`attachments/${att.id}_${att.fileName}`);
      expect(restoredAttachments[0]?.data).toBeDefined();
      expect(typeof restoredAttachments[0]?.data.text).toBe('function');

      const restoredText = await restoredAttachments[0]!.data.text();
      expect(restoredText).toBe('');
    });

    it('restores legacy backup with base64 attachment data faithfully', async () => {
      const note = await createNote({
        title: 'Legacy note',
        body: 'Legacy note body',
      });

      const base64Data = 'data:image/png;base64,' + Buffer.from('legacy-image-content').toString('base64');
      const backup = await exportBackupPayload();

      // Simulate legacy backup payload containing base64 data
      (backup.tables as any).noteAttachments = [
        {
          id: 'legacy-att-1',
          noteId: note.id,
          fileName: 'legacy.png',
          mimeType: 'image/png',
          sizeBytes: 20,
          data: base64Data,
          createdAt: new Date().toISOString(),
        },
      ];

      await db.notes.clear();
      await db.noteAttachments.clear();

      await restoreBackupPayload(backup);

      const restored = await db.noteAttachments.toArray();
      expect(restored).toHaveLength(1);
      expect(restored[0]?.fileName).toBe('legacy.png');
      expect(restored[0]?.data).toBeDefined();
      expect(typeof restored[0]?.data.text).toBe('function');

      const restoredText = await restored[0]!.data.text();
      expect(restoredText).toBe('legacy-image-content');
    });

    it('exports backup without image binary data when excludeAttachmentData is true', async () => {
      const note = await createNote({
        title: 'Note with local path',
        body: 'Testing path backup',
        entityType: 'project',
      });

      await addNoteAttachment({
        noteId: note.id,
        fileName: 'screenshot-local.png',
        mimeType: 'image/png',
        sizeBytes: 2048,
        data: new Blob(['dummy-binary'], { type: 'image/png' }),
        filePath: '/Users/me/Documents/screenshot-local.png',
      });

      const backup = await exportBackupPayload(db, { excludeAttachmentData: true });
      expect((backup.tables as any).noteAttachments).toHaveLength(1);

      const exportedAtt = (backup.tables as any).noteAttachments[0];
      expect(exportedAtt.filePath).toBe('/Users/me/Documents/screenshot-local.png');
      expect(exportedAtt.data).toBeUndefined();

      // Validation passes without data
      const validation = validateBackupPayload(backup);
      expect(validation.valid).toBe(true);

      // Restore handles attachment without data
      await db.notes.clear();
      await db.noteAttachments.clear();

      await restoreBackupPayload(backup);
      const restored = await db.noteAttachments.toArray();
      expect(restored).toHaveLength(1);
      expect(restored[0]?.filePath).toBe('/Users/me/Documents/screenshot-local.png');
      expect(restored[0]?.fileName).toBe('screenshot-local.png');
    });
  });
});
