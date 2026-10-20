import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  handleAdminCommand,
  getAdminWizardState,
  clearAdminWizardState,
} from '../../src/services/telegram/telegramAdminWizard';
import {
  upsertWhitelistUser,
  recordPendingTelegramUser,
  getWhitelistUser,
} from '../../src/services/telegram/telegramSettingsService';

describe('Telegram Admin Wizard & Commands', () => {
  let testDb: TaskPlannerDatabase;
  const testDbName = 'TestAdminWizardDB';

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(testDbName);
    await testDb.open();
    clearAdminWizardState('admin_chat_id');
  });

  afterEach(async () => {
    clearAdminWizardState('admin_chat_id');
    await testDb.delete();
  });

  it('rejects commands if user is not admin or blocked', async () => {
    // 1. Unknown user
    const res1 = await handleAdminCommand('unknown_id', '/list_users', testDb);
    expect(res1.handled).toBe(false);

    // 2. Regular user (isAdmin not true)
    await upsertWhitelistUser(
      {
        chatId: 'regular_user',
        name: 'Regular',
        status: 'active',
        isAdmin: false,
      },
      testDb
    );
    const res2 = await handleAdminCommand('regular_user', '/list_users', testDb);
    expect(res2.handled).toBe(false);

    // 3. Admin user but blocked
    await upsertWhitelistUser(
      {
        chatId: 'blocked_admin',
        name: 'Bad Admin',
        status: 'blocked',
        isAdmin: true,
      },
      testDb
    );
    const res3 = await handleAdminCommand('blocked_admin', '/list_users', testDb);
    expect(res3.handled).toBe(false);
  });

  it('allows active admin to view help and user lists', async () => {
    await upsertWhitelistUser(
      {
        chatId: 'admin_chat_id',
        name: 'Super Admin',
        status: 'active',
        isAdmin: true,
        dailyLimit: 100,
      },
      testDb
    );

    // /admin help
    const helpRes = await handleAdminCommand('admin_chat_id', '/admin', testDb);
    expect(helpRes.handled).toBe(true);
    expect(helpRes.replyText).toContain('BẢNG ĐIỀU KHIỂN QUẢN TRỊ VIÊN');
    expect(helpRes.replyText).toContain('/list_users');
    expect(helpRes.replyText).toContain('/approve_user');

    // /list_users
    const listRes = await handleAdminCommand('admin_chat_id', '/list_users', testDb);
    expect(listRes.handled).toBe(true);
    expect(listRes.replyText).toContain('DANH SÁCH NGƯỜI DÙNG');
    expect(listRes.replyText).toContain('Super Admin');
    expect(listRes.replyText).toContain('👑 [Admin]');

    // /list_pending when empty
    const pendingEmpty = await handleAdminCommand('admin_chat_id', '/list_pending', testDb);
    expect(pendingEmpty.handled).toBe(true);
    expect(pendingEmpty.replyText).toContain('Không có người dùng nào đang chờ phê duyệt');

    // add pending user
    await recordPendingTelegramUser('pending_guest', 'Guest Bob', testDb);
    const pendingWithData = await handleAdminCommand('admin_chat_id', '/list_pending', testDb);
    expect(pendingWithData.handled).toBe(true);
    expect(pendingWithData.replyText).toContain('DANH SÁCH CHỜ PHÊ DUYỆT (1)');
    expect(pendingWithData.replyText).toContain('Guest Bob');
    expect(pendingWithData.replyText).toContain('pending_guest');
  });

  it('handles multi-step approve_user flow and cancel', async () => {
    await upsertWhitelistUser(
      {
        chatId: 'admin_chat_id',
        name: 'Super Admin',
        status: 'active',
        isAdmin: true,
      },
      testDb
    );

    await recordPendingTelegramUser('pending_guest_2', 'Alice', testDb);

    // Step 1: Trigger /approve_user
    const step1 = await handleAdminCommand('admin_chat_id', '/approve_user', testDb);
    expect(step1.handled).toBe(true);
    expect(step1.replyText).toContain('Vui lòng nhập **Chat ID**');
    expect(getAdminWizardState('admin_chat_id')?.action).toBe('approve_user');

    // Step 2: Cancel test
    const cancelRes = await handleAdminCommand('admin_chat_id', '/cancel', testDb);
    expect(cancelRes.handled).toBe(true);
    expect(cancelRes.replyText).toContain('Đã hủy lệnh quản trị');
    expect(getAdminWizardState('admin_chat_id')).toBeUndefined();

    // Trigger again and complete
    await handleAdminCommand('admin_chat_id', '/approve_user', testDb);
    const step2 = await handleAdminCommand('admin_chat_id', 'pending_guest_2', testDb);
    expect(step2.handled).toBe(true);
    expect(step2.replyText).toContain('Phê duyệt thành công!');
    expect(step2.replyText).toContain('Alice');
    expect(step2.approvedUser?.chatId).toBe('pending_guest_2');
    expect(getAdminWizardState('admin_chat_id')).toBeUndefined();

    // Verify DB
    const approvedInDb = await getWhitelistUser('pending_guest_2', testDb);
    expect(approvedInDb?.status).toBe('active');
  });

  it('handles multi-step adjust_quota flow with direct, +delta and -delta values', async () => {
    await upsertWhitelistUser(
      {
        chatId: 'admin_chat_id',
        name: 'Super Admin',
        status: 'active',
        isAdmin: true,
      },
      testDb
    );

    await upsertWhitelistUser(
      {
        chatId: 'user_target',
        name: 'Target User',
        status: 'active',
        dailyLimit: 30,
      },
      testDb
    );

    // 1. Direct number (set to 50)
    await handleAdminCommand('admin_chat_id', '/adjust_quota', testDb);
    const askLimit = await handleAdminCommand('admin_chat_id', 'user_target', testDb);
    expect(askLimit.handled).toBe(true);
    expect(askLimit.replyText).toContain('Hạn mức hiện tại: **30**');

    const resultSet = await handleAdminCommand('admin_chat_id', '50', testDb);
    expect(resultSet.handled).toBe(true);
    expect(resultSet.replyText).toContain('Hạn mức mới: **50**');
    let target = await getWhitelistUser('user_target', testDb);
    expect(target?.dailyLimit).toBe(50);

    // 2. Relative +15
    await handleAdminCommand('admin_chat_id', '/adjust_quota', testDb);
    await handleAdminCommand('admin_chat_id', 'user_target', testDb);
    const resultPlus = await handleAdminCommand('admin_chat_id', '+15', testDb);
    expect(resultPlus.replyText).toContain('Hạn mức mới: **65**');
    target = await getWhitelistUser('user_target', testDb);
    expect(target?.dailyLimit).toBe(65);

    // 3. Relative -20
    await handleAdminCommand('admin_chat_id', '/adjust_quota', testDb);
    await handleAdminCommand('admin_chat_id', 'user_target', testDb);
    const resultMinus = await handleAdminCommand('admin_chat_id', '-20', testDb);
    expect(resultMinus.replyText).toContain('Hạn mức mới: **45**');
    target = await getWhitelistUser('user_target', testDb);
    expect(target?.dailyLimit).toBe(45);
  });

  it('handles multi-step block_user flow and prevents self-locking', async () => {
    await upsertWhitelistUser(
      {
        chatId: 'admin_chat_id',
        name: 'Super Admin',
        status: 'active',
        isAdmin: true,
      },
      testDb
    );

    await upsertWhitelistUser(
      {
        chatId: 'spammer_user',
        name: 'Spammer',
        status: 'active',
      },
      testDb
    );

    // Block spammer
    await handleAdminCommand('admin_chat_id', '/block_user', testDb);
    const blockRes = await handleAdminCommand('admin_chat_id', 'spammer_user', testDb);
    expect(blockRes.handled).toBe(true);
    expect(blockRes.replyText).toContain('Đã khóa người dùng thành công!');

    const spammer = await getWhitelistUser('spammer_user', testDb);
    expect(spammer?.status).toBe('blocked');

    // Self block attempt prevention
    await handleAdminCommand('admin_chat_id', '/block_user', testDb);
    const selfBlockRes = await handleAdminCommand('admin_chat_id', 'admin_chat_id', testDb);
    expect(selfBlockRes.replyText).toContain('không thể tự khóa tài khoản Admin');
    const adminStillActive = await getWhitelistUser('admin_chat_id', testDb);
    expect(adminStillActive?.status).toBe('active');
  });

  it('handles multi-step unblock_user flow', async () => {
    await upsertWhitelistUser(
      {
        chatId: 'admin_chat_id',
        name: 'Super Admin',
        status: 'active',
        isAdmin: true,
      },
      testDb
    );

    await upsertWhitelistUser(
      {
        chatId: 'blocked_client',
        name: 'Blocked Client',
        status: 'blocked',
      },
      testDb
    );

    // 1. Step 1: Prompt for Chat ID
    const step1 = await handleAdminCommand('admin_chat_id', '/unblock_user', testDb);
    expect(step1.handled).toBe(true);
    expect(step1.replyText).toContain('Mở khóa người dùng');
    expect(step1.replyText).toContain('Vui lòng nhập **Chat ID**');
    expect(getAdminWizardState('admin_chat_id')?.action).toBe('unblock_user');

    // 2. Step 2: Submit Chat ID
    const step2 = await handleAdminCommand('admin_chat_id', 'blocked_client', testDb);
    expect(step2.handled).toBe(true);
    expect(step2.replyText).toContain('Đã mở khóa người dùng thành công!');
    expect(step2.replyText).toContain('Blocked Client');
    expect(step2.approvedUser?.status).toBe('active');
    expect(getAdminWizardState('admin_chat_id')).toBeUndefined();

    // Verify DB state
    const client = await getWhitelistUser('blocked_client', testDb);
    expect(client?.status).toBe('active');
  });
});
