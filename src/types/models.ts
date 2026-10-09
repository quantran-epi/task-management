export type ProjectStatus = 'Open' | 'Pending' | 'In Progress' | 'Done' | 'Cancelled';
export type MilestoneStatus = 'Open' | 'Pending' | 'In Progress' | 'Done' | 'Cancelled';
export type TaskStatus = 'Open' | 'Pending' | 'In Progress' | 'Resolved' | 'In Review' | 'Done' | 'Cancelled';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';

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

export interface ReminderItem {
  id: string; // crypto.randomUUID()
  date: string; // YYYY-MM-DD
  time?: string | undefined; // HH:mm
  note?: string | undefined;
}

export interface Project {
  id: string; // RFC 4122 v4 UUID
  name: string;
  description?: string;
  deadline?: string; // YYYY-MM-DD
  notes?: string;
  status: ProjectStatus;
  jiraEpicKey?: string; // Phase 13.1 D-05: Jira Epic key mapping
  opsOwners?: string[];
  businessAnalysts?: string[];
  documentLinks?: string[];
  reminderDate?: string; // YYYY-MM-DD
  reminderNote?: string;
  reminders?: ReminderItem[];
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
  reminders?: ReminderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
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
  reminders?: ReminderItem[];
  checklist?: TaskChecklistItem[];
  isRecurring?: boolean;
  recurrenceFrequency?: RecurrenceFrequency;
  recurrenceInterval?: number; // e.g. 1 (every 1 day/week/month)
  recurrenceDaysOfWeek?: number[]; // [1..7] where 1 = Monday ... 7 = Sunday
  recurrenceEndDate?: string; // YYYY-MM-DD
  parentRecurringTaskId?: string; // Links spawned task to initial recurring task
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

export interface TimerSegment {
  startTime: string; // ISO 8601 string
  endTime?: string | undefined; // ISO 8601 string (undefined if currently running)
}

export interface WorkSession {
  id: string; // RFC 4122 v4 UUID
  taskId: string; // Reference to Task.id
  startTime: string; // ISO 8601 string
  endTime?: string | undefined; // ISO 8601 string
  date: string; // YYYY-MM-DD
  durationMinutes: number; // Positive integer minutes (>= 1)
  segments?: TimerSegment[] | undefined; // Phase 13.1 D-01: discrete running segments
  note?: string | undefined;
  createdAt: string; // ISO string metadata
  updatedAt: string; // ISO string metadata
}

export interface ActiveTimer {
  taskId: string; // Primary key - Reference to Task.id
  status: TimerStatus;
  startedAt: number; // Unix epoch ms
  accumulatedMs: number;
  sessionStartTime: string; // ISO 8601 string
  segments?: TimerSegment[] | undefined; // Phase 13.1 D-01: discrete running segments
}

export type NoteEntityType = 'task' | 'project' | 'milestone';
export type NoteType = 'quick_note' | 'document' | 'folder';

export interface Note {
  id: string; // RFC 4122 v4 UUID
  type?: NoteType | undefined; // D-01: 'quick_note' or 'document'
  parentId?: string | undefined; // D-02: Folder hierarchy
  tags?: string[] | undefined; // Taxonomy tags
  slug?: string | undefined; // URL / human readable slug
  entityType?: NoteEntityType | undefined; // Optional reference type
  entityId?: string | undefined; // Optional reference to Task/Project/Milestone id
  title?: string | undefined;
  body: string; // Markdown text content
  isPinned: boolean;
  deletedAt?: string | undefined; // D-17: Soft delete timestamp
  createdAt: string; // ISO string metadata
  updatedAt: string; // ISO string metadata
}

export interface NoteAttachment {
  id: string; // RFC 4122 v4 UUID
  noteId: string; // Reference to Note.id
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  caption?: string | undefined;
  createdAt: string; // ISO string metadata
  data: Blob; // Binary image payload
  filePath?: string | undefined; // Local disk file path
}

export type ChatScopeType = 'global' | 'task' | 'project' | 'milestone' | 'document';

export interface ChatThread {
  id: string; // RFC 4122 v4 UUID
  scopeKey: string; // Unique index: 'global' | 'task:<taskId>' | 'project:<projectId>' | 'milestone:<milestoneId>'
  scopeType: ChatScopeType;
  entityId?: string | undefined; // Target task/project/milestone id (undefined if global)
  title?: string | undefined;
  createdAt: string; // ISO string metadata
  updatedAt: string; // ISO string metadata
}

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatTokenUsage {
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  totalTokens?: number | undefined;
}

export interface ChatGeneratedFile {
  id: string;
  filename: string;
  format: string;
  sizeBytes: number;
  slideCount?: number | undefined;
  content?: string | undefined;
}

export interface ChatMessage {
  id: string; // RFC 4122 v4 UUID
  threadId: string; // Reference to ChatThread.id
  role: ChatRole;
  content: string; // Markdown text
  createdAt: string; // ISO string metadata
  isContextBoundary?: boolean | undefined; // Phase 13.2 D-06: /clear context reset marker
  durationMs?: number | undefined; // Total execution time in milliseconds
  tokenUsage?: ChatTokenUsage | undefined; // Model token usage metrics
  generatedFiles?: ChatGeneratedFile[] | undefined; // AI-generated downloadable files
}

