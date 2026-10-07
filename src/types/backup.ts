import type {
  Project,
  Milestone,
  Task,
  CapacityRule,
  CapacityOverride,
  PlannedAllocation,
  WorkSession,
  Note,
  ChatThread,
  ChatMessage,
  ActiveTimer,
  Setting,
} from './models';

export interface BackupAttachmentRecord {
  id: string;
  noteId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  data?: string | undefined; // Base64 Data URL (legacy backups only; modern backups omit binary data)
  filePath?: string | undefined; // Local disk file path
  caption?: string | undefined;
  createdAt: string;
}

export interface BackupTableData {
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  capacityRules: CapacityRule[];
  capacityOverrides: CapacityOverride[];
  plannedAllocations: PlannedAllocation[];
  workSessions?: WorkSession[];
  notes?: Note[];
  noteAttachments?: BackupAttachmentRecord[];
  chatThreads?: ChatThread[];
  chatMessages?: ChatMessage[];
  activeTimers?: ActiveTimer[];
  settings?: Setting[];
}

export interface BackupTableCounts {
  projects: number;
  milestones: number;
  tasks: number;
  capacityRules: number;
  capacityOverrides: number;
  plannedAllocations: number;
  workSessions?: number;
  notes?: number;
  noteAttachments?: number;
  chatThreads?: number;
  chatMessages?: number;
  activeTimers?: number;
  settings?: number;
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
