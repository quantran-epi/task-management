import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, Button, Space, Typography, Alert, Tag, List, Popconfirm, useAntdToken, useMessage, FormItem, InputPassword, ListItem, useForm } from '../ui';
import { DatabaseOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, SaveOutlined, PlusOutlined, DeleteOutlined, StarOutlined, EditOutlined } from '../ui/icon';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getSshConfigs } from '../../services/sshService';
import type { SshConfig } from '../../types/ssh';
import {
  getOracleConnectionProfiles,
  saveOracleConnectionProfiles,
  testOracleConnection,
  DEFAULT_ORACLE_CONFIG,
} from '../../services/ai/oracleSqlclService';
import type { OracleConnectionProfile } from '../../types/oracleSqlcl';

const { Paragraph, Text } = Typography;

export interface OracleProfileManagerProps {
  db?: TaskPlannerDatabase | undefined;
  onConfigChange?: (() => void) | undefined;
}

type ProfileFormValues = Pick<
  OracleConnectionProfile,
  'name' | 'environment' | 'sshConfigId' | 'connectionString' | 'sqlclPath' | 'envVars' | 'maxRows'
>;

/**
 * Shared profile-management surface used by both the AI chat toolbox modal and the
 * Settings card. Owns one invariant: a non-empty list always has exactly one active
 * profile, and deleting the active profile reassigns active to a remaining one.
 *
 * Security: connection strings never appear in plaintext (InputPassword) and are
 * redacted from every displayed error message (T-45-06/T-45-07).
 */
export const OracleProfileManager: React.FC<OracleProfileManagerProps> = ({
  db = defaultDb,
  onConfigChange,
}) => {
  const appMessage = useMessage();
  const [form] = useForm<ProfileFormValues>();
  const [sshConfigs, setSshConfigs] = useState<SshConfig[]>([]);
  const [profiles, setProfiles] = useState<OracleConnectionProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<OracleConnectionProfile | 'new' | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const secrets = useMemo(
    () => profiles.map((p) => p.connectionString).filter((s) => Boolean(s)),
    [profiles]
  );
  /** Strip any stored connection string out of a message before it reaches the UI. */
  const redact = (text: string): string =>
    secrets.reduce((acc, secret) => (secret ? acc.split(secret).join('***') : acc), text);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sshs, loaded] = await Promise.all([
        getSshConfigs(db),
        getOracleConnectionProfiles(db),
      ]);
      setSshConfigs(sshs);
      setProfiles(loaded);
    } catch (err: any) {
      appMessage.error(`Không thể tải cấu hình Oracle: ${redact(err?.message || 'Lỗi không xác định')}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [db]);

  const persist = async (next: OracleConnectionProfile[]) => {
    await saveOracleConnectionProfiles(next, db);
    setProfiles(next);
    onConfigChange?.();
  };

  const openEdit = (profile: OracleConnectionProfile | 'new') => {
    setTestResult(null);
    setEditing(profile);
    if (profile === 'new') {
      form.setFieldsValue({
        name: '',
        environment: '',
        ...DEFAULT_ORACLE_CONFIG,
      } as ProfileFormValues);
    } else {
      form.setFieldsValue({
        name: profile.name,
        environment: profile.environment,
        sshConfigId: profile.sshConfigId,
        connectionString: profile.connectionString,
        sqlclPath: profile.sqlclPath,
        envVars: profile.envVars,
        maxRows: profile.maxRows,
      } as ProfileFormValues);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const values = await form.validateFields();
      const next = [...profiles];
      if (editing === 'new') {
        next.push({
          ...DEFAULT_ORACLE_CONFIG,
          ...values,
          id: crypto.randomUUID(),
          isActive: next.length === 0,
        });
      } else if (editing) {
        const idx = next.findIndex((p) => p.id === editing.id);
        if (idx >= 0) {
          // Preserve id, isActive and test metadata on edit.
          next[idx] = { ...editing, ...values };
        }
      }
      await persist(next);
      setEditing(null);
      appMessage.success('Đã lưu kết nối Oracle.');
    } catch (err: any) {
      if (err?.errorFields) return;
      appMessage.error(`Lưu thất bại: ${redact(err?.message || 'Lỗi không xác định')}`);
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await persist(profiles.map((p) => ({ ...p, isActive: p.id === id })));
    } catch (err: any) {
      appMessage.error(`Không thể đặt mặc định: ${redact(err?.message || 'Lỗi không xác định')}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const target = profiles.find((p) => p.id === id);
      const next = profiles.filter((p) => p.id !== id);
      if (target?.isActive && next.length > 0 && !next.some((p) => p.isActive)) {
        next[0] = { ...next[0]!, isActive: true };
      }
      await persist(next);
      appMessage.success('Đã xóa kết nối Oracle.');
    } catch (err: any) {
      appMessage.error(`Không thể xóa: ${redact(err?.message || 'Lỗi không xác định')}`);
    }
  };

  const handleTest = async (profile: OracleConnectionProfile) => {
    setTestingId(profile.id);
    setTestResult(null);
    try {
      const res = await testOracleConnection(profile, db);
      const safeMessage = redact(res.message);
      setTestResult({ ok: res.ok, message: safeMessage });
      if (res.ok) {
        // Preserve test metadata on the profile without changing its id/active flag.
        const next = profiles.map((p) =>
          p.id === profile.id
            ? { ...p, lastTestedAt: new Date().toISOString(), lastTestStatus: safeMessage }
            : p
        );
        await persist(next);
        appMessage.success(safeMessage);
      } else {
        appMessage.error(safeMessage);
      }
    } catch (err: any) {
      const safeMessage = redact(err?.message || 'Kiểm tra thất bại');
      setTestResult({ ok: false, message: safeMessage });
      appMessage.error(safeMessage);
    } finally {
      setTestingId(null);
    }
  };

  const profileForm = (
    <Form form={form} layout="vertical">
      <FormItem
        name="name"
        label="Tên kết nối"
        rules={[{ required: true, message: 'Vui lòng nhập tên kết nối' }]}
        tooltip="Tên để AI chọn kết nối này qua oracle_query / oracle_describe."
      >
        <Input placeholder="vd: Oracle SIT" />
      </FormItem>

      <FormItem
        name="environment"
        label="Môi trường"
        rules={[{ required: true, message: 'Vui lòng nhập môi trường' }]}
        tooltip="Nhãn môi trường (SIT, UAT, ...). Chỉ là nhãn — không có cổng xác nhận đặc biệt."
      >
        <Input placeholder="vd: SIT, UAT" />
      </FormItem>

      <FormItem
        name="sshConfigId"
        label="Máy chủ SSH Remote"
        rules={[{ required: true, message: 'Vui lòng chọn 1 máy chủ SSH' }]}
      >
        <Select
          placeholder="Chọn cấu hình SSH..."
          showSearch
          optionFilterProp="children"
          options={sshConfigs.map((s) => ({
            value: s.id,
            label: `${s.name} (${s.username}@${s.host}:${s.port})`,
          }))}
          notFoundContent="Chưa có cấu hình SSH nào. Thêm trong Cài đặt > SSH."
        />
      </FormItem>

      <FormItem
        name="connectionString"
        label="Chuỗi kết nối Oracle (Connect String)"
        rules={[{ required: true, message: 'Vui lòng nhập chuỗi kết nối Oracle' }]}
        extra="Chuỗi này chứa mật khẩu; nó được ẩn trong giao diện và loại khỏi bản sao lưu plaintext."
      >
        <InputPassword
          placeholder="user/password@host:1521/service hoặc user/pass@TNS_ALIAS"
          visibilityToggle
          autoComplete="off"
        />
      </FormItem>

      <Space orientation="horizontal" size="middle" style={{ display: 'flex', width: '100%' }}>
        <FormItem name="sqlclPath" label="Lệnh gọi SQLcl" style={{ flex: 1 }}>
          <Input placeholder="sql" />
        </FormItem>
        <FormItem name="maxRows" label="Số dòng tối đa" style={{ width: 140 }}>
          <InputNumber min={10} max={1000} style={{ width: '100%' }} />
        </FormItem>
      </Space>

      <FormItem name="envVars" label="Biến môi trường Remote (tùy chọn)">
        <Input placeholder="export TNS_ADMIN=/opt/oracle/network/admin" />
      </FormItem>
    </Form>
  );

  return (
    <div>
      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
        Mỗi kết nối là một profile riêng (SIT/UAT/...). AI chọn profile theo tên, môi trường hoặc id;
        khi không chỉ định thì dùng profile đang hoạt động. Mọi truy vấn đều bị ép chế độ <b>CHỈ ĐỌC</b>.
      </Paragraph>

      <List
        loading={loading}
        dataSource={profiles}
        locale={{ emptyText: 'Chưa có kết nối Oracle nào. Thêm một kết nối để bắt đầu.' }}
        split
        renderItem={(profile) => (
          <ListItem
            actions={[
              <Button
                key="active"
                size="small"
                type={profile.isActive ? 'default' : 'link'}
                icon={<StarOutlined />}
                disabled={profile.isActive}
                onClick={() => void handleSetActive(profile.id)}
                title="Đặt làm kết nối mặc định"
              >
                {profile.isActive ? 'Đang dùng' : 'Dùng'}
              </Button>,
              <Button
                key="edit"
                size="small"
                type="link"
                icon={<EditOutlined />}
                onClick={() => openEdit(profile)}
              >
                Sửa
              </Button>,
              <Button
                key="test"
                size="small"
                type="link"
                icon={<SyncOutlined spin={testingId === profile.id} />}
                loading={testingId === profile.id}
                onClick={() => void handleTest(profile)}
              >
                Test
              </Button>,
              <Popconfirm
                key="delete"
                title="Xóa kết nối này?"
                description="Kết nối sẽ bị xóa khỏi danh sách profile."
                okText="Xóa"
                cancelText="Hủy"
                onConfirm={() => void handleDelete(profile.id)}
              >
                <Button size="small" type="link" danger icon={<DeleteOutlined />}>
                  Xóa
                </Button>
              </Popconfirm>,
            ]}
          >
            <ListItem.Meta
              title={
                <Space size={4} wrap>
                  <Text strong>{profile.name}</Text>
                  <Tag color={profile.isActive ? 'green' : 'default'}>{profile.environment}</Tag>
                  {profile.isActive && <Tag color="blue">Mặc định</Tag>}
                </Space>
              }
              description={
                <Space size={8} wrap>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    id: {profile.id}
                  </Text>
                  {profile.lastTestStatus && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Test: {redact(profile.lastTestStatus)}
                    </Text>
                  )}
                </Space>
              }
            />
          </ListItem>
        )}
      />

      <Button
        type="dashed"
        block
        icon={<PlusOutlined />}
        style={{ marginTop: 8 }}
        onClick={() => openEdit('new')}
      >
        Thêm kết nối Oracle
      </Button>

      {testResult && (
        <Alert
          style={{ marginTop: 12 }}
          type={testResult.ok ? 'success' : 'error'}
          showIcon
          icon={testResult.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
          message={testResult.ok ? 'Kết nối thành công' : 'Lỗi kết nối'}
          description={testResult.message}
        />
      )}

      <Modal
        open={editing !== null}
        onCancel={() => setEditing(null)}
        width={520}
        title={editing === 'new' ? 'Thêm kết nối Oracle' : 'Sửa kết nối Oracle'}
        footer={[
          <Button key="cancel" onClick={() => setEditing(null)}>
            Hủy
          </Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />} onClick={() => void handleSaveProfile()}>
            Lưu
          </Button>,
        ]}
        destroyOnClose
      >
        {profileForm}
      </Modal>
    </div>
  );
};

export interface OracleSqlclSettingsModalProps {
  open: boolean;
  onClose: () => void;
  db?: TaskPlannerDatabase;
  onConfigChange?: () => void;
}

export const OracleSqlclSettingsModal: React.FC<OracleSqlclSettingsModalProps> = ({
  open,
  onClose,
  db = defaultDb,
  onConfigChange,
}) => {
  const { token } = useAntdToken();

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={680}
      title={
        <Space>
          <DatabaseOutlined style={{ color: token.colorPrimary }} />
          <span>Quản lý kết nối Oracle SQLcl (AI Remote Tool)</span>
        </Space>
      }
      footer={[
        <Button key="close" onClick={onClose}>
          Đóng
        </Button>,
      ]}
      destroyOnClose
    >
      {open && <OracleProfileManager db={db} onConfigChange={onConfigChange} />}
    </Modal>
  );
};
