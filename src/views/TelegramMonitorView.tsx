import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Tabs,
  Table,
  Switch,
  Badge,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Progress,
  Space,
  Button,
  Alert,
  Typography,
  Tooltip,
  Popconfirm,
  Radio,
  message,
} from 'antd';
import {
  SendOutlined,
  CheckCircleOutlined,
  StopOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ClockCircleOutlined,
  NotificationOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  saveTelegramSettings,
  upsertWhitelistUser,
  deleteWhitelistUser,
} from '../services/telegram/telegramSettingsService';
import { useTelegramPendingUsers } from '../hooks/useTelegramPendingUsers';
import {
  sendTelegramDirectMessage,
  broadcastTelegramMessage,
} from '../services/telegram/telegramHeadlessWorker';
import type {
  TelegramWhitelistUser,
  TelegramSessionLog,
  TelegramDataScope,
  TelegramConflictEvent,
  TelegramStatusEvent,
} from '../services/telegram/telegramTypes';
import { isTauriApp } from '../utils/timerPopout';

const { Text, Title } = Typography;

export const TelegramMonitorView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'whitelist' | 'settings'>('monitor');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [conflictInfo, setConflictInfo] = useState<TelegramConflictEvent | null>(null);
  const [toggling, setToggling] = useState<boolean>(false);

  // Settings Form State
  const [botToken, setBotToken] = useState<string>('');
  const [autoStart, setAutoStart] = useState<boolean>(false);
  const [defaultScope, setDefaultScope] = useState<TelegramDataScope>('full');
  const [defaultMaxHistoryTurns, setDefaultMaxHistoryTurns] = useState<number>(5);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Whitelist Modal State
  const [userModalOpen, setUserModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<TelegramWhitelistUser | null>(null);
  const [userForm] = Form.useForm();

  // Search/Filter state
  const [logSearch, setLogSearch] = useState<string>('');
  const [logChatFilter, setLogChatFilter] = useState<string>('');

  // Send Message Modal State
  const [sendModalOpen, setSendModalOpen] = useState<boolean>(false);
  const [sendMode, setSendMode] = useState<'direct' | 'broadcast'>('direct');
  const [targetChatId, setTargetChatId] = useState<string>('');
  const [messageText, setMessageText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);

  // Live queries and hooks
  const { pendingUsers, pendingCount, quickApprove, blockUser, dismissUser } = useTelegramPendingUsers();
  const settingsRecord = useLiveQuery(() => db.telegramSettings.get('default'));
  const whitelist = useLiveQuery(() => db.telegramWhitelist.toArray(), []) || [];
  const logs =
    useLiveQuery(
      () => db.telegramSessionLogs.orderBy('createdAt').reverse().limit(100).toArray(),
      []
    ) || [];

  const activeUsersCount = useMemo(() => {
    return whitelist.filter((u) => u.status === 'active').length;
  }, [whitelist]);

  // Sync settings when loaded
  useEffect(() => {
    if (settingsRecord) {
      setBotToken(settingsRecord.botToken || '');
      setAutoStart(Boolean(settingsRecord.autoStartOnLaunch));
      setDefaultScope(settingsRecord.defaultScope || 'full');
      setDefaultMaxHistoryTurns(settingsRecord.maxHistoryTurns ?? 5);
    }
  }, [settingsRecord]);

  // Initial status check & listen to Tauri events
  useEffect(() => {
    let unlistenStatus: (() => void) | undefined;
    let unlistenConflict: (() => void) | undefined;

    const checkStatus = async () => {
      if (!isTauriApp()) return;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<TelegramStatusEvent>('get_telegram_status');
        setIsRunning(res.running);
        setBotError(res.error || null);
      } catch (err) {
        console.warn('Failed to query telegram status:', err);
      }
    };

    const attachListeners = async () => {
      if (!isTauriApp()) return;
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlistenStatus = await listen<TelegramStatusEvent>('telegram-status-changed', (event) => {
          setIsRunning(event.payload.running);
          setBotError(event.payload.error || null);
        });

        unlistenConflict = await listen<TelegramConflictEvent>(
          'telegram-conflict-detected',
          (event) => {
            setConflictInfo(event.payload);
            setIsRunning(false);
          }
        );
      } catch (err) {
        console.warn('Failed to attach telegram event listeners:', err);
      }
    };

    checkStatus();
    attachListeners();

    return () => {
      if (unlistenStatus) unlistenStatus();
      if (unlistenConflict) unlistenConflict();
    };
  }, []);

  // Handle Master Switch On/Off
  const handleToggleBot = async (checked: boolean) => {
    if (!isTauriApp()) {
      message.warning('Telegram Bot polling chỉ khả dụng trên ứng dụng máy tính (Tauri desktop).');
      return;
    }

    if (checked && !botToken.trim()) {
      message.error('Vui lòng nhập Telegram Bot Token trước khi bật Bot.');
      setActiveTab('settings');
      return;
    }

    setToggling(true);
    setConflictInfo(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      if (checked) {
        await invoke('start_telegram_polling', { token: botToken.trim() });
        await saveTelegramSettings({ isEnabled: true, botToken: botToken.trim() });
        setIsRunning(true);
        setBotError(null);
        message.success('Đã kích hoạt Telegram Bot listener.');
      } else {
        await invoke('stop_telegram_polling');
        await saveTelegramSettings({ isEnabled: false });
        setIsRunning(false);
        message.info('Đã dừng Telegram Bot listener.');
      }
    } catch (err: any) {
      console.error('Toggle error:', err);
      message.error(err?.toString() || 'Lỗi khi thay đổi trạng thái Bot');
    } finally {
      setToggling(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await saveTelegramSettings({
        botToken: botToken.trim(),
        autoStartOnLaunch: autoStart,
        defaultScope,
        maxHistoryTurns: defaultMaxHistoryTurns,
      });
      message.success('Đã lưu cấu hình Telegram Bot');
    } catch (err) {
      message.error('Không thể lưu cấu hình');
    } finally {
      setSavingSettings(false);
    }
  };

  // Test Bot Token Connection
  const handleTestConnection = async () => {
    if (!botToken.trim()) {
      message.warning('Vui lòng nhập Token trước');
      return;
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/getMe`);
      const data = await res.json();
      if (data.ok) {
        message.success(`Kết nối thành công: @${data.result.username} (${data.result.first_name})`);
      } else {
        message.error(`Bot API từ chối token: ${data.description}`);
      }
    } catch (err: any) {
      message.error(`Lỗi kết nối mạng: ${err.message || 'Network error'}`);
    }
  };

  // Save Whitelist User Modal
  const handleSaveUser = async () => {
    try {
      const values = await userForm.validateFields();
      const isNewUser = !editingUser;
      const isFirstTimeApproved = isNewUser || (editingUser && editingUser.status !== 'active' && values.status === 'active');
      const turns = values.maxHistoryTurns !== undefined ? values.maxHistoryTurns : defaultMaxHistoryTurns;
      await upsertWhitelistUser({
        chatId: values.chatId.trim(),
        name: values.name.trim(),
        status: values.status,
        dataScope: values.dataScope,
        dailyLimit: values.dailyLimit,
        maxHistoryTurns: turns,
      });

      // Send telegram notification to user ONLY on first-time approval/activation
      if (isFirstTimeApproved && values.status === 'active' && botToken.trim()) {
        try {
          const notifyMsg = `🎉 **Tài khoản của bạn đã được phê duyệt!**\n\nXin chào ${values.name.trim()}, quản trị viên đã kích hoạt quyền sử dụng TaskMate AI Bot cho bạn.\n\n📊 **Hạn mức:** ${values.dailyLimit} tin nhắn/ngày\n🔍 **Phạm vi:** ${values.dataScope}\n🧠 **Lịch sử:** ${turns} lượt\n\n💡 *Gõ /help để xem hướng dẫn hoặc /reset để đặt lại phiên trò chuyện.*`;
          await sendTelegramDirectMessage(botToken.trim(), values.chatId.trim(), notifyMsg);
        } catch (sendErr) {
          console.warn('Could not send approval notice to Telegram:', sendErr);
        }
      }

      message.success(isNewUser ? 'Đã thêm và thông báo người dùng qua Telegram' : 'Đã cập nhật người dùng');
      setUserModalOpen(false);
      userForm.resetFields();
    } catch (err) {
      // validation failed
    }
  };

  const handleEditUser = (user: TelegramWhitelistUser) => {
    setEditingUser(user);
    userForm.setFieldsValue({
      chatId: user.chatId,
      name: user.name,
      status: user.status,
      dataScope: user.dataScope,
      dailyLimit: user.dailyLimit,
      maxHistoryTurns: user.maxHistoryTurns ?? defaultMaxHistoryTurns,
    });
    setUserModalOpen(true);
  };

  const handleDeleteUser = async (chatId: string) => {
    await deleteWhitelistUser(chatId);
    message.success('Đã xoá người dùng khỏi Whitelist');
  };

  const handleOpenSendModal = (chatId?: string) => {
    setTargetChatId(chatId || (whitelist[0]?.chatId ?? ''));
    setSendMode('direct');
    setMessageText('');
    setSendModalOpen(true);
  };

  const handleSendMessage = async () => {
    if (!botToken.trim()) {
      message.error('Vui lòng cấu hình Telegram Bot Token trước khi gửi tin nhắn.');
      setActiveTab('settings');
      return;
    }
    if (!messageText.trim()) {
      message.warning('Vui lòng nhập nội dung tin nhắn.');
      return;
    }

    setIsSending(true);
    try {
      if (sendMode === 'direct') {
        if (!targetChatId.trim()) {
          message.warning('Vui lòng chọn hoặc nhập Chat ID người nhận.');
          return;
        }
        await sendTelegramDirectMessage(botToken.trim(), targetChatId.trim(), messageText.trim());
        message.success(`Đã gửi tin nhắn đến Chat ID ${targetChatId}`);
        setSendModalOpen(false);
      } else {
        const activeUsers = whitelist.filter((u) => u.status === 'active');
        if (activeUsers.length === 0) {
          message.warning('Không có người dùng nào đang hoạt động (Active) trong Whitelist để broadcast.');
          return;
        }
        const res = await broadcastTelegramMessage(
          botToken.trim(),
          activeUsers.map((u) => u.chatId),
          messageText.trim()
        );
        if (res.failureCount === 0) {
          message.success(`Đã broadcast thành công tới tất cả ${res.successCount} người dùng.`);
          setSendModalOpen(false);
        } else {
          message.warning(
            `Đã gửi thành công ${res.successCount}/${res.total}. Thất bại ${res.failureCount} (${res.failures.map((f) => f.chatId).join(', ')})`
          );
          setSendModalOpen(false);
        }
      }
    } catch (err: any) {
      console.error('Send message error:', err);
      message.error(`Lỗi khi gửi: ${err?.message || String(err)}`);
    } finally {
      setIsSending(false);
    }
  };

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchSearch =
        !logSearch ||
        log.userMessage.toLowerCase().includes(logSearch.toLowerCase()) ||
        log.aiResponse.toLowerCase().includes(logSearch.toLowerCase()) ||
        (log.userName && log.userName.toLowerCase().includes(logSearch.toLowerCase()));
      const matchChat = !logChatFilter || log.chatId === logChatFilter;
      return matchSearch && matchChat;
    });
  }, [logs, logSearch, logChatFilter]);

  const renderStatusBadge = () => {
    if (conflictInfo) {
      return (
        <Badge
          status="error"
          text={<Text strong type="danger">409 Conflict (Bị ngắt do thiết bị khác)</Text>}
        />
      );
    }
    if (isRunning) {
      return <Badge status="processing" text={<Text strong style={{ color: '#10b981' }}>Đang lắng nghe (Running)</Text>} />;
    }
    return <Badge status="default" text={<Text type="secondary">Đã dừng (Stopped)</Text>} />;
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header Card */}
      <Card
        style={{
          marginBottom: 20,
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <Space orientation="vertical" size={2}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SendOutlined style={{ fontSize: 24, color: '#4f46e5' }} />
              <Title level={4} style={{ margin: 0 }}>
                Telegram AI Gateway
              </Title>
              {renderStatusBadge()}
            </div>
            <Text type="secondary">
              Headless polling gateway nhận tin nhắn từ Telegram, xử lý qua AI và trả lời trực tiếp.
            </Text>
          </Space>

          <Space size="middle" align="center" wrap>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => handleOpenSendModal()}
            >
              Gửi tin nhắn
            </Button>

            <Space align="center">
              <Text strong>Lắng nghe:</Text>
              <Switch
                checked={isRunning}
                loading={toggling}
                onChange={handleToggleBot}
                checkedChildren={<CheckCircleOutlined />}
                unCheckedChildren={<StopOutlined />}
              />
            </Space>

            <Tooltip title="Tự động khởi chạy polling mỗi khi mở TaskMate trên máy tính này">
              <Switch
                checked={autoStart}
                onChange={async (checked) => {
                  setAutoStart(checked);
                  await saveTelegramSettings({ autoStartOnLaunch: checked });
                }}
              />
              <Text type="secondary" style={{ fontSize: 13, marginLeft: 6 }}>
                Tự khởi động
              </Text>
            </Tooltip>
          </Space>
        </div>

        {conflictInfo && (
          <Alert
            style={{ marginTop: 16 }}
            type="error"
            showIcon
            message="Xung đột Telegram 409 Conflict"
            description="Telegram Bot API chỉ cho phép một thiết bị chạy getUpdates tại một thời điểm. Polling trên máy này đã tự động dừng lại vì có thiết bị khác đang kết nối bot token này."
          />
        )}

        {botError && !conflictInfo && (
          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            showIcon
            message="Trạng thái Bot"
            description={botError}
          />
        )}
      </Card>

      {/* Main Tabs */}
      <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as any)}
          items={[
            {
              key: 'monitor',
              label: (
                <span>
                  <ClockCircleOutlined /> Live Monitor
                </span>
              ),
              children: (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 16,
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <Space>
                      <Input.Search
                        placeholder="Tìm kiếm nội dung tin nhắn..."
                        allowClear
                        value={logSearch}
                        onChange={(e) => setLogSearch(e.target.value)}
                        style={{ width: 280 }}
                      />
                      {logChatFilter && (
                        <Tag
                          closable
                          onClose={() => setLogChatFilter('')}
                          color="blue"
                        >
                          Lọc theo Chat ID: {logChatFilter}
                        </Tag>
                      )}
                    </Space>
                    <Text type="secondary">
                      Hiển thị {filteredLogs.length} hội thoại gần nhất
                    </Text>
                  </div>

                  <Table
                    dataSource={filteredLogs}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                    expandable={{
                      expandedRowRender: (r: TelegramSessionLog) => (
                        <div
                          style={{
                            padding: '12px 16px',
                            background: '#f8fafc',
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <div style={{ marginBottom: 12 }}>
                            <Space align="center" style={{ marginBottom: 4 }}>
                              <Tag color="cyan">User ({r.userName || 'Anonymous'} - {r.chatId})</Tag>
                              <Button
                                size="small"
                                type="link"
                                icon={<SendOutlined />}
                                onClick={() => handleOpenSendModal(r.chatId)}
                              >
                                Gửi phản hồi trực tiếp
                              </Button>
                            </Space>
                            <div
                              style={{
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                color: '#1e293b',
                                fontSize: 13,
                                lineHeight: 1.6,
                                padding: '8px 12px',
                                background: '#ffffff',
                                borderRadius: 6,
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              {r.userMessage}
                            </div>
                          </div>
                          <div>
                            <Tag color="purple" style={{ marginBottom: 4 }}>
                              AI Response
                            </Tag>
                            <div
                              style={{
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                color: '#0f172a',
                                fontSize: 13,
                                lineHeight: 1.6,
                                background: '#ffffff',
                                padding: '10px 14px',
                                borderRadius: 6,
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              {r.aiResponse}
                            </div>
                          </div>
                        </div>
                      ),
                      defaultExpandAllRows: false,
                    }}
                    columns={[
                      {
                        title: 'Thời gian',
                        dataIndex: 'createdAt',
                        key: 'createdAt',
                        width: 140,
                        render: (val: string) => (
                          <Text style={{ fontSize: 12 }}>
                            {new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            <br />
                            <span style={{ color: '#888' }}>{val.slice(0, 10)}</span>
                          </Text>
                        ),
                      },
                      {
                        title: 'Người gửi',
                        key: 'user',
                        width: 180,
                        render: (_, r: TelegramSessionLog) => (
                          <div>
                            <Text strong>{r.userName || 'Anonymous'}</Text>
                            <br />
                            <Space size={4}>
                              <Text
                                copyable
                                style={{ fontSize: 12, color: '#4f46e5', cursor: 'pointer' }}
                                onClick={() => setLogChatFilter(r.chatId)}
                              >
                                {r.chatId}
                              </Text>
                              <Tooltip title="Gửi tin nhắn trực tiếp">
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<SendOutlined style={{ fontSize: 12, color: '#4f46e5' }} />}
                                  onClick={() => handleOpenSendModal(r.chatId)}
                                />
                              </Tooltip>
                            </Space>
                          </div>
                        ),
                      },
                      {
                        title: 'Nội dung (Bấm + xem đầy đủ)',
                        key: 'dialog',
                        render: (_, r: TelegramSessionLog) => (
                          <div style={{ maxWidth: 480 }}>
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                              <Tag color="cyan" style={{ marginRight: 6, flexShrink: 0 }}>User</Tag>
                              <Text ellipsis style={{ flex: 1, color: '#334155' }}>
                                {r.userMessage}
                              </Text>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <Tag color="purple" style={{ marginRight: 6, flexShrink: 0 }}>AI</Tag>
                              <Text type="secondary" ellipsis style={{ flex: 1 }}>
                                {r.aiResponse}
                              </Text>
                            </div>
                          </div>
                        ),
                      },
                      {
                        title: 'Scope & Tokens',
                        key: 'meta',
                        width: 160,
                        render: (_, r: TelegramSessionLog) => (
                          <div>
                            <Tag
                              color={
                                r.dataScopeUsed === 'full'
                                  ? 'blue'
                                  : r.dataScopeUsed === 'knowledge_only'
                                  ? 'green'
                                  : r.dataScopeUsed === 'tasks_only'
                                  ? 'orange'
                                  : 'default'
                              }
                            >
                              {r.dataScopeUsed}
                            </Tag>
                            {Boolean(r.tokenCount) && (
                              <div style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
                                ~{r.tokenCount} tokens
                              </div>
                            )}
                          </div>
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            },
            {
              key: 'whitelist',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <SafetyCertificateOutlined />
                  <span>Whitelist & Phân quyền ({activeUsersCount})</span>
                  {pendingCount > 0 && (
                    <Badge count={pendingCount} size="small" style={{ backgroundColor: '#ef4444' }} />
                  )}
                </span>
              ),
              children: (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 16,
                    }}
                  >
                    <Text type="secondary">
                      Chỉ những người dùng trong danh sách Whitelist mới có thể nhận phản hồi và ngữ cảnh từ TaskMate.
                    </Text>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setEditingUser(null);
                        userForm.resetFields();
                        userForm.setFieldsValue({
                          status: 'active',
                          dataScope: defaultScope,
                          dailyLimit: 30,
                          maxHistoryTurns: defaultMaxHistoryTurns,
                        });
                        setUserModalOpen(true);
                      }}
                    >
                      Thêm người dùng
                    </Button>
                  </div>

                  {pendingUsers.length > 0 && (
                    <Card
                      style={{
                        marginBottom: 20,
                        borderColor: '#fed7aa',
                        backgroundColor: '#fffbeb',
                        borderRadius: 8,
                      }}
                      title={
                        <Space>
                          <UserOutlined style={{ color: '#d97706' }} />
                          <strong style={{ color: '#b45309' }}>
                            Hàng chờ phê duyệt ({pendingCount} người dùng mới)
                          </strong>
                        </Space>
                      }
                      size="small"
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {pendingUsers.map((p) => (
                          <div
                            key={p.chatId}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '10px 12px',
                              background: '#ffffff',
                              borderRadius: 6,
                              border: '1px solid #fde68a',
                              flexWrap: 'wrap',
                              gap: 8,
                            }}
                          >
                            <Space orientation="vertical" size={2}>
                              <Space>
                                <strong style={{ fontSize: 14 }}>{p.name || 'Người dùng mới'}</strong>
                                <Tag color="warning">Pending</Tag>
                                <Text copyable style={{ fontSize: 12, color: '#4f46e5' }}>
                                  {p.chatId}
                                </Text>
                              </Space>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                Đăng ký lúc: {new Date(p.createdAt).toLocaleString()}
                              </Text>
                            </Space>

                            <Space wrap>
                              <Button
                                size="small"
                                type="primary"
                                style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                                icon={<CheckCircleOutlined />}
                                onClick={async () => {
                                  try {
                                    await quickApprove(p.chatId, botToken);
                                    message.success(`Đã duyệt nhanh người dùng ${p.name || p.chatId}`);
                                  } catch (err: any) {
                                    message.error('Lỗi khi phê duyệt: ' + (err?.message || String(err)));
                                  }
                                }}
                              >
                                Phê duyệt nhanh
                              </Button>

                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => {
                                  setEditingUser(p);
                                  userForm.setFieldsValue({
                                    chatId: p.chatId,
                                    name: p.name || `User_${p.chatId}`,
                                    status: 'active',
                                    dataScope: p.dataScope || defaultScope,
                                    dailyLimit: p.dailyLimit || 30,
                                    maxHistoryTurns: p.maxHistoryTurns ?? defaultMaxHistoryTurns,
                                  });
                                  setUserModalOpen(true);
                                }}
                              >
                                Tuỳ chỉnh & Duyệt
                              </Button>

                              <Popconfirm
                                title="Chặn người dùng này?"
                                description="Người dùng sẽ không thể gửi tin nhắn đến bot."
                                onConfirm={async () => {
                                  await blockUser(p.chatId);
                                  message.info(`Đã chặn người dùng ${p.chatId}`);
                                }}
                                okText="Chặn"
                                cancelText="Huỷ"
                              >
                                <Button size="small" danger icon={<StopOutlined />}>
                                  Chặn
                                </Button>
                              </Popconfirm>

                              <Popconfirm
                                title="Xoá khỏi hàng chờ?"
                                onConfirm={async () => {
                                  await dismissUser(p.chatId);
                                  message.info('Đã xoá yêu cầu');
                                }}
                                okText="Xoá"
                                cancelText="Huỷ"
                              >
                                <Button size="small" type="text" danger icon={<DeleteOutlined />}>
                                  Xoá
                                </Button>
                              </Popconfirm>
                            </Space>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  <Table
                    dataSource={whitelist}
                    rowKey="chatId"
                    pagination={{ pageSize: 10 }}
                    columns={[
                      {
                        title: 'Chat ID',
                        dataIndex: 'chatId',
                        key: 'chatId',
                        render: (cid: string) => <Text copyable strong>{cid}</Text>,
                      },
                      {
                        title: 'Tên gợi nhớ',
                        dataIndex: 'name',
                        key: 'name',
                      },
                      {
                        title: 'Trạng thái',
                        dataIndex: 'status',
                        key: 'status',
                        render: (st: string) => {
                          if (st === 'active') return <Tag color="success">Hoạt động</Tag>;
                          if (st === 'pending') return <Tag color="warning">Chờ duyệt</Tag>;
                          return <Tag color="error">Tạm khoá</Tag>;
                        },
                      },
                      {
                        title: 'Phạm vi dữ liệu (Scope)',
                        dataIndex: 'dataScope',
                        key: 'dataScope',
                        render: (sc: TelegramDataScope) => {
                          const labels: Record<TelegramDataScope, { label: string; color: string }> = {
                            full: { label: 'Toàn bộ (Tasks + Docs)', color: 'blue' },
                            knowledge_only: { label: 'Chỉ Docs/Notes', color: 'green' },
                            tasks_only: { label: 'Chỉ Tasks/Projects', color: 'orange' },
                            pure_llm: { label: 'Không kèm dữ liệu (Pure LLM)', color: 'default' },
                          };
                          const meta = labels[sc] || labels.full;
                          return <Tag color={meta.color}>{meta.label}</Tag>;
                        },
                      },
                      {
                        title: 'Hạn mức / ngày',
                        key: 'quota',
                        render: (_, r: TelegramWhitelistUser) => {
                          const percent = Math.min(100, Math.round((r.usedToday / r.dailyLimit) * 100));
                          const hasSpam = (r.overQuotaAttempts ?? 0) > 0;
                          return (
                            <div style={{ minWidth: 120 }}>
                              <div style={{ fontSize: 12, marginBottom: 2 }}>
                                {r.usedToday} / {r.dailyLimit} reqs
                              </div>
                              <Progress
                                percent={percent}
                                size="small"
                                status={r.usedToday >= r.dailyLimit ? 'exception' : 'normal'}
                              />
                              {hasSpam && (
                                <div style={{ marginTop: 4 }}>
                                  <Tag color={(r.overQuotaAttempts ?? 0) > 3 ? 'red' : 'volcano'} style={{ fontSize: 11 }}>
                                    Spam over-quota: {r.overQuotaAttempts} lần
                                  </Tag>
                                </div>
                              )}
                            </div>
                          );
                        },
                      },
                      {
                        title: 'Lịch sử',
                        key: 'historyTurns',
                        width: 110,
                        render: (_, r: TelegramWhitelistUser) => (
                          <Tag color="cyan">
                            {r.maxHistoryTurns ?? 5} lượt
                          </Tag>
                        ),
                      },
                      {
                        title: 'Thao tác',
                        key: 'actions',
                        render: (_, r: TelegramWhitelistUser) => (
                          <Space>
                            <Tooltip title="Gửi tin nhắn Telegram cho người dùng này">
                              <Button
                                size="small"
                                icon={<SendOutlined style={{ color: '#4f46e5' }} />}
                                onClick={() => handleOpenSendModal(r.chatId)}
                              />
                            </Tooltip>
                            <Button
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => handleEditUser(r)}
                            />
                            <Popconfirm
                              title="Xoá người dùng này khỏi Whitelist?"
                              onConfirm={() => handleDeleteUser(r.chatId)}
                              okText="Xoá"
                              cancelText="Huỷ"
                            >
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            },
            {
              key: 'settings',
              label: (
                <span>
                  <SettingOutlined /> Cấu hình Bot
                </span>
              ),
              children: (
                <div style={{ maxWidth: 640 }}>
                  <Form layout="vertical">
                    <Form.Item
                      label={<strong>Telegram Bot Token</strong>}
                      extra="Lấy từ @BotFather trên Telegram. Token được lưu cục bộ trên máy và không bao giờ đồng bộ ra ngoài."
                    >
                      <Input.Password
                        value={botToken}
                        onChange={(e) => setBotToken(e.target.value)}
                        placeholder="123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ..."
                      />
                    </Form.Item>

                    <Form.Item label={<strong>Phạm vi dữ liệu mặc định cho User mới</strong>}>
                      <Select
                        value={defaultScope}
                        onChange={(v) => setDefaultScope(v)}
                        options={[
                          { value: 'full', label: 'Toàn bộ (Tasks + Projects + Knowledge Docs)' },
                          { value: 'knowledge_only', label: 'Chỉ Knowledge Docs' },
                          { value: 'tasks_only', label: 'Chỉ Tasks & Projects' },
                          { value: 'pure_llm', label: 'Chỉ LLM (Không chia sẻ dữ liệu TaskMate)' },
                        ]}
                      />
                    </Form.Item>

                    <Form.Item
                      label={<strong>Số lượt nhớ hội thoại mặc định (Turns)</strong>}
                      extra="Số câu hỏi - trả lời gần nhất bot ghi nhớ làm ngữ cảnh trước khi trả lời. 0 = Single-turn."
                    >
                      <InputNumber
                        min={0}
                        max={20}
                        value={defaultMaxHistoryTurns}
                        onChange={(v) => setDefaultMaxHistoryTurns(v ?? 5)}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>

                    <Space size="middle" style={{ marginTop: 12 }}>
                      <Button
                        type="primary"
                        loading={savingSettings}
                        onClick={handleSaveSettings}
                      >
                        Lưu cài đặt
                      </Button>
                      <Button icon={<ReloadOutlined />} onClick={handleTestConnection}>
                        Kiểm tra kết nối Token
                      </Button>
                    </Space>
                  </Form>
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Whitelist Add/Edit Modal */}
      <Modal
        title={editingUser ? 'Chỉnh sửa người dùng Whitelist' : 'Thêm người dùng Whitelist'}
        open={userModalOpen}
        onOk={handleSaveUser}
        onCancel={() => setUserModalOpen(false)}
        okText="Lưu"
        cancelText="Huỷ"
      >
        <Form form={userForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="chatId"
            label="Telegram Chat ID"
            rules={[{ required: true, message: 'Vui lòng nhập Chat ID' }]}
            extra="Người dùng có thể lấy Chat ID bằng cách nhắn /start cho bot hoặc qua @userinfobot"
          >
            <Input disabled={Boolean(editingUser)} placeholder="Ví dụ: 123456789" />
          </Form.Item>

          <Form.Item
            name="name"
            label="Tên gợi nhớ"
            rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
          >
            <Input placeholder="Ví dụ: Duc Quan (Work)" />
          </Form.Item>

          <Form.Item name="status" label="Trạng thái">
            <Select
              options={[
                { value: 'active', label: 'Hoạt động (Active)' },
                { value: 'pending', label: 'Chờ duyệt (Pending)' },
                { value: 'blocked', label: 'Tạm khoá (Blocked)' },
              ]}
            />
          </Form.Item>

          <Form.Item name="dataScope" label="Phạm vi dữ liệu được truy cập">
            <Select
              options={[
                { value: 'full', label: 'Toàn bộ (Tasks + Projects + Knowledge Docs)' },
                { value: 'knowledge_only', label: 'Chỉ Knowledge Docs' },
                { value: 'tasks_only', label: 'Chỉ Tasks & Projects' },
                { value: 'pure_llm', label: 'Chỉ LLM (Không chia sẻ dữ liệu TaskMate)' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="dailyLimit"
            label="Hạn mức tin nhắn / ngày"
            rules={[{ required: true, message: 'Nhập số hạn mức' }]}
          >
            <InputNumber min={1} max={500} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="maxHistoryTurns"
            label="Số lượt nhớ hội thoại (Turns)"
            tooltip="0 = Single-turn không nhớ ngữ cảnh trước; 5 = nhớ 5 câu hỏi gần nhất"
          >
            <InputNumber min={0} max={20} style={{ width: '100%' }} placeholder="Mặc định: 5" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Admin Send Message Modal (Broadcast / Direct) */}
      <Modal
        title={
          <Space>
            <SendOutlined style={{ color: '#4f46e5' }} />
            <span>Gửi tin nhắn Telegram</span>
          </Space>
        }
        open={sendModalOpen}
        onOk={handleSendMessage}
        onCancel={() => !isSending && setSendModalOpen(false)}
        confirmLoading={isSending}
        okText={sendMode === 'broadcast' ? 'Gửi Broadcast' : 'Gửi tin nhắn'}
        cancelText="Đóng"
        width={560}
      >
        <div style={{ marginTop: 16 }}>
          <Form layout="vertical">
            <Form.Item label={<strong>Chế độ gửi</strong>}>
              <Radio.Group
                value={sendMode}
                onChange={(e) => setSendMode(e.target.value)}
                buttonStyle="solid"
              >
                <Radio.Button value="direct">
                  <UserOutlined /> Gửi trực tiếp
                </Radio.Button>
                <Radio.Button value="broadcast">
                  <NotificationOutlined /> Gửi tất cả (Broadcast)
                </Radio.Button>
              </Radio.Group>
            </Form.Item>

            {sendMode === 'direct' ? (
              <Form.Item
                label={<strong>Người nhận (Chat ID)</strong>}
                required
                extra="Chọn từ danh sách Whitelist hoặc tự nhập Chat ID của người nhận"
              >
                <Select
                  showSearch
                  value={targetChatId || undefined}
                  onChange={(v) => setTargetChatId(v || '')}
                  placeholder="Chọn hoặc nhập Chat ID"
                  options={[
                    ...whitelist.map((w) => ({
                      value: w.chatId,
                      label: `${w.name} (${w.chatId}) - ${w.status === 'active' ? 'Hoạt động' : 'Tạm khoá'}`,
                    })),
                    ...(targetChatId && !whitelist.some((w) => w.chatId === targetChatId)
                      ? [{ value: targetChatId, label: `Tuỳ chỉnh: ${targetChatId}` }]
                      : []),
                  ]}
                  onSearch={(v) => {
                    if (v && !whitelist.some((w) => w.chatId === v)) {
                      setTargetChatId(v);
                    }
                  }}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            ) : (
              <Form.Item label={<strong>Phạm vi Broadcast</strong>}>
                <Alert
                  type="info"
                  showIcon
                  message={`Gửi đồng loạt đến ${whitelist.filter((u) => u.status === 'active').length} người dùng đang hoạt động`}
                  description="Tin nhắn sẽ được định dạng Markdown và gửi tuần tự đến từng Chat ID trong danh sách Whitelist có trạng thái Hoạt động."
                />
              </Form.Item>
            )}

            <Form.Item
              label={<strong>Nội dung tin nhắn</strong>}
              required
              extra="Hỗ trợ Markdown: **in đậm**, *nghiêng*, `mã lệnh`, [liên kết](url)..."
            >
              <Input.TextArea
                rows={5}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Nhập nội dung cần gửi cho người dùng..."
              />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </div>
  );
};
