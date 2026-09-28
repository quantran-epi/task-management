// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  normalizeTags,
  tagListSchema,
  workTypeSchema,
  WORK_TYPES,
  ProjectInputSchema,
  MilestoneInputSchema,
  TaskInputSchema,
  TaskUpdateSchema,
} from '../../src/validation/schemas';
import {
  BackupProjectRecordSchema,
  BackupMilestoneRecordSchema,
  BackupTaskRecordSchema,
} from '../../src/validation/backupSchemas';

describe('Banking IT Domain Fields Validation & Normalization (D-01, D-02, D-03, D-04)', () => {
  describe('normalizeTags', () => {
    it('trims whitespace and filters out empty strings', () => {
      const input = ['  Alex  ', '', '   ', 'Brian '];
      expect(normalizeTags(input)).toEqual(['Alex', 'Brian']);
    });

    it('deduplicates tags case-insensitively while preserving first-seen casing', () => {
      const input = ['Alex', 'alex', 'ALEX', 'Brian', 'brian'];
      expect(normalizeTags(input)).toEqual(['Alex', 'Brian']);
    });
  });

  describe('tagListSchema', () => {
    it('enforces maximum 50 characters per tag', () => {
      const valid = ['A'.repeat(50)];
      expect(tagListSchema.safeParse(valid).success).toBe(true);

      const invalid = ['A'.repeat(51)];
      const result = tagListSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/50 ký tự/);
      }
    });

    it('enforces maximum 10 tags per field', () => {
      const valid = Array.from({ length: 10 }, (_, i) => `Tag${i}`);
      expect(tagListSchema.safeParse(valid).success).toBe(true);

      const invalid = Array.from({ length: 11 }, (_, i) => `Tag${i}`);
      const result = tagListSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/Tối đa 10 thẻ/);
      }
    });

    it('applies normalizeTags transformation on parse', () => {
      const parsed = tagListSchema.parse(['  Carol ', 'carol', 'Dave']);
      expect(parsed).toEqual(['Carol', 'Dave']);
    });
  });

  describe('workTypeSchema & WORK_TYPES', () => {
    it('contains all 7 valid banking IT work types', () => {
      expect(WORK_TYPES).toEqual([
        'code',
        'document',
        'meeting',
        'support_testing',
        'investigate',
        'configuration',
        'review_code',
      ]);
      WORK_TYPES.forEach((type) => {
        expect(workTypeSchema.safeParse(type).success).toBe(true);
      });
      expect(workTypeSchema.safeParse('invalid_type').success).toBe(false);
    });
  });

  describe('ProjectInputSchema & MilestoneInputSchema', () => {
    it('accepts optional opsOwners and businessAnalysts', () => {
      const project = ProjectInputSchema.parse({
        name: 'Core Banking Upgrade',
        opsOwners: ['Ops1', 'Ops2'],
        businessAnalysts: ['BA1'],
      });
      expect(project.opsOwners).toEqual(['Ops1', 'Ops2']);
      expect(project.businessAnalysts).toEqual(['BA1']);

      const milestone = MilestoneInputSchema.parse({
        projectId: '11111111-1111-4111-8111-111111111111',
        name: 'UAT Signoff',
        opsOwners: ['OpsTeam'],
      });
      expect(milestone.opsOwners).toEqual(['OpsTeam']);
      expect(milestone.businessAnalysts).toBeUndefined();
    });
  });

  describe('TaskInputSchema & TaskUpdateSchema', () => {
    it('defaults workType to "code" if not provided', () => {
      const task = TaskInputSchema.parse({
        name: 'Implement Settlement Service',
      });
      expect(task.workType).toBe('code');
    });

    it('accepts explicit valid workType', () => {
      const task = TaskInputSchema.parse({
        name: 'Write SRS Document',
        workType: 'document',
      });
      expect(task.workType).toBe('document');
    });

    it('accepts optional opsOwners and businessAnalysts on TaskInput and TaskUpdate', () => {
      const task = TaskInputSchema.parse({
        name: 'Fix ISO8583 message parsing',
        opsOwners: ['OpsSpecialist'],
        businessAnalysts: ['SeniorBA'],
      });
      expect(task.opsOwners).toEqual(['OpsSpecialist']);
      expect(task.businessAnalysts).toEqual(['SeniorBA']);

      const update = TaskUpdateSchema.parse({
        workType: 'review_code',
        opsOwners: ['LeadOps'],
      });
      expect(update.workType).toBe('review_code');
      expect(update.opsOwners).toEqual(['LeadOps']);
    });
  });

  describe('Backup schemas with domain fields', () => {
    it('validates backup records containing domain fields', () => {
      const project = BackupProjectRecordSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Project 1',
        status: 'Open',
        opsOwners: ['Alice'],
        businessAnalysts: ['Bob'],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      });
      expect(project.opsOwners).toEqual(['Alice']);

      const milestone = BackupMilestoneRecordSchema.parse({
        id: '22222222-2222-4222-8222-222222222222',
        projectId: '11111111-1111-4111-8111-111111111111',
        name: 'Milestone 1',
        status: 'Open',
        opsOwners: ['Alice'],
        businessAnalysts: ['Bob'],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      });
      expect(milestone.businessAnalysts).toEqual(['Bob']);

      const task = BackupTaskRecordSchema.parse({
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Task 1',
        status: 'Open',
        progress: 0,
        priority: 'Medium',
        estimateMinutes: 60,
        workType: 'investigate',
        opsOwners: ['Alice'],
        businessAnalysts: ['Bob'],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      });
      expect(task.workType).toBe('investigate');
      expect(task.opsOwners).toEqual(['Alice']);
    });
  });
});
