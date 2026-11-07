import { describe, it, expect } from 'vitest';
import {
  reminderDateSchema,
  reminderNoteSchema,
  ChangeRequestInputSchema,
  ChangeRequestUpdateSchema,
  TaskInputSchema,
  TaskUpdateSchema,
} from '../../src/validation/schemas';
import { BackupChangeRequestRecordSchema, BackupTaskRecordSchema } from '../../src/validation/backupSchemas';

const CR_ID = '11111111-1111-4111-8111-111111111111';

describe('Notification and Reminder Schemas (D-06, D-07, NOTIF-01)', () => {
  describe('reminderDateSchema & reminderNoteSchema', () => {
    it('validates calendar date format YYYY-MM-DD', () => {
      expect(reminderDateSchema.safeParse('2026-09-30').success).toBe(true);
      expect(reminderDateSchema.safeParse('2026-02-31').success).toBe(false);
      expect(reminderDateSchema.safeParse('invalid-date').success).toBe(false);
    });

    it('validates reminder notes up to 500 characters', () => {
      expect(reminderNoteSchema.safeParse('Need follow-up with customer').success).toBe(true);
      expect(reminderNoteSchema.safeParse(undefined).success).toBe(true);
      expect(reminderNoteSchema.safeParse('a'.repeat(500)).success).toBe(true);
      expect(reminderNoteSchema.safeParse('a'.repeat(501)).success).toBe(false);
    });
  });

  describe('Domain Input and Update Schemas', () => {
    it('accepts reminderDate and reminderNote in ChangeRequestInputSchema', () => {
      const valid = ChangeRequestInputSchema.safeParse({
        name: 'CR with reminder',
        code: 'CR-REM',
        reminderDate: '2026-10-01',
        reminderNote: 'Review budget',
      });
      expect(valid.success).toBe(true);
    });

    it('accepts reminderDate and reminderNote in TaskInputSchema', () => {
      const valid = TaskInputSchema.safeParse({
        name: 'Review PR',
        crId: CR_ID,
        reminderDate: '2026-10-02',
        reminderNote: 'Contact requester if blocked',
      });
      expect(valid.success).toBe(true);
    });

    it('accepts reminder updates in partial update schemas', () => {
      expect(ChangeRequestUpdateSchema.safeParse({ reminderDate: '2026-10-01' }).success).toBe(true);
      expect(
        TaskUpdateSchema.safeParse({ reminderDate: '2026-10-03', reminderNote: 'Call client' })
          .success
      ).toBe(true);
    });
  });

  describe('Backup Schemas Compatibility', () => {
    it('permits CR and task records without reminder fields', () => {
      const cr = {
        id: CR_ID,
        name: 'Legacy CR',
        code: 'CR-LEGACY',
        status: 'Open',
        type: 'ENHANCEMENT',
        targets: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      };
      expect(BackupChangeRequestRecordSchema.safeParse(cr).success).toBe(true);

      const task = {
        id: '33333333-3333-4333-8333-333333333333',
        crId: CR_ID,
        name: 'Legacy Task',
        status: 'Open',
        progress: 0,
        priority: 'Medium',
        estimateMinutes: 60,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      };
      expect(BackupTaskRecordSchema.safeParse(task).success).toBe(true);
    });

    it('accepts records with valid reminderDate and reminderNote', () => {
      const taskWithReminder = {
        id: '33333333-3333-4333-8333-333333333333',
        crId: CR_ID,
        name: 'Task with reminder',
        status: 'Open',
        progress: 0,
        priority: 'High',
        estimateMinutes: 45,
        reminderDate: '2026-09-30',
        reminderNote: 'Reminder note',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      };
      expect(BackupTaskRecordSchema.safeParse(taskWithReminder).success).toBe(true);
    });
  });
});
