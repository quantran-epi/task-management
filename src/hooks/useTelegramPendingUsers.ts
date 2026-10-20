import { useLiveQuery } from 'dexie-react-hooks';
import { db, type TaskPlannerDatabase } from '../db';
import type { TelegramWhitelistUser } from '../services/telegram/telegramTypes';
import {
  approvePendingUser,
  blockPendingUser,
  unblockUser,
  deleteWhitelistUser,
} from '../services/telegram/telegramSettingsService';
import { sendTelegramDirectMessage } from '../services/telegram/telegramHeadlessWorker';

export interface UseTelegramPendingUsersResult {
  pendingUsers: TelegramWhitelistUser[];
  pendingCount: number;
  quickApprove: (chatId: string, botToken?: string) => Promise<TelegramWhitelistUser>;
  blockUser: (chatId: string) => Promise<TelegramWhitelistUser>;
  unblockUser: (chatId: string, botToken?: string) => Promise<TelegramWhitelistUser>;
  dismissUser: (chatId: string) => Promise<void>;
}

export function useTelegramPendingUsers(
  customDb: TaskPlannerDatabase = db
): UseTelegramPendingUsersResult {
  const pendingUsers =
    useLiveQuery(
      () => customDb.telegramWhitelist.where('status').equals('pending').toArray(),
      [customDb]
    ) || [];

  const pendingCount = pendingUsers.length;

  const quickApprove = async (
    chatId: string,
    botToken?: string
  ): Promise<TelegramWhitelistUser> => {
    const user = await approvePendingUser(chatId, {}, customDb);

    if (botToken && botToken.trim()) {
      try {
        const welcomeMsg = `🎉 **Tài khoản của bạn đã được phê duyệt!**\n\nXin chào ${user.name}, quản trị viên đã phê duyệt quyền truy cập TaskMate AI Bot cho bạn.\n\n📊 **Hạn mức:** ${user.dailyLimit} tin nhắn/ngày\n🔍 **Phạm vi:** ${user.dataScope}\n🧠 **Lịch sử:** ${user.maxHistoryTurns ?? 5} lượt\n\n💡 *Gõ /help để xem hướng dẫn hoặc đặt câu hỏi trực tiếp.*`;
        await sendTelegramDirectMessage(botToken.trim(), chatId, welcomeMsg);
      } catch (err) {
        console.warn('Failed to send Telegram approval notice:', err);
      }
    }

    return user;
  };

  const blockUser = async (chatId: string): Promise<TelegramWhitelistUser> => {
    return await blockPendingUser(chatId, customDb);
  };

  const unblock = async (
    chatId: string,
    botToken?: string
  ): Promise<TelegramWhitelistUser> => {
    const user = await unblockUser(chatId, customDb);

    if (botToken && botToken.trim()) {
      try {
        const msg = `🔓 **Tài khoản của bạn đã được mở khóa!**\n\nXin chào ${user.name}, quản trị viên đã kích hoạt lại quyền truy cập TaskMate AI Bot cho bạn. Bạn có thể tiếp tục sử dụng bình thường.`;
        await sendTelegramDirectMessage(botToken.trim(), chatId, msg);
      } catch (err) {
        console.warn('Failed to send Telegram unblock notice:', err);
      }
    }

    return user;
  };

  const dismissUser = async (chatId: string): Promise<void> => {
    await deleteWhitelistUser(chatId, customDb);
  };

  return {
    pendingUsers,
    pendingCount,
    quickApprove,
    blockUser,
    unblockUser: unblock,
    dismissUser,
  };
}
