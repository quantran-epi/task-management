import Dexie, { type Table } from 'dexie';
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5 } from './schema';
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
