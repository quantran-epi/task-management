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
  BackupWorkSessionRecordSchema,
  BackupNoteRecordSchema,
  BackupNoteAttachmentRecordSchema,
} from '../../validation/backupSchemas';


/**
 * Two-stage validation engine for backup payloads:
 * Stage 1: Envelope validation (app marker, schemaVersion, structure)
 * Stage 2: Schema validation of records across domain tables (projects, milestones, tasks, capacityRules, capacityOverrides, plannedAllocations, and optionally workSessions)
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
      message: `Phiên bản sơ đồ (${String(candidate.schemaVersion)}) không tương thích (chỉ hỗ trợ phiên bản 1 đến ${CURRENT_SCHEMA_VERSION})`,
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
  const workSessions = rawTables.workSessions !== undefined
    ? validateTable('workSessions', BackupWorkSessionRecordSchema, rawTables.workSessions)
    : undefined;
  const notes = rawTables.notes !== undefined
    ? validateTable('notes', BackupNoteRecordSchema, rawTables.notes)
    : undefined;
  const noteAttachments = rawTables.noteAttachments !== undefined
    ? validateTable('noteAttachments', BackupNoteAttachmentRecordSchema, rawTables.noteAttachments)
    : undefined;

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

  // Check workSessions refer to existing task
  if (workSessions) {
    workSessions.forEach((ws) => {
      if (!taskIds.has(ws.taskId)) {
        errors.push({
          table: 'workSessions',
          recordId: ws.id,
          field: 'taskId',
          message: `WorkSession references taskId "${ws.taskId}" not found in tasks`,
        });
      }
    });
  }

  // Check notes refer to existing entity if specified
  const noteIds = new Set((notes || []).map((n) => n.id));
  if (notes) {
    notes.forEach((n) => {
      if (n.entityType && n.entityId) {
        if (n.entityType === 'task' && !taskIds.has(n.entityId)) {
          errors.push({
            table: 'notes',
            recordId: n.id,
            field: 'entityId',
            message: `Note references taskId "${n.entityId}" not found in tasks`,
          });
        } else if (n.entityType === 'milestone' && !milestoneIds.has(n.entityId)) {
          errors.push({
            table: 'notes',
            recordId: n.id,
            field: 'entityId',
            message: `Note references milestoneId "${n.entityId}" not found in milestones`,
          });
        } else if (n.entityType === 'project' && !projectIds.has(n.entityId)) {
          errors.push({
            table: 'notes',
            recordId: n.id,
            field: 'entityId',
            message: `Note references projectId "${n.entityId}" not found in projects`,
          });
        }
      }
    });
  }

  // Check noteAttachments refer to existing note
  if (noteAttachments) {
    noteAttachments.forEach((na) => {
      if (!noteIds.has(na.noteId)) {
        errors.push({
          table: 'noteAttachments',
          recordId: na.id,
          field: 'noteId',
          message: `NoteAttachment references noteId "${na.noteId}" not found in notes`,
        });
      }
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Normalization for schemaVersion 1 (backfill Banking IT domain fields per D-16)
  if (candidate.schemaVersion === 1) {
    projects.forEach((p) => {
      if (!p.opsOwners) p.opsOwners = [];
      if (!p.businessAnalysts) p.businessAnalysts = [];
    });
    milestones.forEach((m) => {
      if (!m.opsOwners) m.opsOwners = [];
      if (!m.businessAnalysts) m.businessAnalysts = [];
    });
    tasks.forEach((t) => {
      if (!t.opsOwners) t.opsOwners = [];
      if (!t.businessAnalysts) t.businessAnalysts = [];
      if (!t.workType) t.workType = 'code';
    });
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
      ...(workSessions !== undefined ? { workSessions } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(noteAttachments !== undefined ? { noteAttachments } : {}),
    },
    counts: {
      projects: projects.length,
      milestones: milestones.length,
      tasks: tasks.length,
      capacityRules: capacityRules.length,
      capacityOverrides: capacityOverrides.length,
      plannedAllocations: plannedAllocations.length,
      ...(workSessions !== undefined ? { workSessions: workSessions.length } : {}),
      ...(notes !== undefined ? { notes: notes.length } : {}),
      ...(noteAttachments !== undefined ? { noteAttachments: noteAttachments.length } : {}),
    },
  };


  return {
    valid: true,
    envelope: validEnvelope,
    errors: [],
  };
}
