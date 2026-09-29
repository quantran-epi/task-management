export type ProjectStatus = 'Open' | 'In Progress' | 'Done' | 'Cancelled';
export type MilestoneStatus = 'Open' | 'In Progress' | 'Done' | 'Cancelled';
export type TaskStatus = 'Open' | 'In Progress' | 'Resolved' | 'In Review' | 'Done' | 'Cancelled';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type WorkType =
  | 'code'
  | 'document'
  | 'meeting'
  | 'support_testing'
  | 'investigate'
  | 'configuration'
  | 'review_code';

export const WORK_TYPES: readonly WorkType[] = [
  'code',
  'document',
  'meeting',
  'support_testing',
  'investigate',
  'configuration',
  'review_code',
] as const;

export interface Project {
  id: string; // RFC 4122 v4 UUID
  name: string;
  description?: string;
  deadline?: string; // YYYY-MM-DD
  notes?: string;
  status: ProjectStatus;
  opsOwners?: string[];
  businessAnalysts?: string[];
  documentLinks?: string[];
  reminderDate?: string; // YYYY-MM-DD
  reminderNote?: string;
  createdAt: string; // ISO string metadata
  updatedAt: string; // ISO string metadata
}

export interface Milestone {
  id: string; // RFC 4122 v4 UUID
  projectId: string; // Reference to Project.id
  name: string;
  description?: string;
  deadline?: string; // YYYY-MM-DD
  notes?: string;
  status: MilestoneStatus;
  opsOwners?: string[];
  businessAnalysts?: string[];
  reminderDate?: string; // YYYY-MM-DD
  reminderNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string; // RFC 4122 v4 UUID
  projectId?: string; // Optional reference to Project.id
  milestoneId?: string; // Optional reference to Milestone.id
  name: string;
  description?: string;
  deadline?: string; // YYYY-MM-DD
  notes?: string;
  actualStartDate?: string; // YYYY-MM-DD
  actualEndDate?: string; // YYYY-MM-DD
  status: TaskStatus;
  progress: number; // Integer percentage 0 - 100
  priority: TaskPriority;
  estimateMinutes: number; // Non-negative integer minutes
  workType?: WorkType;
  jiraKey?: string | undefined;
  opsOwners?: string[];
  businessAnalysts?: string[];
  documentLinks?: string[];
  reminderDate?: string; // YYYY-MM-DD
  reminderNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CapacityRule {
  id: string; // RFC 4122 v4 UUID
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  workMinutes: number; // Non-negative integer minutes (e.g. 480 for 8h)
}

export interface CapacityOverride {
  id: string; // RFC 4122 v4 UUID
  date: string; // YYYY-MM-DD
  workMinutes: number; // Non-negative integer minutes (0 for leave/holiday)
  note?: string;
}

export interface PlannedAllocation {
  id: string; // RFC 4122 v4 UUID
  taskId: string; // Reference to Task.id
  date: string; // YYYY-MM-DD
  allocatedMinutes: number; // Non-negative integer minutes
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface BackupMetadata {
  id: string; // RFC 4122 v4 UUID
  timestamp: string; // ISO string
  appVersion: string;
  recordCount: number;
}

export type TimerStatus = 'running' | 'paused';

export interface WorkSession {
  id: string; // RFC 4122 v4 UUID
  taskId: string; // Reference to Task.id
  startTime: string; // ISO 8601 string
  endTime?: string; // ISO 8601 string
  date: string; // YYYY-MM-DD
  durationMinutes: number; // Positive integer minutes (>= 1)
  note?: string;
  createdAt: string; // ISO string metadata
  updatedAt: string; // ISO string metadata
}

export interface ActiveTimer {
  taskId: string; // Primary key - Reference to Task.id
  status: TimerStatus;
  startedAt: number; // Unix epoch ms
  accumulatedMs: number;
  sessionStartTime: string; // ISO 8601 string
}

