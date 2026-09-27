import type {
  Project,
  Milestone,
  Task,
  CapacityRule,
  CapacityOverride,
  PlannedAllocation,
} from './models';

export interface BackupTableData {
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  capacityRules: CapacityRule[];
  capacityOverrides: CapacityOverride[];
  plannedAllocations: PlannedAllocation[];
}

export interface BackupTableCounts {
  projects: number;
  milestones: number;
  tasks: number;
  capacityRules: number;
  capacityOverrides: number;
  plannedAllocations: number;
}

export interface BackupEnvelope {
  app: 'personal-task-planner';
  schemaVersion: number;
  exportedAt: string; // ISO 8601
  tables: BackupTableData;
  counts: BackupTableCounts;
}

export interface ValidationErrorDetail {
  table: string;
  recordId?: string;
  field: string;
  message: string;
}

export interface BackupValidationResult {
  valid: boolean;
  envelope?: BackupEnvelope;
  errors: ValidationErrorDetail[];
}

export interface SnapshotData {
  timestamp: string;
  tables: BackupTableData;
  counts: BackupTableCounts;
}
