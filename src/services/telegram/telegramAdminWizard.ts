import { type TaskPlannerDatabase, db as defaultDb } from '../../db';
import type { TelegramWhitelistUser } from './telegramTypes';
import {
  getWhitelist,
  getPendingTelegramUsers,
  approvePendingUser,
  blockPendingUser,
  unblockUser,
  upsertWhitelistUser,
  getWhitelistUser,
} from './telegramSettingsService';

export type AdminWizardAction = 'approve_user' | 'adjust_quota' | 'block_user' | 'unblock_user';

export interface AdminWizardState {
  chatId: string; // The admin's chatId
  action: AdminWizardAction;
  step: number; // 1 = waiting for target user chatId, 2 = waiting for param (e.g. quota value)
  targetChatId?: string;
  createdAt: number;
}

// In-memory conversation state map keyed by admin's chatId
const adminStates = new Map<string, AdminWizardState>();

export function getAdminWizardState(adminChatId: string): AdminWizardState | undefined {
  const state = adminStates.get(adminChatId);
  // Auto-expire session if older than 10 minutes
  if (state && Date.now() - state.createdAt > 10 * 60 * 1000) {
    adminStates.delete(adminChatId);
    return undefined;
  }
  return state;
}

export function setAdminWizardState(state: AdminWizardState): void {
  adminStates.set(state.chatId, state);
}

export function clearAdminWizardState(adminChatId: string): void {
  adminStates.delete(adminChatId);
}

export interface AdminCommandResult {
  handled: boolean;
  replyText?: string;
  // If an approval was executed, returns details so caller can notify the approved user
  approvedUser?: TelegramWhitelistUser;
}

/**
 * Normalizes commands such as /list_users, /list-users, /listusers, /list_pending, etc.
 */
function normalizeAdminCommand(cmd: string): string {
  const clean = cmd.trim().toLowerCase().replace(/^[/]/, '').replace(/[-_]/g, '');
  return clean;
}

/**
 * Handles admin conversational wizard & direct admin commands.
 */
export async function handleAdminCommand(
  adminChatId: string,
  rawText: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AdminCommandResult> {
  const admin = await getWhitelistUser(adminChatId, db);
  if (!admin || !admin.isAdmin || admin.status !== 'active') {
    return { handled: false };
  }

  const trimmed = rawText.trim();
  const lower = trimmed.toLowerCase();

  // 1. Check if cancel command
  if (lower === '/cancel' || lower === 'cancel' || lower === 'huy' || lower === 'hủy') {
    const existing = getAdminWizardState(adminChatId);
    if (existing) {
      clearAdminWizardState(adminChatId);
      return {
        handled: true,
        replyText: '🚫 **Đã hủy lệnh quản trị.**\n\nBạn có thể gõ `/admin` để xem danh sách lệnh có sẵn.',
      };
    }
  }

  // 2. Check if admin is currently in a wizard flow
  const currentWizard = getAdminWizardState(adminChatId);
  if (currentWizard) {
    return await processWizardStep(currentWizard, trimmed, db);
  }

  // 3. Match new admin slash commands
  if (!trimmed.startsWith('/')) {
    return { handled: false };
  }

  const [cmdToken] = trimmed.split(/\s+/);
  const normalized = normalizeAdminCommand(cmdToken || '');

  switch (normalized) {
    case 'admin':
    case 'adminhelp':
      return {
        handled: true,
        replyText: [
          '👑 **BẢNG ĐIỀU KHIỂN QUẢN TRỊ VIÊN (ADMIN)**',
          '',
          'Tập lệnh quản lý hệ thống Telegram AI Gateway:',
          '- `/list_users`: Xem danh sách tất cả người dùng trong Whitelist',
          '- `/list_pending`: Xem danh sách người dùng đang chờ phê duyệt',
          '- `/approve_user`: Phê duyệt người dùng vào hệ thống',
          '- `/adjust_quota`: Thay đổi hạn mức tin nhắn hàng ngày của người dùng',
          '- `/block_user`: Tạm khóa người dùng',
          '- `/unblock_user`: Mở khóa người dùng',
          '- `/cancel`: Hủy lệnh đang thực hiện dở dang',
          '',
          '💡 *Khi gõ lệnh thao tác, bot sẽ hướng dẫn nhập ID từng bước.*',
        ].join('\n'),
      };

    case 'listusers':
    case 'listuser':
      return await handleListUsers(db);

    case 'listpending':
    case 'listpendingusers':
    case 'pendingusers':
      return await handleListPending(db);

    case 'approveuser':
    case 'approvependinguser':
    case 'approve':
      setAdminWizardState({
        chatId: adminChatId,
        action: 'approve_user',
        step: 1,
        createdAt: Date.now(),
      });
      return {
        handled: true,
        replyText: [
          '📝 **Phê duyệt người dùng**',
          '',
          'Vui lòng nhập **Chat ID** của người dùng bạn muốn duyệt:',
          '*(Gõ `/cancel` nếu muốn hủy)*',
        ].join('\n'),
      };

    case 'adjustquota':
    case 'setquota':
    case 'quota':
      setAdminWizardState({
        chatId: adminChatId,
        action: 'adjust_quota',
        step: 1,
        createdAt: Date.now(),
      });
      return {
        handled: true,
        replyText: [
          '⚙️ **Điều chỉnh hạn mức (Quota)**',
          '',
          'Vui lòng nhập **Chat ID** của người dùng cần điều chỉnh:',
          '*(Gõ `/cancel` nếu muốn hủy)*',
        ].join('\n'),
      };

    case 'blockuser':
    case 'banuser':
    case 'block':
      setAdminWizardState({
        chatId: adminChatId,
        action: 'block_user',
        step: 1,
        createdAt: Date.now(),
      });
      return {
        handled: true,
        replyText: [
          '⛔ **Khóa người dùng**',
          '',
          'Vui lòng nhập **Chat ID** của người dùng bạn muốn tạm khóa:',
          '*(Gõ `/cancel` nếu muốn hủy)*',
        ].join('\n'),
      };

    case 'unblockuser':
    case 'unbanuser':
    case 'unblock':
      setAdminWizardState({
        chatId: adminChatId,
        action: 'unblock_user',
        step: 1,
        createdAt: Date.now(),
      });
      return {
        handled: true,
        replyText: [
          '🔓 **Mở khóa người dùng**',
          '',
          'Vui lòng nhập **Chat ID** của người dùng bạn muốn mở khóa:',
          '*(Gõ `/cancel` nếu muốn hủy)*',
        ].join('\n'),
      };

    default:
      return { handled: false };
  }
}

async function handleListUsers(db: TaskPlannerDatabase): Promise<AdminCommandResult> {
  const users = await getWhitelist(db);
  if (users.length === 0) {
    return {
      handled: true,
      replyText: '📋 Danh sách người dùng hiện đang trống.',
    };
  }

  const lines = [
    `👥 **DANH SÁCH NGƯỜI DÙNG (${users.length})**`,
    '',
  ];

  for (const u of users) {
    const roleTag = u.isAdmin ? ' 👑 [Admin]' : '';
    const statusIcon = u.status === 'active' ? '🟢' : u.status === 'pending' ? '🟡' : '🔴';
    lines.push(
      `${statusIcon} **${u.name}**${roleTag}`,
      `   🆔 \`${u.chatId}\` | Trạng thái: \`${u.status}\``,
      `   📊 Hạn mức: \`${u.usedToday}/${u.dailyLimit}\` | Scope: \`${u.dataScope}\``,
      ''
    );
  }

  return {
    handled: true,
    replyText: lines.join('\n').trim(),
  };
}

async function handleListPending(db: TaskPlannerDatabase): Promise<AdminCommandResult> {
  const pending = await getPendingTelegramUsers(db);
  if (pending.length === 0) {
    return {
      handled: true,
      replyText: '✨ **Không có người dùng nào đang chờ phê duyệt.**',
    };
  }

  const lines = [
    `⏳ **DANH SÁCH CHỜ PHÊ DUYỆT (${pending.length})**`,
    '',
  ];

  for (const p of pending) {
    lines.push(
      `👤 **${p.name}**`,
      `   🆔 Chat ID: \`${p.chatId}\``,
      `   📅 Yêu cầu lúc: ${p.createdAt.slice(0, 16).replace('T', ' ')}`,
      ''
    );
  }

  lines.push('💡 *Dùng lệnh /approve_user để duyệt người dùng.*');

  return {
    handled: true,
    replyText: lines.join('\n').trim(),
  };
}

async function processWizardStep(
  wizard: AdminWizardState,
  input: string,
  db: TaskPlannerDatabase
): Promise<AdminCommandResult> {
  // APPROVE USER FLOW
  if (wizard.action === 'approve_user') {
    const targetCid = input.trim();
    if (!targetCid) {
      return {
        handled: true,
        replyText: '⚠️ Chat ID không hợp lệ. Vui lòng nhập lại Chat ID hoặc gõ `/cancel`:',
      };
    }

    const existing = await getWhitelistUser(targetCid, db);
    if (!existing) {
      return {
        handled: true,
        replyText: `⚠️ Không tìm thấy người dùng có Chat ID \`${targetCid}\`.\nVui lòng kiểm tra lại danh sách /list_pending hoặc gõ \`/cancel\`:`,
      };
    }

    const approved = await approvePendingUser(targetCid, {}, db);
    clearAdminWizardState(wizard.chatId);

    return {
      handled: true,
      replyText: `✅ **Phê duyệt thành công!**\n\nNgười dùng **${approved.name}** (Chat ID: \`${approved.chatId}\`) đã được kích hoạt với hạn mức ${approved.dailyLimit} tin nhắn/ngày.`,
      approvedUser: approved,
    };
  }

  // BLOCK USER FLOW
  if (wizard.action === 'block_user') {
    const targetCid = input.trim();
    if (!targetCid) {
      return {
        handled: true,
        replyText: '⚠️ Chat ID không hợp lệ. Vui lòng nhập lại Chat ID hoặc gõ `/cancel`:',
      };
    }

    const existing = await getWhitelistUser(targetCid, db);
    if (!existing) {
      return {
        handled: true,
        replyText: `⚠️ Không tìm thấy người dùng có Chat ID \`${targetCid}\`.\nVui lòng nhập lại hoặc gõ \`/cancel\`:`,
      };
    }

    if (existing.isAdmin && existing.chatId === wizard.chatId) {
      clearAdminWizardState(wizard.chatId);
      return {
        handled: true,
        replyText: '⚠️ Bạn không thể tự khóa tài khoản Admin của chính mình.',
      };
    }

    await blockPendingUser(targetCid, db);
    clearAdminWizardState(wizard.chatId);

    return {
      handled: true,
      replyText: `⛔ **Đã khóa người dùng thành công!**\n\nNgười dùng **${existing.name}** (Chat ID: \`${targetCid}\`) đã được chuyển sang trạng thái \`blocked\`.`,
    };
  }

  // UNBLOCK USER FLOW
  if (wizard.action === 'unblock_user') {
    const targetCid = input.trim();
    if (!targetCid) {
      return {
        handled: true,
        replyText: '⚠️ Chat ID không hợp lệ. Vui lòng nhập lại Chat ID hoặc gõ `/cancel`:',
      };
    }

    const existing = await getWhitelistUser(targetCid, db);
    if (!existing) {
      return {
        handled: true,
        replyText: `⚠️ Không tìm thấy người dùng có Chat ID \`${targetCid}\`.\nVui lòng nhập lại hoặc gõ \`/cancel\`:`,
      };
    }

    const unblocked = await unblockUser(targetCid, db);
    clearAdminWizardState(wizard.chatId);

    return {
      handled: true,
      replyText: `🔓 **Đã mở khóa người dùng thành công!**\n\nNgười dùng **${unblocked.name}** (Chat ID: \`${targetCid}\`) đã được kích hoạt lại (trạng thái: \`active\`).`,
      approvedUser: unblocked,
    };
  }

  // ADJUST QUOTA FLOW (2 Steps)
  if (wizard.action === 'adjust_quota') {
    if (wizard.step === 1) {
      const targetCid = input.trim();
      const existing = await getWhitelistUser(targetCid, db);
      if (!existing) {
        return {
          handled: true,
          replyText: `⚠️ Không tìm thấy người dùng có Chat ID \`${targetCid}\`.\nVui lòng kiểm tra lại hoặc gõ \`/cancel\`:`,
        };
      }

      setAdminWizardState({
        ...wizard,
        step: 2,
        targetChatId: targetCid,
      });

      return {
        handled: true,
        replyText: [
          `👤 Người dùng: **${existing.name}** (\`${targetCid}\`)`,
          `📊 Hạn mức hiện tại: **${existing.dailyLimit}** (Đã dùng hôm nay: ${existing.usedToday})`,
          '',
          'Vui lòng nhập **hạn mức mới** (ví dụ: `50`, hoặc tăng giảm tương đối như `+10`, `-5`):',
          '*(Gõ `/cancel` nếu muốn hủy)*',
        ].join('\n'),
      };
    }

    if (wizard.step === 2) {
      const targetCid = wizard.targetChatId!;
      const existing = await getWhitelistUser(targetCid, db);
      if (!existing) {
        clearAdminWizardState(wizard.chatId);
        return {
          handled: true,
          replyText: '⚠️ Người dùng không còn tồn tại.',
        };
      }

      const rawVal = input.trim();
      let newLimit = existing.dailyLimit;

      if (rawVal.startsWith('+')) {
        const delta = parseInt(rawVal.slice(1), 10);
        if (isNaN(delta) || delta <= 0) {
          return {
            handled: true,
            replyText: '⚠️ Số lượng tăng không hợp lệ (ví dụ: `+10`). Vui lòng nhập lại:',
          };
        }
        newLimit += delta;
      } else if (rawVal.startsWith('-')) {
        const delta = parseInt(rawVal.slice(1), 10);
        if (isNaN(delta) || delta <= 0) {
          return {
            handled: true,
            replyText: '⚠️ Số lượng giảm không hợp lệ (ví dụ: `-5`). Vui lòng nhập lại:',
          };
        }
        newLimit = Math.max(1, newLimit - delta);
      } else {
        const directNum = parseInt(rawVal, 10);
        if (isNaN(directNum) || directNum <= 0) {
          return {
            handled: true,
            replyText: '⚠️ Hạn mức phải là số nguyên dương lớn hơn 0 (ví dụ: `50`). Vui lòng nhập lại:',
          };
        }
        newLimit = directNum;
      }

      const updated = await upsertWhitelistUser(
        {
          chatId: targetCid,
          dailyLimit: newLimit,
        },
        db
      );

      clearAdminWizardState(wizard.chatId);

      return {
        handled: true,
        replyText: `🎉 **Đã cập nhật hạn mức thành công!**\n\nNgười dùng: **${updated.name}** (\`${targetCid}\`)\nHạn mức mới: **${updated.dailyLimit}** tin nhắn/ngày.`,
      };
    }
  }

  return { handled: false };
}
