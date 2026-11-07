// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as models from '../../src/types/models';
import {
  normalizeTags,
  tagListSchema,
  workTypeSchema,
  WORK_TYPES,
  SystemInputSchema,
  SystemUpdateSchema,
  ChangeRequestInputSchema,
  ChangeRequestUpdateSchema,
  TaskInputSchema,
  TaskUpdateSchema,
} from '../../src/validation/schemas';

// Type-level contract for the CR-centric model (D-24/D-25/D-26). `tsc --noEmit` is the
// assertion; these aliases exist only so the compiler checks them.
// @ts-expect-error — ChangeRequest.targetSystemIds was replaced by `targets: CrTarget[]`
export type _RemovedTargetSystemIds = models.ChangeRequest['targetSystemIds'];

// Positive half of the same contract: the CR axis is what the domain model exposes.
export type _TaskRequiresCrId = models.Task['crId'];
export type _TaskOptionalSystemId = models.Task['systemId'];
export type _CrTargets = models.ChangeRequest['targets'];
export type _SystemParentId = models.System['parentId'];

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

  describe('SystemInputSchema shape invariants (D-24, T-31.2-01)', () => {
    it('rejects a LOGICAL_GROUP carrying a parentId', () => {
      const result = SystemInputSchema.safeParse({
        type: 'LOGICAL_GROUP',
        parentId: '11111111-1111-4111-8111-111111111111',
        name: 'A',
        code: 'A',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.message)).toContain(
          'Hệ thống cha không được có hệ thống cha'
        );
      }
    });

    it('rejects a LOGICAL_GROUP carrying SSH/repo fields', () => {
      const result = SystemInputSchema.safeParse({
        type: 'LOGICAL_GROUP',
        sshConfigId: '11111111-1111-4111-8111-111111111111',
        name: 'A',
        code: 'A',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.message)).toContain(
          'Hệ thống cha không được có SSH/Repo'
        );
      }

      expect(
        SystemInputSchema.safeParse({
          type: 'LOGICAL_GROUP',
          remoteRepoPath: '/repos/a',
          name: 'A',
          code: 'A',
        }).success
      ).toBe(false);
      expect(
        SystemInputSchema.safeParse({
          type: 'LOGICAL_GROUP',
          defaultBaseBranch: 'main',
          name: 'A',
          code: 'A',
        }).success
      ).toBe(false);
    });

    it('defaults parentId to null for a plain SERVICE', () => {
      const parsed = SystemInputSchema.parse({ type: 'SERVICE', name: 'A', code: 'A' });
      expect(parsed.parentId).toBeNull();
    });

    it('rejects a relative remoteRepoPath (T-31.2-02)', () => {
      const result = SystemInputSchema.safeParse({
        type: 'SERVICE',
        remoteRepoPath: 'relative/path',
        name: 'A',
        code: 'A',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Đường dẫn repo phải là đường dẫn tuyệt đối');
      }
      expect(
        SystemInputSchema.safeParse({
          type: 'SERVICE',
          remoteRepoPath: '/absolute/path',
          name: 'A',
          code: 'A',
        }).success
      ).toBe(true);
    });

    it('applies the same invariants on SystemUpdateSchema', () => {
      expect(SystemUpdateSchema.safeParse({ type: 'LOGICAL_GROUP', parentId: 'x' }).success).toBe(false);
      expect(SystemUpdateSchema.safeParse({ type: 'SERVICE', remoteRepoPath: '/repos/a' }).success).toBe(
        true
      );
    });
  });

  describe('ChangeRequestInputSchema targets & required code (D-25)', () => {
    it('rejects duplicate systemIds in targets (T-31.2-03)', () => {
      const result = ChangeRequestInputSchema.safeParse({
        code: 'CR-1',
        name: 'n',
        type: 'BUGFIX',
        status: 'Open',
        targets: [
          { systemId: '11111111-1111-4111-8111-111111111111' },
          { systemId: '11111111-1111-4111-8111-111111111111' },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.message)).toContain('Subsystem bị trùng trong CR');
      }
    });

    it('requires a non-empty code', () => {
      expect(
        ChangeRequestInputSchema.safeParse({ name: 'n', type: 'BUGFIX', status: 'Open', targets: [] })
          .success
      ).toBe(false);
      expect(
        ChangeRequestInputSchema.safeParse({
          code: '   ',
          name: 'n',
          type: 'BUGFIX',
          status: 'Open',
          targets: [],
        }).success
      ).toBe(false);
    });

    it('uppercases the code and defaults targets to an empty array', () => {
      const parsed = ChangeRequestInputSchema.parse({ code: 'cr-7', name: 'n' });
      expect(parsed.code).toBe('CR-7');
      expect(parsed.targets).toEqual([]);
    });

    it('rejects duplicate targets on update', () => {
      expect(
        ChangeRequestUpdateSchema.safeParse({
          targets: [
            { systemId: '11111111-1111-4111-8111-111111111111' },
            { systemId: '11111111-1111-4111-8111-111111111111' },
          ],
        }).success
      ).toBe(false);
    });
  });

  describe('TaskInputSchema & TaskUpdateSchema', () => {
    const CR_ID = '11111111-1111-4111-8111-111111111111';

    it('requires crId and accepts an absent systemId', () => {
      const parsed = TaskInputSchema.parse({ name: 't', crId: CR_ID });
      expect(parsed.crId).toBe(CR_ID);
      expect(parsed.systemId).toBeUndefined();
      expect(TaskInputSchema.safeParse({ name: 't' }).success).toBe(false);
    });

    it('accepts an optional systemId', () => {
      const parsed = TaskInputSchema.parse({
        name: 't',
        crId: CR_ID,
        systemId: '22222222-2222-4222-8222-222222222222',
      });
      expect(parsed.systemId).toBe('22222222-2222-4222-8222-222222222222');
    });

    it('defaults workType to "code" if not provided', () => {
      const task = TaskInputSchema.parse({
        name: 'Implement Settlement Service',
        crId: CR_ID,
      });
      expect(task.workType).toBe('code');
    });

    it('accepts explicit valid workType', () => {
      const task = TaskInputSchema.parse({
        name: 'Write SRS Document',
        crId: CR_ID,
        workType: 'document',
      });
      expect(task.workType).toBe('document');
    });

    it('accepts Pending status for task input/update schemas', () => {
      expect(TaskInputSchema.parse({ name: 'Queued task', crId: CR_ID, status: 'Pending' }).status).toBe(
        'Pending'
      );
      expect(TaskUpdateSchema.parse({ status: 'Pending' }).status).toBe('Pending');
    });

    it('accepts optional opsOwners and businessAnalysts on TaskInput and TaskUpdate', () => {
      const task = TaskInputSchema.parse({
        name: 'Fix ISO8583 message parsing',
        crId: CR_ID,
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

    it('validates jiraKey format matching JIRA_KEY_REGEX', () => {
      const validTask = TaskInputSchema.parse({
        name: 'Connect to Core API',
        crId: CR_ID,
        jiraKey: 'SHB-1234',
      });
      expect(validTask.jiraKey).toBe('SHB-1234');

      expect(() =>
        TaskInputSchema.parse({
          name: 'Invalid Jira Key',
          crId: CR_ID,
          jiraKey: 'invalid_key',
        })
      ).toThrow();

      expect(() =>
        TaskInputSchema.parse({
          name: 'Invalid Jira Key format',
          crId: CR_ID,
          jiraKey: '123-ABC',
        })
      ).toThrow();
    });
  });
});
