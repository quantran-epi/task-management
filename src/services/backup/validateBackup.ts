import { z } from 'zod';
import type {
  BackupEnvelope,
  BackupValidationResult,
  ValidationErrorDetail,
} from '../../types/backup';
import { APP_MARKER, CURRENT_SCHEMA_VERSION } from './exportBackup';
import {
  BackupProjectRecordSchema,
  BackupMilestoneRecordSchema,
  BackupTaskRecordSchema,
  BackupCapacityRuleRecordSchema,
  BackupCapacityOverrideRecordSchema,
  BackupPlannedAllocationRecordSchema,
} from '../../validation/backupSchemas';

/**
 * Two-stage validation engine for backup payloads:
 * Stage 1: Envelope validation (app marker, schemaVersion, structure)
 * Stage 2: Schema validation of records across all 6 domain tables
 * Stage 3: Referential integrity checks (foreign keys: project, milestone, task)
 */
export function validateBackupPayload(raw: unknown): BackupValidationResult {
  const errors: ValidationErrorDetail[] = [];

  // Stage 1: Basic object and envelope check
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      errors: [
        {
          table: 'envelope',
          field: 'payload',
          message: 'Dữ liệu sao lưu phải là một đối tượng JSON hợp lệ',
        },
      ],
    };
  }

  const candidate = raw as Record<string, unknown>;

  if (candidate.app !== APP_MARKER) {
    errors.push({
      table: 'envelope',
      field: 'app',
      message: `Định danh ứng dụng không hợp lệ (yêu cầu '${APP_MARKER}')`,
    });
  }

  if (
    typeof candidate.schemaVersion !== 'number' ||
    candidate.schemaVersion > CURRENT_SCHEMA_VERSION ||
    candidate.schemaVersion < 1
  ) {
    errors.push({
      table: 'envelope',
      field: 'schemaVersion',
      message: `Phiên bản sơ đồ (${String(candidate.schemaVersion)}) không tương thích (hỗ trợ tối đa ${CURRENT_SCHEMA_VERSION})`,
    });
  }

  if (typeof candidate.exportedAt !== 'string' || Number.isNaN(Date.parse(candidate.exportedAt))) {
    errors.push({
      table: 'envelope',
      field: 'exportedAt',
      message: 'Thời gian xuất bản không phải chuỗi thời gian ISO hợp lệ',
    });
  }

  if (!candidate.tables || typeof candidate.tables !== 'object' || Array.isArray(candidate.tables)) {
    errors.push({
      table: 'envelope',
      field: 'tables',
      message: 'Phần dữ liệu các bảng (tables) bị thiếu hoặc không đúng định dạng',
    });
    return { valid: false, errors };
  }

  // If Stage 1 envelope errors exist, abort before table inspection
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const rawTables = candidate.tables as Record<string, unknown>;

  // Stage 2: Validate records in 6 domain tables
  function validateTable<T>(
    tableName: string,
    schema: z.ZodSchema<T>,
    recordsUnknown: unknown
  ): T[] {
    if (!Array.isArray(recordsUnknown)) {
      errors.push({
        table: tableName,
        field: 'table',
        message: `Dữ liệu bảng ${tableName} phải là một mảng`,
      });
      return [];
    }

    const validRecords: T[] = [];
    recordsUnknown.forEach((rec, idx) => {
      const parsed = schema.safeParse(rec);
      if (!parsed.success) {
        parsed.error.issues.forEach((issue) => {
          const recId = rec && typeof rec === 'object' && 'id' in rec ? String((rec as any).id) : `index_${idx}`;
          errors.push({
            table: tableName,
            recordId: recId,
            field: issue.path.join('.') || 'record',
            message: issue.message,
          });
        });
      } else {
        validRecords.push(parsed.data);
      }
    });

    return validRecords;
  }

  const projects = validateTable('projects', BackupProjectRecordSchema, rawTables.projects ?? []);
  const milestones = validateTable('milestones', BackupMilestoneRecordSchema, rawTables.milestones ?? []);
  const tasks = validateTable('tasks', BackupTaskRecordSchema, rawTables.tasks ?? []);
  const capacityRules = validateTable('capacityRules', BackupCapacityRuleRecordSchema, rawTables.capacityRules ?? []);
  const capacityOverrides = validateTable('capacityOverrides', BackupCapacityOverrideRecordSchema, rawTables.capacityOverrides ?? []);
  const plannedAllocations = validateTable('plannedAllocations', BackupPlannedAllocationRecordSchema, rawTables.plannedAllocations ?? []);

  // If schema validation errors occurred, stop before referential checks
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Stage 3: Referential integrity checks
  const projectIds = new Set(projects.map((p) => p.id));
  const milestoneIds = new Set(milestones.map((m) => m.id));
  const taskIds = new Set(tasks.map((t) => t.id));

  // Check milestones refer to existing project
  milestones.forEach((m) => {
    if (!projectIds.has(m.projectId)) {
      errors.push({
        table: 'milestones',
        recordId: m.id,
        field: 'projectId',
        message: `Milestone references projectId "${m.projectId}" not found in projects`,
      });
    }
  });

  // Check tasks refer to existing project or milestone (if provided)
  tasks.forEach((t) => {
    if (t.projectId && !projectIds.has(t.projectId)) {
      errors.push({
        table: 'tasks',
        recordId: t.id,
        field: 'projectId',
        message: `Task references projectId "${t.projectId}" not found in projects`,
      });
    }
    if (t.milestoneId && !milestoneIds.has(t.milestoneId)) {
      errors.push({
        table: 'tasks',
        recordId: t.id,
        field: 'milestoneId',
        message: `Task references milestoneId "${t.milestoneId}" not found in milestones`,
      });
    }
  });

  // Check plannedAllocations refer to existing task
  plannedAllocations.forEach((pa) => {
    if (!taskIds.has(pa.taskId)) {
      errors.push({
        table: 'plannedAllocations',
        recordId: pa.id,
        field: 'taskId',
        message: `PlannedAllocation references taskId "${pa.taskId}" not found in tasks`,
      });
    }
  });

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const validEnvelope: BackupEnvelope = {
    app: APP_MARKER,
    schemaVersion: candidate.schemaVersion as number,
    exportedAt: candidate.exportedAt as string,
    tables: {
      projects: projects as BackupEnvelope['tables']['projects'],
      milestones: milestones as BackupEnvelope['tables']['milestones'],
      tasks: tasks as BackupEnvelope['tables']['tasks'],
      capacityRules: capacityRules as BackupEnvelope['tables']['capacityRules'],
      capacityOverrides: capacityOverrides as BackupEnvelope['tables']['capacityOverrides'],
      plannedAllocations: plannedAllocations as BackupEnvelope['tables']['plannedAllocations'],
    },
    counts: {
      projects: projects.length,
      milestones: milestones.length,
      tasks: tasks.length,
      capacityRules: capacityRules.length,
      capacityOverrides: capacityOverrides.length,
      plannedAllocations: plannedAllocations.length,
    },
  };

  return {
    valid: true,
    envelope: validEnvelope,
    errors: [],
  };
}
