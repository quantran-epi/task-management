import type { ChatMessageGrounding } from '../services/ai/groundedAnswerSchemas';
import type {
  AiTeamAssignmentRunStatus,
  AiTeamAssignmentStopReason,
} from './aiOffice';

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

// Phase 31.1: Enterprise Systems Catalog & Change Request Models (ENT-SYS-01, ENT-CR-01)
export type SystemType = 'LOGICAL_GROUP' | 'SERVICE' | 'SCHEMA' | 'UI' | 'WORKER';

/**
 * D-24 invariant: `sshConfigId` / `remoteRepoPath` / `defaultBaseBranch` are only
 * meaningful when `type !== 'LOGICAL_GROUP'`. A parent system is a grouping node
 * with no repository binding of its own.
 */
export interface System {
  id: string; // RFC 4122 v4 UUID
  name: string;
  code: string; // Unique system identifier code (e.g. CORE_BANKING, CREDIT_SVC)
  parentId: string | null; // null for a subsystem with no parent; parent rows are always roots
  type: SystemType;
  description?: string;
  sshConfigId?: string; // Foreign key referencing SshConfigRecord
  remoteRepoPath?: string; // Remote filesystem git repository path
  defaultBaseBranch?: string; // Default target branch (e.g. main, develop)
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export type CrType = 'NEW_FEATURE' | 'ENHANCEMENT' | 'BUGFIX';
export type CrStatus = 'Open' | 'Pending' | 'In Progress' | 'Done' | 'Cancelled';

/** A single system targeted by a change request (D-25). */
export interface CrTarget {
  systemId: string; // Reference to System.id
  featureBranch?: string; // Per-target feature branch; defaults to feature/{cr.code}
}

export interface ChangeRequest {
  id: string; // RFC 4122 v4 UUID (matches previous Project.id for migrated records)
  name: string;
  code: string; // Required human code (e.g. CR-2026-001)
  description?: string;
  deadline?: string; // YYYY-MM-DD
  status: CrStatus;
  type: CrType;
  targets: CrTarget[]; // Multi-system targeting
  jiraEpicKey?: string;
  opsOwners?: string[];
  businessAnalysts?: string[];
  documentLinks?: string[];
  reminderDate?: string;
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
  crId: string; // Required reference to ChangeRequest.id
  systemId?: string; // Optional reference to System.id; must be one of the CR's targets
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

export type NoteEntityType = 'task' | 'cr' | 'system';
export type NoteType = 'quick_note' | 'document' | 'folder' | 'diagram';

export interface Note {
  id: string; // RFC 4122 v4 UUID
  type?: NoteType | undefined; // D-01: 'quick_note' or 'document'
  parentId?: string | undefined; // D-02: Folder hierarchy
  tags?: string[] | undefined; // Taxonomy tags
  slug?: string | undefined; // URL / human readable slug
  entityType?: NoteEntityType | undefined; // Optional reference type
  entityId?: string | undefined; // Optional reference to Task/CR/System id
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

export type ChatScopeType = 'global' | 'task' | 'cr' | 'system' | 'document' | 'team';

export interface ChatThread {
  id: string; // RFC 4122 v4 UUID
  scopeKey: string; // Unique index: 'global' | 'task:<taskId>' | 'cr:<crId>' | 'system:<systemId>' | 'document:<docId>'
  scopeType: ChatScopeType;
  entityId?: string | undefined; // Optional reference to Task/CR/System id| undefined; // Target task/CR/system id (undefined if global)
  title?: string | undefined;
  createdAt: string; // ISO string metadata
  updatedAt: string; // ISO string metadata
}

export type ChatTabType = 'chat';
export type ChatTabStatus = 'idle' | 'processing' | 'interrupted' | 'error' | 'stale' | 'complete';

/** Per-tab settings only. Endpoint, API keys, tokens, and passphrases stay global/session-only. */
export interface ChatTabConfig {
  model?: string | undefined;
  analysisMode?: boolean | undefined;
  autoApproveMutations?: boolean | undefined;
  mcpEnabled?: boolean | undefined;
  knowledgeEnabled?: boolean | undefined;
  promptContextOptions?: Record<string, boolean | string | number> | undefined;
  attachments?: string[] | undefined;
}

export interface ChatTabCheckpoint {
  requestId: string;
  step?: string | undefined;
  startedAt: string;
  status?: 'interrupted' | 'error' | undefined;
}

export interface ChatTab {
  id: string;
  threadId: string;
  scopeKey: string;
  type: ChatTabType;
  title: string;
  order: number;
  active?: boolean | undefined;
  status?: ChatTabStatus | undefined;
  checkpoint?: ChatTabCheckpoint | undefined;
  config?: ChatTabConfig | undefined;
  createdAt: string;
  updatedAt: string;
}

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatTokenUsage {
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  totalTokens?: number | undefined;
  /** Phase 38 D-09: charged as normal input tokens when the provider reports them; absent means 0. */
  cacheReadTokens?: number | undefined;
  cacheCreationTokens?: number | undefined;
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
  grounding?: ChatMessageGrounding | undefined; // Structured grounding (Plan 19-10 D-46)
  // Phase 34 D-31: AI Office attribution. All optional so existing rows stay valid.
  agentId?: string | undefined;
  agentName?: string | undefined;
  agentKind?: 'lead' | 'employee' | undefined;
  messageKind?: 'instruction' | 'report' | 'synthesis' | 'plan' | undefined;
  /**
   * CR-06: an instruction is displayed as the lead's message but belongs to the
   * employee it was assigned to. This carries the assignee so history lookups can
   * find it without misattributing the row.
   */
  targetAgentId?: string | undefined;
  // Phase 37 D-22: ledger links. The truth of an attempt's status lives on the
  // `aiTeamAssignments` row; these fields let the transcript render and pair rows
  // without a join. Written by the coordinator's terminal writer, not by chat.
  batchId?: string | undefined;
  assignmentId?: string | undefined;
  attemptNo?: number | undefined;
  runStatus?: AiTeamAssignmentRunStatus | undefined;
  stopReason?: AiTeamAssignmentStopReason | undefined;
  incomplete?: boolean | undefined;
  /** 37.1 R14: the message this one answers, so the UI can quote it. */
  replyToId?: string | undefined;
  /** 37-07: the synthesis row that replaced this one (write path is `supersedeTeamMessage`). */
  supersededByMessageId?: string | undefined;
  supersededAt?: string | undefined;
}

// Phase 16: Knowledge Server Foundation, DLP Checks & AST Ingestion models (D-01, D-08, D-18, D-27, D-29)

export type PublishPrimaryState =
  | 'Never published'
  | 'In sync'
  | 'Local changes'
  | 'Publishing'
  | 'Warning'
  | 'Failed';

export type DocumentSetPreset =
  | 'Chung'
  | 'TheoMoiTruong'
  | 'TheoModule'
  | 'TheoPhienBan'
  | 'BoSung'
  | 'TuyChinh';

export type DocumentSetRelationKind = 'EXTENDS' | 'SUPPLEMENTS' | 'SUPERSEDES';

export interface DocumentSetRelation {
  kind: DocumentSetRelationKind;
  targetSetId: string;
}

export interface DocumentSetScope {
  domain: string;
  environment: string | null;
  version: string | null;
}

export interface DocumentSet {
  id: string; // RFC 4122 v4 UUID
  name: string;
  description?: string | undefined;
  documentIds: string[]; // Explicit ordered snapshot of stable Note UUIDs (D-01)
  createdAt: string; // ISO string metadata
  updatedAt: string; // ISO string metadata

  // Plan 13 extensions (D-17, D-18, D-32, D-33, D-35)
  // Optional at model interface so pre-19 test records without these fields load safely without migration (D-35).
  scope?: DocumentSetScope | undefined;
  aliases?: readonly string[] | undefined;
  relations?: readonly DocumentSetRelation[] | undefined;
  isBase?: boolean | undefined;
  presentationRevision?: number | undefined;
  preset?: DocumentSetPreset | undefined;
}

export interface PublishedDocumentMetadata {
  setId: string; // Reference to DocumentSet.id
  documentId: string; // Reference to Note.id
  lastKnownRemoteAt: string; // ISO string metadata
  publishedContentHash: string; // SHA-256 of normalized published markdown
  activeSnapshotId?: string | undefined; // Server-authoritative snapshot ID
  activeAttemptId?: string | undefined; // Server-authoritative attempt ID
  lastPrimaryState?: PublishPrimaryState | undefined;
}

export interface FrozenSubmittedDocumentMetadata {
  documentId: string; // Stable Note UUID
  submittedContentHash: string; // Lowercase 64-hex SHA-256 hash of submitted content
}

export interface PublishAttemptCache {
  id: string; // RFC 4122 v4 UUID
  setId: string; // Reference to DocumentSet.id
  attemptKey?: string | undefined; // Client-generated idempotency key
  startedAt: string; // ISO string metadata
  completedAt?: string | undefined; // ISO string metadata
  durationMs?: number | undefined;
  status: PublishPrimaryState;
  addedCount: number;
  changedCount: number;
  removedCount: number;
  unchangedCount: number;
  warningCount: number;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  submittedDocuments?: FrozenSubmittedDocumentMetadata[] | undefined; // Ordered content-free frozen manifest (D-06, D-08, D-10)
}

export interface DlpAuditRecord {
  id: string; // RFC 4122 v4 UUID
  setId: string; // Reference to DocumentSet.id
  attemptId?: string | undefined;
  ruleSetVersion: string;
  timestamp: string; // ISO string metadata
  documentIds: string[];
  contentHashes: string[];
  findingCountsByCategory: Record<string, number>;
  userAction: 'confirmed' | 'cancelled' | 'auto_passed';
}

export type TaskMateEntityType = 'task' | 'cr' | 'system';

export interface KnowledgeLink {
  id: string; // RFC 4122 v4 UUID
  linkKey: string; // Unique composite key `${taskMateEntityType}:${taskMateEntityId}:${setId}:${urn || docId}`
  taskMateEntityType: TaskMateEntityType;
  taskMateEntityId: string; // UUID of task, CR, or system
  setId: string; // UUID of DocumentSet
  urn?: string | undefined; // Optional canonical knowledge graph URN
  docId?: string | undefined; // Optional stable Note/Document UUID
  displayLabel: string; // Human-readable label for badges/pills
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// Telegram AI Gateway Models
export type {
  TelegramDataScope,
  TelegramUserStatus,
  TelegramSettingsRecord,
  TelegramWhitelistUser,
  TelegramSessionLog,
  TelegramInboundEvent,
  TelegramConflictEvent,
  TelegramStatusEvent,
} from '../services/telegram/telegramTypes';



