import Dexie, { type Table } from 'dexie';
import {
  SCHEMA_V1,
  SCHEMA_V2,
  SCHEMA_V3,
  SCHEMA_V4,
  SCHEMA_V5,
  SCHEMA_V6,
  SCHEMA_V7,
  SCHEMA_V8,
  SCHEMA_V9,
  SCHEMA_V10,
} from './schema';
import type {
  Project,
  Milestone,
  Task,
  CapacityRule,
  CapacityOverride,
  PlannedAllocation,
  Setting,
  BackupMetadata,
  WorkSession,
  ActiveTimer,
  Note,
  NoteAttachment,
  ChatThread,
  ChatMessage,
  DocumentSet,
  PublishedDocumentMetadata,
  PublishAttemptCache,
  DlpAuditRecord,
} from '../types/models';

export class TaskPlannerDatabase extends Dexie {
  projects!: Table<Project, string>;
  milestones!: Table<Milestone, string>;
  tasks!: Table<Task, string>;
  capacityRules!: Table<CapacityRule, string>;
  capacityOverrides!: Table<CapacityOverride, string>;
  plannedAllocations!: Table<PlannedAllocation, string>;
  settings!: Table<Setting, string>;
  backupMetadata!: Table<BackupMetadata, string>;
  workSessions!: Table<WorkSession, string>;
  activeTimers!: Table<ActiveTimer, string>;
  notes!: Table<Note, string>;
  noteAttachments!: Table<NoteAttachment, string>;
  chatThreads!: Table<ChatThread, string>;
  chatMessages!: Table<ChatMessage, string>;
  documentSets!: Table<DocumentSet, string>;
  publishedDocuments!: Table<PublishedDocumentMetadata, [string, string]>;
  publishAttempts!: Table<PublishAttemptCache, string>;
  dlpAudits!: Table<DlpAuditRecord, string>;


  constructor(databaseName = 'PersonalTaskPlannerDB') {
    super(databaseName);

    this.version(1).stores(SCHEMA_V1);

    this.version(2)
      .stores(SCHEMA_V2)
      .upgrade(async (tx) => {
        await tx
          .table('projects')
          .toCollection()
          .modify((proj: Record<string, unknown>) => {
            if (!proj.opsOwners) proj.opsOwners = [];
            if (!proj.businessAnalysts) proj.businessAnalysts = [];
          });

        await tx
          .table('milestones')
          .toCollection()
          .modify((ms: Record<string, unknown>) => {
            if (!ms.opsOwners) ms.opsOwners = [];
            if (!ms.businessAnalysts) ms.businessAnalysts = [];
          });

        await tx
          .table('tasks')
          .toCollection()
          .modify((task: Record<string, unknown>) => {
            if (!task.opsOwners) task.opsOwners = [];
            if (!task.businessAnalysts) task.businessAnalysts = [];
            if (!task.workType) task.workType = 'code';
          });
      });

    this.version(3).stores(SCHEMA_V3);

    this.version(4).stores(SCHEMA_V4);

    this.version(5).stores(SCHEMA_V5);

    this.version(6)
      .stores(SCHEMA_V6)
      .upgrade(async (tx) => {
        const generateUuid = () =>
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');

        const migrateReminders = (record: Record<string, unknown>) => {
          if (!Array.isArray(record.reminders)) {
            if (record.reminderDate && typeof record.reminderDate === 'string') {
              record.reminders = [
                {
                  id: generateUuid(),
                  date: record.reminderDate,
                  note: record.reminderNote ? String(record.reminderNote) : undefined,
                },
              ];
            } else {
              record.reminders = [];
            }
          }
        };

        await tx.table('projects').toCollection().modify(migrateReminders);
        await tx.table('milestones').toCollection().modify(migrateReminders);
        await tx.table('tasks').toCollection().modify(migrateReminders);
      });

    this.version(7)
      .stores(SCHEMA_V7)
      .upgrade(async (tx) => {
        // Migration: populate segments for existing activeTimers and workSessions (D-01)
        await tx
          .table('activeTimers')
          .toCollection()
          .modify((timer: Record<string, unknown>) => {
            if (!Array.isArray(timer.segments)) {
              timer.segments = timer.startedAt
                ? [{ startTime: new Date(Number(timer.startedAt)).toISOString() }]
                : [];
            }
          });

        await tx
          .table('workSessions')
          .toCollection()
          .modify((ws: Record<string, unknown>) => {
            if (!Array.isArray(ws.segments)) {
              ws.segments = [
                {
                  startTime: String(ws.startTime),
                  endTime: ws.endTime ? String(ws.endTime) : undefined,
                },
              ];
            }
          });
      });

    this.version(8).stores(SCHEMA_V8);

    this.version(9)
      .stores(SCHEMA_V9)
      .upgrade(async (tx) => {
        // Migration: populate default type and tags for existing notes (D-01, D-02)
        await tx
          .table('notes')
          .toCollection()
          .modify((note: Record<string, unknown>) => {
            if (!note.type) {
              note.type = 'quick_note';
            }
            if (!Array.isArray(note.tags)) {
              note.tags = [];
            }
          });
      });

    this.version(10).stores(SCHEMA_V10);

    // Multi-tab concurrency handlers (DATA-04, D-09, D-10)
    this.on('blocked', () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('db-upgrade-blocked'));
      }
    });

    this.on('versionchange', (event) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('db-version-changed', { detail: event }));
      }
      this.close();
    });
  }
}

export const db = new TaskPlannerDatabase();
