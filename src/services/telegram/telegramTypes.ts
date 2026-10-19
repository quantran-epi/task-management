export type TelegramDataScope = 'full' | 'knowledge_only' | 'tasks_only' | 'pure_llm';

export type TelegramUserStatus = 'active' | 'blocked';

export interface TelegramSettingsRecord {
  id: 'default';
  botToken: string;
  isEnabled: boolean;
  autoStartOnLaunch: boolean;
  defaultScope: TelegramDataScope;
  updatedAt?: string;
}

export interface TelegramWhitelistUser {
  chatId: string;
  name: string;
  status: TelegramUserStatus;
  dataScope: TelegramDataScope;
  dailyLimit: number;
  usedToday: number;
  lastActiveDate: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

export interface TelegramSessionLog {
  id: string; // UUID
  chatId: string;
  userName?: string;
  userMessage: string;
  aiResponse: string;
  dataScopeUsed: TelegramDataScope;
  tokenCount?: number;
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
