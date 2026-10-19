export type TelegramDataScope = 'full' | 'knowledge_only' | 'tasks_only' | 'pure_llm';

export type TelegramUserStatus = 'active' | 'blocked' | 'pending';

export interface TelegramSettingsRecord {
  id: 'default';
  botToken: string;
  isEnabled: boolean;
  autoStartOnLaunch: boolean;
  defaultScope: TelegramDataScope;
  maxHistoryTurns?: number | undefined; // default 5 turns
  updatedAt?: string | undefined;
}

export interface TelegramWhitelistUser {
  chatId: string;
  name: string;
  status: TelegramUserStatus;
  dataScope: TelegramDataScope;
  dailyLimit: number;
  usedToday: number;
  lastActiveDate: string; // YYYY-MM-DD
  maxHistoryTurns?: number | undefined; // default 5 turns, 0 = single-turn
  sessionResetAt?: string | undefined; // ISO timestamp to filter history
  overQuotaCommandsUsed?: number | undefined; // Count of /help or /reset used after reaching daily limit
  overQuotaAttempts?: number | undefined; // Count of chat message attempts after exhausting daily limit
  createdAt: string;
  updatedAt: string;
}

export interface TelegramSessionLog {
  id: string; // UUID
  chatId: string;
  userName?: string | undefined;
  userMessage: string;
  aiResponse: string;
  dataScopeUsed: TelegramDataScope;
  tokenCount?: number | undefined;
  createdAt: string; // ISO 8601
}

export interface TelegramInboundEvent {
  update_id: number;
  message_id: number;
  chat_id: string;
  from_name: string;
  text: string;
  date: number;
}

export interface TelegramConflictEvent {
  reason: string;
  timestamp: string;
}

export interface TelegramStatusEvent {
  running: boolean;
  error?: string | null;
}

export interface TelegramBroadcastResult {
  total: number;
  successCount: number;
  failureCount: number;
  failures: Array<{ chatId: string; error: string }>;
}
