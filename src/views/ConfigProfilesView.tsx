import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tooltip,
  Typography,
  notification,
} from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  SaveOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { PageHeader } from '../components/common/PageHeader';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { AppRoute } from '../types/navigation';
import { generateId } from '../utils/uuid';
import { buildDefaultProfileConfig } from '../services/configProfiles/defaults';
import {
  CONFIG_PROFILE_APP_MARKER,
  CONFIG_PROFILE_SCHEMA_VERSION,
  ConfigProfileEnvelopeSchema,
} from '../validation/configProfileSchemas';
import { getMachineSpecificFields, getSecretFields } from '../services/configProfiles/catalog';
import { getProfiles, saveProfiles } from '../services/configProfiles/importProfile';
import type { ConfigurationProfile, ProfileConfig } from '../services/configProfiles/types';
import { ConfigProfileExportButton } from '../components/settings/ConfigProfileExportButton';

const { Text } = Typography;

export interface ConfigProfilesViewProps {
  db?: TaskPlannerDatabase;
  onNavigate?: (route: AppRoute) => void;
}

const DAY_LABELS: Record<number, string> = {
  1: 'Thứ Hai',
  2: 'Thứ Ba',
  3: 'Thứ Tư',
  4: 'Thứ Năm',
  5: 'Thứ Sáu',
  6: 'Thứ Bảy',
  0: 'Chủ Nhật',
};

/** Sensitive setting keys shown as blank fields with an explicit export-blank hint. */
const SECRET_LABELS: Record<string, string> = {
  github_pat: 'GitHub Personal Access Token',
  github_token: 'GitHub token',
  github_passphrase: 'GitHub passphrase',
  backup_passphrase: 'Passphrase sao lưu',
  jira_api_token: 'Jira API token',
  ninerouter_api_key: '9Router API key',
  image_api_key: 'Image API key',
  knowledge_server_token: 'Knowledge server token',
  mcp_servers: 'MCP servers (có thể chứa secret)',
  ssh_configurations: 'Cấu hình SSH (khóa kết nối)',
  oracle_ai_tool_config_list: 'Cấu hình Oracle AI tool (connection string)',
  oracle_ai_tool_config: 'Cấu hình Oracle (connection string)',
};

/** Portable setting keys exposed as editable fields, grouped by their settings section. */
const SETTING_FIELDS: Record<string, string> = {
  github_owner: 'GitHub owner',
  github_repo: 'GitHub repo',
  github_branch: 'GitHub branch',
  github_auto_sync_enabled: 'Tự động đồng bộ GitHub',
  github_auto_sync_mode: 'Chế độ đồng bộ GitHub',
  github_auto_sync_interval_minutes: 'Chu kỳ đồng bộ (phút)',
  github_auto_sync_daily_time: 'Giờ đồng bộ hằng ngày',
  jira_domain: 'Jira domain',
  jira_email: 'Jira email',
  jira_cors_proxy: 'Jira CORS proxy',
  jira_default_project: 'Jira project mặc định',
  jira_default_issue_type: 'Jira issue type mặc định',
  global_conventions: 'Quy ước AI chung',
  ai_budget_warn_threshold_pct: 'Ngưỡng cảnh báo ngân sách AI (%)',
  ninerouter_endpoint: '9Router endpoint',
  ninerouter_default_model: '9Router model mặc định',
  ninerouter_char_limit: '9Router giới hạn ký tự',
  ninerouter_context_window_tokens: '9Router context window (tokens)',
  image_endpoint: 'Image endpoint',
  image_model: 'Image model',
  graphiti_mcp_enabled: 'Bật Graphiti MCP',
  graphiti_mcp_endpoint: 'Graphiti MCP endpoint',
  knowledge_server_enabled: 'Bật knowledge server',
  knowledge_server_base_url: 'Knowledge server base URL',
};

const SETTING_GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'GitHub', keys: ['github_owner', 'github_repo', 'github_branch', 'github_auto_sync_enabled', 'github_auto_sync_mode', 'github_auto_sync_interval_minutes', 'github_auto_sync_daily_time'] },
  { title: 'Jira', keys: ['jira_domain', 'jira_email', 'jira_cors_proxy', 'jira_default_project', 'jira_default_issue_type'] },
  { title: 'AI toàn cục & Knowledge', keys: ['global_conventions', 'ai_budget_warn_threshold_pct', 'ninerouter_endpoint', 'ninerouter_default_model', 'ninerouter_char_limit', 'ninerouter_context_window_tokens', 'image_endpoint', 'image_model', 'graphiti_mcp_enabled', 'graphiti_mcp_endpoint', 'knowledge_server_enabled', 'knowledge_server_base_url'] },
];

const BOOLEAN_SETTINGS = new Set(['github_auto_sync_enabled', 'graphiti_mcp_enabled', 'knowledge_server_enabled']);
const NUMBER_SETTINGS = new Set([
  'github_auto_sync_interval_minutes',
  'ai_budget_warn_threshold_pct',
  'ninerouter_char_limit',
  'ninerouter_context_window_tokens',
]);
const TEXTAREA_SETTINGS = new Set(['global_conventions']);

function cloneConfig(config: ProfileConfig): ProfileConfig {
  return {
    settings: { ...config.settings },
    capacityRules: config.capacityRules.map((rule) => ({ ...rule })),
    capacityOverrides: config.capacityOverrides.map((override) => ({ ...override })),
    ...(config.ghostDevConfig !== undefined
      ? { ghostDevConfig: config.ghostDevConfig === null ? null : { ...config.ghostDevConfig } }
      : {}),
    ...(config.teamDefaults !== undefined ? { teamDefaults: { ...config.teamDefaults } } : {}),
    secretFields: { ...config.secretFields },
  };
}

function newDraftFromDefaults(): ProfileConfig {
  return cloneConfig(buildDefaultProfileConfig());
}

function fieldValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

const clampInt = (text: string, min: number, max: number, blankValue: number): number => {
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return blankValue;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

/**
 * WR-04: editable numeric values are normalised to the schema bounds before they reach
 * a saved profile. Dates are deliberately left as typed: invalid input must surface as a
 * validation error, never be silently rewritten to today (WR-02 round 2).
 */
function normaliseDraft(config: ProfileConfig): ProfileConfig {
  const settings = { ...config.settings };
  // Secret-like keys belong in secretFields (blank) and can never enter profile.settings.
  for (const key of getSecretFields()) {
    if (key in settings) delete settings[key];
  }
  // Blank numeric input is legal in the draft; normalise it to a schema-valid default.
  for (const key of NUMBER_SETTINGS) {
    if (key in settings && settings[key] === '') {
      settings[key] = key === 'ai_budget_warn_threshold_pct' ? 80 : 0;
    }
  }
  if (typeof settings.ai_budget_warn_threshold_pct === 'number') {
    settings.ai_budget_warn_threshold_pct = clampInt(
      fieldValue(settings.ai_budget_warn_threshold_pct),
      1,
      100,
      80
    );
  }
  const ghostDevConfig = config.ghostDevConfig
    ? {
        ...config.ghostDevConfig,
        concurrencyCap: clampInt(
          fieldValue(config.ghostDevConfig.concurrencyCap),
          1,
          12,
          6
        ),
      }
    : config.ghostDevConfig;
  const teamDefaults = config.teamDefaults
    ? {
        ...config.teamDefaults,
        budgetTokens: clampInt(fieldValue(config.teamDefaults.budgetTokens), 0, Number.MAX_SAFE_INTEGER, 0),
        ...(config.teamDefaults.concurrencyLimit !== undefined
          ? { concurrencyLimit: clampInt(fieldValue(config.teamDefaults.concurrencyLimit), 1, 12, 3) }
          : {}),
        ...(typeof config.teamDefaults.budgetWarnThresholdPct === 'number'
          ? {
              budgetWarnThresholdPct: clampInt(
                fieldValue(config.teamDefaults.budgetWarnThresholdPct),
                1,
                100,
                80
              ),
            }
          : {}),
      }
    : config.teamDefaults;
  return {
    ...config,
    settings,
    capacityRules: config.capacityRules.map((rule) => ({
      ...rule,
      workMinutes: clampInt(fieldValue(rule.workMinutes), 0, 1440, 0),
    })),
    capacityOverrides: config.capacityOverrides.map((override) => ({
      ...override,
      workMinutes: clampInt(fieldValue(override.workMinutes), 0, 1440, 0),
    })),
    ...(ghostDevConfig !== undefined ? { ghostDevConfig } : {}),
    ...(teamDefaults !== undefined ? { teamDefaults } : {}),
  };
}

function envelopeForDraft(name: string, config: ProfileConfig, id: string, now: string) {
  return {
    app: CONFIG_PROFILE_APP_MARKER,
    profileSchemaVersion: CONFIG_PROFILE_SCHEMA_VERSION,
    exportedAt: now,
    profile: { id, name, createdAt: now, updatedAt: now, config },
  };
}

function displayLabel(key: string): string {
  return SETTING_FIELDS[key] ?? SECRET_LABELS[key] ?? key;
}

/**
 * Standalone "Settings for Others" authoring screen.
 *
 * The draft is ALWAYS seeded from buildDefaultProfileConfig() — this view never reads the
 * author's db.settings, localStorage or keyring. Named profiles are persisted through the
 * one-row-array store; secrets stay blank and machine-specific fields carry a review marker.
 * Telegram is deliberately absent (owner-machine-only decision).
 */
export const ConfigProfilesView: React.FC<ConfigProfilesViewProps> = ({
  db = defaultDb,
  onNavigate,
}) => {
  const [profiles, setProfiles] = useState<ConfigurationProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<ProfileConfig>(newDraftFromDefaults);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const secretFields = useMemo(() => getSecretFields(), []);
  const machineSpecificFields = useMemo(() => getMachineSpecificFields(), []);

  useEffect(() => {
    let cancelled = false;
    getProfiles(db)
      .then((rows) => {
        if (cancelled) return;
        setProfiles(rows);
      })
      .catch((error: unknown) => {
        notification.error({
          message: 'Không tải được danh sách profile',
          description: error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định',
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedId) ?? null;

  const resetDraft = () => {
    setSelectedId(null);
    setName('');
    setDraftError(null);
    setDraft(newDraftFromDefaults());
  };

  const handleNew = () => {
    resetDraft();
    notification.info({ message: 'Đã tạo bản soạn mới từ cấu hình mặc định' });
  };

  const handleSelect = (id: string) => {
    const profile = profiles.find((item) => item.id === id);
    if (!profile) return;
    setSelectedId(profile.id);
    setName(profile.name);
    setDraftError(null);
    setDraft(cloneConfig(profile.config));
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      notification.error({ message: 'Vui lòng nhập tên profile' });
      return;
    }
    const now = new Date().toISOString();
    const existing = profiles.find((profile) => profile.id === selectedId);
    const normalised = normaliseDraft(draft);
    const validation = ConfigProfileEnvelopeSchema.safeParse(
      envelopeForDraft(trimmed, normalised, existing?.id ?? 'draft', now)
    );
    if (!validation.success) {
      setDraftError(
        validation.error.issues.map((issue) => `${issue.path.join('.') || 'profile'}: ${issue.message}`).join('; ')
      );
      return;
    }
    setDraftError(null);
    const saved: ConfigurationProfile = {
      id: existing?.id ?? generateId(),
      name: trimmed,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      config: normalised,
    };
    const next = existing
      ? profiles.map((profile) => (profile.id === saved.id ? saved : profile))
      : [...profiles, saved];
    try {
      await saveProfiles(next, db);
      setProfiles(next);
      setSelectedId(saved.id);
      setName(saved.name);
      notification.success({ message: 'Đã lưu profile', description: trimmed });
    } catch (error) {
      notification.error({
        message: 'Lưu profile thất bại',
        description: error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định',
      });
    }
  };

  const handleDelete = () => {
    if (!selectedProfile) return;
    Modal.confirm({
      title: 'Xóa profile này?',
      icon: <ExclamationCircleOutlined />,
      content: `Profile "${selectedProfile.name}" sẽ bị xóa khỏi danh sách.`,
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        const next = profiles.filter((profile) => profile.id !== selectedProfile.id);
        try {
          await saveProfiles(next, db);
          setProfiles(next);
          resetDraft();
          notification.success({ message: 'Đã xóa profile' });
        } catch (error) {
          notification.error({
            message: 'Xóa profile thất bại',
            description: error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định',
          });
        }
      },
    });
  };

  const setSetting = (key: string, value: unknown) => {
    setDraft((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
  };

  const machineWarning = (key: string) => (
    <Tooltip title="Giá trị máy chủ/path được giữ lại trong file export; hãy rà soát sau khi import.">
      <WarningOutlined
        data-machine-specific={key}
        tabIndex={0}
        role="img"
        aria-label={`Cảnh báo giá trị theo máy: ${displayLabel(key)} được giữ lại trong file export; hãy rà soát sau khi import.`}
        style={{ color: '#faad14', marginLeft: 6 }}
      />
    </Tooltip>
  );

  const renderSetting = (key: string) => {
    const label = displayLabel(key);
    const isMachine = machineSpecificFields.includes(key);
    const value = draft.settings[key];
    const control = BOOLEAN_SETTINGS.has(key) ? (
      <Switch
        aria-label={label}
        checked={Boolean(value)}
        onChange={(checked) => setSetting(key, checked)}
      />
    ) : NUMBER_SETTINGS.has(key) ? (
      <InputNumberField
        ariaLabel={label}
        value={fieldValue(value)}
        onChange={(text) => setSetting(key, text === '' ? '' : Number(text))}
      />
    ) : TEXTAREA_SETTINGS.has(key) ? (
      <Input.TextArea
        aria-label={label}
        value={fieldValue(value)}
        rows={4}
        onChange={(event) => setSetting(key, event.target.value)}
      />
    ) : (
      <Input
        aria-label={label}
        value={fieldValue(value)}
        onChange={(event) => setSetting(key, event.target.value)}
      />
    );
    return (
      <div key={key} data-machine-specific-row={isMachine ? key : undefined} style={{ marginBottom: 12 }}>
        <Text strong>{label}</Text>
        {isMachine && machineWarning(key)}
        <div>{control}</div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 24px' }}>
      <PageHeader
        title="Cấu hình cho người khác (Settings for Others)"
        subtitle="Soạn profile mới từ cấu hình mặc định, đặt tên và xuất ra tệp JSON. Không đọc cấu hình hiện tại của bạn."
        extra={
          onNavigate && (
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => onNavigate('settings')}
              aria-label="Quay lại Cài đặt"
            >
              Quay lại Cài đặt
            </Button>
          )
        }
      />

      <Card title="Profile đã lưu" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Select
            aria-label="Chọn profile"
            placeholder="Chọn profile đã lưu"
            style={{ width: '100%', maxWidth: 420 }}
            loading={loading}
            value={selectedId}
            onChange={(id) => handleSelect(id)}
            allowClear
            options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
          />
          <Space wrap>
            <Input
              aria-label="Tên profile"
              placeholder="Tên profile"
              value={name}
              onChange={(event) => setName(event.target.value)}
              style={{ width: 260 }}
            />
            <Button icon={<PlusOutlined />} onClick={handleNew}>
              Mới (từ mặc định)
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
              Lưu profile
            </Button>
            <Button danger icon={<DeleteOutlined />} disabled={!selectedProfile} onClick={handleDelete}>
              Xóa profile
            </Button>
            <ConfigProfileExportButton profile={selectedProfile} />
          </Space>
          {!selectedProfile && (
            <Text type="secondary">Chọn profile để xuất, hoặc soạn profile mới rồi lưu lại.</Text>
          )}
          {draftError && (
            <Alert type="error" showIcon message="Profile chưa hợp lệ" description={draftError} />
          )}
        </Space>
      </Card>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Typography.Text strong>Thông báo & hệ thống</Typography.Text>
        <Card size="small">
          {renderSetting('notification_settings')}
          {renderSetting('system_type_options')}
        </Card>

        {SETTING_GROUPS.map((group) => (
          <Fragment key={group.title}>
            <Typography.Text strong>{group.title}</Typography.Text>
            <Card size="small">{group.keys.map(renderSetting)}</Card>
          </Fragment>
        ))}

        <Typography.Text strong>Công suất làm việc (capacity)</Typography.Text>
        <Card size="small" data-testid="profile-capacity-section">
          {draft.capacityRules.map((rule) => (
            <Space key={rule.dayOfWeek} style={{ marginBottom: 8 }} wrap>
              <Text style={{ width: 100 }}>{DAY_LABELS[rule.dayOfWeek] ?? `Ngày ${rule.dayOfWeek}`}</Text>
              <InputNumberField
                ariaLabel={`Phút làm việc ${DAY_LABELS[rule.dayOfWeek] ?? rule.dayOfWeek}`}
                value={String(rule.workMinutes)}
                onChange={(text) =>
                  setDraft((current) => ({
                    ...current,
                    capacityRules: current.capacityRules.map((item) =>
                      item.dayOfWeek === rule.dayOfWeek
                        ? { ...item, workMinutes: text === '' ? 0 : Number(text) }
                        : item
                    ),
                  }))
                }
              />
              <Text type="secondary">phút</Text>
            </Space>
          ))}
          <div>
            <Text strong>Ngoại lệ theo ngày (YYYY-MM-DD, phút, ghi chú)</Text>
          </div>
          {draft.capacityOverrides.map((override, index) => (
            <Space key={`${override.date}-${index}`} style={{ marginBottom: 8 }} wrap>
              <Input
                aria-label={`Ngày ngoại lệ ${index + 1}`}
                value={override.date}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    capacityOverrides: current.capacityOverrides.map((item, i) =>
                      i === index ? { ...item, date: event.target.value } : item
                    ),
                  }))
                }
                style={{ width: 140 }}
              />
              <InputNumberField
                ariaLabel={`Phút ngoại lệ ${index + 1}`}
                value={String(override.workMinutes)}
                onChange={(text) =>
                  setDraft((current) => ({
                    ...current,
                    capacityOverrides: current.capacityOverrides.map((item, i) =>
                      i === index ? { ...item, workMinutes: text === '' ? 0 : Number(text) } : item
                    ),
                  }))
                }
              />
              <Input
                aria-label={`Ghi chú ngoại lệ ${index + 1}`}
                value={override.note ?? ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    capacityOverrides: current.capacityOverrides.map((item, i) =>
                      i === index ? { ...item, note: event.target.value } : item
                    ),
                  }))
                }
                style={{ width: 200 }}
              />
              <Button
                type="text"
                danger
                aria-label={`Xóa ngoại lệ ${index + 1}`}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    capacityOverrides: current.capacityOverrides.filter((_, i) => i !== index),
                  }))
                }
              >
                Xóa
              </Button>
            </Space>
          ))}
          <Button
            icon={<PlusOutlined />}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                capacityOverrides: [
                  ...current.capacityOverrides,
                  { date: new Date().toISOString().slice(0, 10), workMinutes: 0, note: '' },
                ],
              }))
            }
          >
            Thêm ngoại lệ
          </Button>
        </Card>

        <Typography.Text strong>Ghost Dev config</Typography.Text>
        <Card size="small" data-testid="profile-ghost-dev-section">
          <div style={{ marginBottom: 12 }}>
            <Text strong>Model chính (master)</Text>
            <div>
              <Input
                aria-label="Ghost Dev master model"
                value={draft.ghostDevConfig?.masterModel ?? ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    ghostDevConfig: {
                      masterModel: event.target.value,
                      workerModel: current.ghostDevConfig?.workerModel ?? '',
                      concurrencyCap: current.ghostDevConfig?.concurrencyCap ?? 6,
                      ...(current.ghostDevConfig?.claudePath !== undefined
                        ? { claudePath: current.ghostDevConfig.claudePath }
                        : {}),
                    },
                  }))
                }
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text strong>Model worker</Text>
            <div>
              <Input
                aria-label="Ghost Dev worker model"
                value={draft.ghostDevConfig?.workerModel ?? ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    ghostDevConfig: {
                      masterModel: current.ghostDevConfig?.masterModel ?? '',
                      workerModel: event.target.value,
                      concurrencyCap: current.ghostDevConfig?.concurrencyCap ?? 6,
                      ...(current.ghostDevConfig?.claudePath !== undefined
                        ? { claudePath: current.ghostDevConfig.claudePath }
                        : {}),
                    },
                  }))
                }
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text strong>Giới hạn chạy song song</Text>
            <div>
              <InputNumberField
                ariaLabel="Ghost Dev concurrency cap"
                value={String(draft.ghostDevConfig?.concurrencyCap ?? 6)}
                onChange={(text) =>
                  setDraft((current) => ({
                    ...current,
                    ghostDevConfig: {
                      masterModel: current.ghostDevConfig?.masterModel ?? '',
                      workerModel: current.ghostDevConfig?.workerModel ?? '',
                      concurrencyCap: text === '' ? 0 : Number(text),
                      ...(current.ghostDevConfig?.claudePath !== undefined
                        ? { claudePath: current.ghostDevConfig.claudePath }
                        : {}),
                    },
                  }))
                }
              />
            </div>
          </div>
          <div>
            <Text strong>claudePath</Text>
            {machineWarning('ghostDevConfig.claudePath')}
            <div>
              <Input
                aria-label="Ghost Dev claudePath"
                data-machine-specific="ghostDevConfig.claudePath"
                value={draft.ghostDevConfig?.claudePath ?? ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    ghostDevConfig: {
                      masterModel: current.ghostDevConfig?.masterModel ?? '',
                      workerModel: current.ghostDevConfig?.workerModel ?? '',
                      concurrencyCap: current.ghostDevConfig?.concurrencyCap ?? 6,
                      claudePath: event.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>
        </Card>

        <Typography.Text strong>Mẫu defaults cho đội AI (AI-team template)</Typography.Text>
        <Card size="small" data-testid="profile-ai-team-section">
          <div style={{ marginBottom: 12 }}>
            <Text strong>Token budget mỗi team</Text>
            <div>
              <InputNumberField
                ariaLabel="Team budget tokens"
                value={String(draft.teamDefaults?.budgetTokens ?? 0)}
                onChange={(text) =>
                  setDraft((current) => ({
                    ...current,
                    teamDefaults: {
                      ...current.teamDefaults,
                      budgetTokens: text === '' ? 0 : Number(text),
                    },
                  }))
                }
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text strong>Giới hạn chạy song song của team</Text>
            <div>
              <InputNumberField
                ariaLabel="Team concurrency limit"
                value={fieldValue(draft.teamDefaults?.concurrencyLimit)}
                onChange={(text) =>
                  setDraft((current) => ({
                    ...current,
                    teamDefaults: {
                      ...current.teamDefaults,
                      budgetTokens: current.teamDefaults?.budgetTokens ?? 0,
                      ...(text === '' ? {} : { concurrencyLimit: Number(text) }),
                    },
                  }))
                }
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text strong>Ngưỡng cảnh báo ngân sách team (để trống = kế thừa global)</Text>
            <div>
              <Select
                aria-label="Team budget warn threshold"
                style={{ width: 220 }}
                value={draft.teamDefaults?.budgetWarnThresholdPct ?? 'inherit'}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    teamDefaults: {
                      ...current.teamDefaults,
                      budgetTokens: current.teamDefaults?.budgetTokens ?? 0,
                      budgetWarnThresholdPct: value === 'inherit' ? null : Number(value),
                    },
                  }))
                }
                options={[
                  { value: 'inherit', label: 'Kế thừa global' },
                  ...[50, 60, 70, 80, 90].map((pct) => ({ value: pct, label: `${pct}%` })),
                ]}
              />
            </div>
          </div>
          {(
            [
              ['autoSplitEnabled', 'Tự động chia công việc'],
              ['autoApproveMutations', 'Tự động duyệt thay đổi'],
              ['mcpEnabled', 'Bật MCP'],
              ['sshFsToolsEnabled', 'Bật công cụ SSH FS'],
              ['oracleToolsEnabled', 'Bật công cụ Oracle'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <Text strong>{label}</Text>{' '}
              <Switch
                aria-label={label}
                checked={Boolean(draft.teamDefaults?.[key])}
                onChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    teamDefaults: {
                      ...current.teamDefaults,
                      budgetTokens: current.teamDefaults?.budgetTokens ?? 0,
                      [key]: checked,
                    },
                  }))
                }
              />
            </div>
          ))}
        </Card>

        <Typography.Text strong>Secrets (sẽ để trống khi xuất)</Typography.Text>
        <Card size="small" data-testid="profile-secrets-section">
          <Alert
            type="info"
            showIcon
            message="Mọi trường secret đều để trống và sẽ được ghi là '' trong tệp export. Người nhận cần nhập lại sau khi import."
            style={{ marginBottom: 12 }}
          />
          {secretFields.map((key) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <Text strong>{displayLabel(key)}</Text>
              <div>
                <Input
                  aria-label={displayLabel(key)}
                  data-secret-field={key}
                  placeholder="Sẽ để trống khi export"
                  value=""
                  readOnly
                />
              </div>
            </div>
          ))}
        </Card>
      </Space>
    </div>
  );
};

/** Numeric input kept as a small helper so every numeric profile field stays controlled. */
function InputNumberField({
  ariaLabel,
  value,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  onChange: (text: string) => void;
}): React.ReactElement {
  return (
    <Input
      aria-label={ariaLabel}
      type="number"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{ width: 180 }}
    />
  );
}
