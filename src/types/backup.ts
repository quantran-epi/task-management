import type {
  Task,
  CapacityRule,
  CapacityOverride,
  PlannedAllocation,
  WorkSession,
  Note,
  ChatThread,
  ChatMessage,
  ChatTab,
  ActiveTimer,
  Setting,
  DocumentSet,
  PublishedDocumentMetadata,
  PublishAttemptCache,
  DlpAuditRecord,
  KnowledgeLink,
  TelegramSettingsRecord,
  TelegramWhitelistUser,
  System,
  ChangeRequest,
} from './models';
import type {
  AiEmployee,
  AiLead,
  AiSkill,
  AiTeam,
  AiTeamMember,
  AiTeamLink,
} from './aiOffice';

export interface MissingBackupSource {
  id: string;
  title: string;
  version?: number | undefined;
  hash?: string | undefined;
}

export interface MissingSourceCheckpoint {
  tabId: string;
  threadId: string;
  step: string;
  missingSourceIds: string[];
}

export interface BackupRecoveryInfo {
  missingSources: MissingBackupSource[];
  blockedTabs: MissingSourceCheckpoint[];
}

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
  tasks: Task[];
  capacityRules: CapacityRule[];
  capacityOverrides: CapacityOverride[];
  plannedAllocations: PlannedAllocation[];
  workSessions?: WorkSession[];
  notes?: Note[];
  noteAttachments?: BackupAttachmentRecord[];
  chatThreads?: ChatThread[];
  chatMessages?: ChatMessage[];
  chatTabs?: ChatTab[];
  activeTimers?: ActiveTimer[];
  settings?: Setting[];
  documentSets?: DocumentSet[];
  publishedDocuments?: PublishedDocumentMetadata[];
  publishAttempts?: PublishAttemptCache[];
  dlpAudits?: DlpAuditRecord[];
  knowledgeLinks?: KnowledgeLink[];
  telegramSettings?: TelegramSettingsRecord[];
  telegramWhitelist?: TelegramWhitelistUser[];
  systems?: System[];
  changeRequests?: ChangeRequest[];
  aiEmployees?: AiEmployee[];
  aiLeads?: AiLead[];
  aiSkills?: AiSkill[];
  aiTeams?: AiTeam[];
  aiTeamMembers?: AiTeamMember[];
  aiTeamLinks?: AiTeamLink[];
}

export interface BackupTableCounts {
  tasks: number;
  capacityRules: number;
  capacityOverrides: number;
  plannedAllocations: number;
  workSessions?: number;
  notes?: number;
  noteAttachments?: number;
  chatThreads?: number;
  chatMessages?: number;
  chatTabs?: number;
  activeTimers?: number;
  settings?: number;
  documentSets?: number;
  publishedDocuments?: number;
  publishAttempts?: number;
  dlpAudits?: number;
  knowledgeLinks?: number;
  telegramSettings?: number;
  telegramWhitelist?: number;
  systems?: number;
  changeRequests?: number;
  aiEmployees?: number;
  aiLeads?: number;
  aiSkills?: number;
  aiTeams?: number;
  aiTeamMembers?: number;
  aiTeamLinks?: number;
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
  recovery?: BackupRecoveryInfo;
}

export interface SnapshotData {
  timestamp: string;
  tables: BackupTableData;
  counts: BackupTableCounts;
}
