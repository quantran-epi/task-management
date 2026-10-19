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
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  saveTelegramSettings,
  upsertWhitelistUser,
  deleteWhitelistUser,
} from '../services/telegram/telegramSettingsService';
import { sendTelegramDirectMessage } from '../services/telegram/telegramHeadlessWorker';
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
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Whitelist Modal State
  const [userModalOpen, setUserModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<TelegramWhitelistUser | null>(null);
  const [userForm] = Form.useForm();

  // Search/Filter state
  const [logSearch, setLogSearch] = useState<string>('');
  const [logChatFilter, setLogChatFilter] = useState<string>('');

  // Live queries from Dexie
  const settingsRecord = useLiveQuery(() => db.telegramSettings.get('default'));
  const whitelist = useLiveQuery(() => db.telegramWhitelist.toArray(), []) || [];
  const logs =
    useLiveQuery(
      () => db.telegramSessionLogs.orderBy('createdAt').reverse().limit(100).toArray(),
      []
    ) || [];

  // Sync settings when loaded
  useEffect(() => {
    if (settingsRecord) {
      setBotToken(settingsRecord.botToken || '');
      setAutoStart(Boolean(settingsRecord.autoStartOnLaunch));
      setDefaultScope(settingsRecord.defaultScope || 'full');
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
      await upsertWhitelistUser({
        chatId: values.chatId.trim(),
        name: values.name.trim(),
        status: values.status,
        dataScope: values.dataScope,
        dailyLimit: values.dailyLimit,
      });

      // Send telegram notification to user on approval/activation
      if (values.status === 'active' && botToken.trim()) {
        try {
          const notifyMsg = `🎉 **Tài khoản của bạn đã được phê duyệt!**\n\nXin chào ${values.name.trim()}, quản trị viên đã kích hoạt quyền sử dụng TaskMate AI Bot cho bạn.\n\n📊 **Hạn mức:** ${values.dailyLimit} tin nhắn/ngày\n🔍 **Phạm vi dữ liệu:** \`${values.dataScope}\`\n\nBạn có thể bắt đầu đặt câu hỏi ngay bây giờ!`;
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
    });
    setUserModalOpen(true);
  };

  const handleDeleteUser = async (chatId: string) => {
    await deleteWhitelistUser(chatId);
    message.success('Đã xoá người dùng khỏi Whitelist');
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

  // Pending unrecognized users from logs who aren't whitelisted
  const pendingUsers = useMemo(() => {
    const whitelistedSet = new Set(whitelist.map((w) => w.chatId));
    const map = new Map<string, { chatId: string; name: string | undefined; lastSeen: string; message: string }>();

    for (const log of logs) {
      if (!whitelistedSet.has(log.chatId) && !map.has(log.chatId)) {
        map.set(log.chatId, {
          chatId: log.chatId,
          name: log.userName,
          lastSeen: log.createdAt,
          message: log.userMessage,
        });
      }
    }
    return Array.from(map.values());
  }, [logs, whitelist]);

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

          <Space size="large" align="center">
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
                            <Text
                              copyable
                              style={{ fontSize: 12, color: '#4f46e5', cursor: 'pointer' }}
                              onClick={() => setLogChatFilter(r.chatId)}
                            >
                              {r.chatId}
                            </Text>
                          </div>
                        ),
                      },
                      {
                        title: 'Nội dung hỏi & Trả lời',
                        key: 'dialog',
                        render: (_, r: TelegramSessionLog) => (
                          <div style={{ maxWidth: 500 }}>
                            <div style={{ marginBottom: 6 }}>
                              <Tag color="cyan">User</Tag>
                              <Text>{r.userMessage}</Text>
                            </div>
                            <div
                              style={{
                                background: 'rgba(0,0,0,0.02)',
                                padding: '6px 10px',
                                borderRadius: 6,
                                fontSize: 13,
                              }}
                            >
                              <Tag color="purple">AI</Tag>
                              <Text style={{ whiteSpace: 'pre-wrap' }}>{r.aiResponse}</Text>
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
                <span>
                  <SafetyCertificateOutlined /> Whitelist & Phân quyền ({whitelist.length})
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
                        });
                        setUserModalOpen(true);
                      }}
                    >
                      Thêm người dùng
                    </Button>
                  </div>

                  {pendingUsers.length > 0 && (
                    <Alert
                      style={{ marginBottom: 20 }}
                      type="info"
                      showIcon
                      message={`Hàng chờ phê duyệt (${pendingUsers.length} người gửi lạ)`}
                      description={
                        <div style={{ marginTop: 8 }}>
                          {pendingUsers.map((p) => (
                            <div
                              key={p.chatId}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '4px 0',
                                borderBottom: '1px dashed #e2e8f0',
                              }}
                            >
                              <span>
                                <strong>{p.name || 'User'}</strong> (Chat ID: <code>{p.chatId}</code>) — tin nhắn gần nhất: "{p.message}"
                              </span>
                              <Button
                                size="small"
                                type="primary"
                                onClick={() => {
                                  setEditingUser(null);
                                  userForm.setFieldsValue({
                                    chatId: p.chatId,
                                    name: p.name || `User_${p.chatId}`,
                                    status: 'active',
                                    dataScope: defaultScope,
                                    dailyLimit: 30,
                                  });
                                  setUserModalOpen(true);
                                }}
                              >
                                Phê duyệt
                              </Button>
                            </div>
                          ))}
                        </div>
                      }
                    />
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
                        render: (st: string) => (
                          <Tag color={st === 'active' ? 'success' : 'error'}>
                            {st === 'active' ? 'Hoạt động' : 'Tạm khoá'}
                          </Tag>
                        ),
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
                            </div>
                          );
                        },
                      },
                      {
                        title: 'Thao tác',
                        key: 'actions',
                        render: (_, r: TelegramWhitelistUser) => (
                          <Space>
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
        </Form>
      </Modal>
    </div>
  );
};
