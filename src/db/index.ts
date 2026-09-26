import Dexie, { type Table } from 'dexie';
import { SCHEMA_V1 } from './schema';
import type {
  Project,
  Milestone,
  Task,
  CapacityRule,
  CapacityOverride,
  PlannedAllocation,
  Setting,
  BackupMetadata,
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

  constructor(databaseName = 'PersonalTaskPlannerDB') {
    super(databaseName);

    this.version(1).stores(SCHEMA_V1);

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
