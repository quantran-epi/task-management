import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Input, Select, Space, Switch, Tabs, Tooltip, Typography, useAntdToken, useNotification, useTaskMateModal, TextArea } from '../components/ui';
import { ArrowLeftOutlined, CopyOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, SaveOutlined, WarningOutlined } from '../components/ui/icon';
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
import {
  getDeclaredProfileMachineFields,
  getDeclaredProfileSecretFields,
  getMachineSpecificFields,
  getSecretFields,
} from '../services/configProfiles/catalog';
import { buildProfileExportPayload } from '../services/configProfiles/exportProfile';
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
  notification_settings: 'Cài đặt thông báo',
  system_type_options: 'Tùy chọn loại hệ thống',
};

const JSON_SETTINGS: Record<string, 'object' | 'array'> = {
  notification_settings: 'object',
  system_type_options: 'array',
};
const STRUCTURED_ERROR = 'JSON không hợp lệ hoặc sai kiểu (cần object/array).';
const STRUCTURED_SAVE_ERROR =
  'Cài đặt thông báo / Tùy chọn loại hệ thống: JSON chưa hợp lệ. Sửa trước khi lưu.';

function parseStructuredValue(key: string, text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  const kind = JSON_SETTINGS[key] ?? 'object';
  const valid =
    kind === 'array'
      ? Array.isArray(parsed)
      : parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  if (!valid) throw new Error(STRUCTURED_ERROR);
  return parsed;
}

function structuredTextFor(config: ProfileConfig): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of Object.keys(JSON_SETTINGS)) {
    const fallback = JSON_SETTINGS[key] === 'array' ? [] : {};
    result[key] = JSON.stringify(config.settings[key] ?? fallback, null, 2);
  }
  return result;
}

/** Dùng chung cho lưu và preview: structured text phải thành object/array trước khi clamp. */
function normalisedDraftFor(
  config: ProfileConfig,
  structuredText: Record<string, string>
): { normalised: ProfileConfig | null; error: string | null } {
  const normalised = normaliseDraft(config);
  for (const key of Object.keys(JSON_SETTINGS)) {
    try {
      normalised.settings[key] = parseStructuredValue(key, structuredText[key] ?? '');
    } catch {
      return { normalised: null, error: STRUCTURED_SAVE_ERROR };
    }
  }
  return { normalised, error: null };
}

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
  const { token } = useAntdToken();
  const notification = useNotification();
  const { modal, contextHolder } = useTaskMateModal();
  const [profiles, setProfiles] = useState<ConfigurationProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [search, setSearch] = useState('');
  const [reviewChecks, setReviewChecks] = useState({ machine: false, secret: false, preview: false });
  const [draft, setDraft] = useState<ProfileConfig>(newDraftFromDefaults);
  const [structuredText, setStructuredText] = useState<Record<string, string>>(() =>
    structuredTextFor(draft)
  );
  const [structuredErrors, setStructuredErrors] = useState<Record<string, string>>({});
  const [draftError, setDraftError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
  const visibleProfiles = profiles.filter((profile) => {
    const query = search.trim().toLowerCase();
    return (
      !query ||
      String(profile.name ?? '').toLowerCase().includes(query) ||
      String(profile.recipient ?? '').toLowerCase().includes(query)
    );
  });

  const resetDraft = () => {
    setSelectedId(null);
    setName('');
    setRecipient('');
    setDraftError(null);
    const fresh = newDraftFromDefaults();
    setDraft(fresh);
    setStructuredText(structuredTextFor(fresh));
    setStructuredErrors({});
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
    setRecipient(profile.recipient ?? '');
    setDraftError(null);
    const config = cloneConfig(profile.config);
    setDraft(config);
    setStructuredText(structuredTextFor(config));
    setStructuredErrors({});
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      notification.error({ message: 'Vui lòng nhập tên profile' });
      return;
    }
    // Structured fields must never reach the envelope as strings (T-quick-01).
    if (Object.values(structuredErrors).some(Boolean)) {
      setDraftError(STRUCTURED_SAVE_ERROR);
      return;
    }
    const { normalised, error } = normalisedDraftFor(draft, structuredText);
    if (!normalised || error) {
      setDraftError(error ?? STRUCTURED_SAVE_ERROR);
      return;
    }
    const now = new Date().toISOString();
    const existing = profiles.find((profile) => profile.id === selectedId);
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
      ...(recipient.trim() ? { recipient: recipient.trim() } : {}),
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
    modal.confirm({
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

  const handleDuplicate = async () => {
    if (!selectedProfile) return;
    const now = new Date().toISOString();
    const copy: ConfigurationProfile = {
      id: generateId(),
      name: `${selectedProfile.name} (copy)`,
      ...(selectedProfile.recipient ? { recipient: selectedProfile.recipient } : {}),
      createdAt: now,
      updatedAt: now,
      config: cloneConfig(selectedProfile.config),
    };
    const next = [...profiles, copy];
    try {
      await saveProfiles(next, db);
      setProfiles(next);
      setSelectedId(copy.id);
      setName(copy.name);
      setRecipient(copy.recipient ?? '');
      setDraft(cloneConfig(copy.config));
      setStructuredText(structuredTextFor(copy.config));
      setStructuredErrors({});
      setDraftError(null);
      notification.success({ message: 'Đã nhân bản profile', description: copy.name });
    } catch (error) {
      notification.error({
        message: 'Nhân bản thất bại',
        description: error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định',
      });
    }
  };

  const machineFieldValue = (key: string): unknown =>
    key === 'ghostDevConfig.claudePath'
      ? draft.ghostDevConfig?.claudePath
      : draft.settings[key];
  const filledMachineFields = getDeclaredProfileMachineFields({
    settings: draft.settings,
    ghostDevConfig: draft.ghostDevConfig ? { ...draft.ghostDevConfig } : undefined,
  }).filter((key) =>
    Boolean(String(machineFieldValue(key) ?? '').trim())
  );
  const declaredSecrets = getDeclaredProfileSecretFields(draft.secretFields);

  const { normalised: previewConfig } = normalisedDraftFor(draft, structuredText);
  const previewProfile: ConfigurationProfile = {
    id: selectedId ?? 'draft',
    name,
    createdAt: selectedProfile?.createdAt ?? new Date().toISOString(),
    updatedAt: selectedProfile?.updatedAt ?? new Date().toISOString(),
    config: previewConfig ?? normaliseDraft(draft),
  };
  const previewJson = JSON.stringify(
    buildProfileExportPayload(previewProfile, () => previewProfile.updatedAt),
    null,
    2
  );

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
    if (key in JSON_SETTINGS) {
      const error = structuredErrors[key];
      return (
        <div key={key}>
          <Text strong>{label}</Text>
          <TextArea
            aria-label={label}
            rows={6}
            value={structuredText[key] ?? ''}
            onChange={(event) => {
              const text = event.target.value;
              setStructuredText((current) => ({ ...current, [key]: text }));
              try {
                setSetting(key, parseStructuredValue(key, text));
                setStructuredErrors((current) => ({ ...current, [key]: '' }));
              } catch {
                setStructuredErrors((current) => ({ ...current, [key]: STRUCTURED_ERROR }));
              }
            }}
          />
          {error && <Text type="danger" role="alert">{error}</Text>}
        </div>
      );
    }
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
      <TextArea
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
    <div
      style={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: 0,
      }}
    >
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', boxSizing: 'border-box', padding: '24px' }}>
        {contextHolder}
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '220px minmax(0, 1fr) 296px',
            minHeight: 620,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusLG,
            overflow: 'hidden',
          }}
        >
      <div
        style={{
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          padding: 12,
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <Text strong style={{ fontSize: token.fontSizeSM, textTransform: 'uppercase' }}>
            Profile đã lưu
          </Text>
          <Space size={4}>
            <Tooltip title="Tạo profile mới từ cấu hình mặc định">
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                aria-label="Mới (từ mặc định)"
                onClick={handleNew}
              />
            </Tooltip>
            <Tooltip title="Nhân bản profile đang chọn">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                aria-label="Nhân bản profile"
                disabled={!selectedProfile}
                onClick={handleDuplicate}
              />
            </Tooltip>
          </Space>
        </div>
        <Input
          aria-label="Tìm profile"
          data-testid="profile-search"
          placeholder="Tìm profile"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ marginBottom: 8 }}
        />
        {visibleProfiles.length === 0 && !loading ? (
          <Text type="secondary" style={{ display: 'block', padding: '12px 8px', fontSize: token.fontSizeSM }}>
            {profiles.length === 0 ? 'Chưa có profile nào. Bấm + để tạo.' : 'Không có profile khớp.'}
          </Text>
        ) : (
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {visibleProfiles.map((profile) => {
              const active = selectedId === profile.id;
              return (
                <div
                  key={profile.id}
                  data-testid={`profile-list-item-${profile.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelect(profile.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSelect(profile.id);
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    padding: '8px 10px',
                    marginBottom: 2,
                    borderRadius: token.borderRadius,
                    borderLeft: `2px solid ${active ? token.colorPrimary : 'transparent'}`,
                    background: active ? token.colorFillSecondary : 'transparent',
                    fontSize: token.fontSize,
                  }}
                >
                  <Text style={{ fontWeight: active ? 600 : 400 }}>{profile.name}</Text>
                  <Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
                    {`${profile.recipient ?? 'Chưa rõ người nhận'} · ${profile.updatedAt.slice(0, 10)}`}
                  </Text>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, padding: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 'var(--gap-12)',
            marginBottom: 12,
          }}
        >
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Tên profile</Text>
            <Input
              aria-label="Tên profile"
              placeholder="Tên profile"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Người nhận</Text>
            <Input
              aria-label="Người nhận"
              placeholder="Người nhận"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              Chỉ là metadata — không xuất vào file JSON
            </Text>
          </div>
        </div>
        {draftError && (
          <Alert type="error" showIcon message="Profile chưa hợp lệ" description={draftError} style={{ marginBottom: 12 }} />
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Tabs
          defaultActiveKey="co-ban"
          items={[
          {
            key: 'co-ban',
            label: 'Cơ bản',
            forceRender: true,
            children: (
              <Card size="small">
                {renderSetting('notification_settings')}
                {renderSetting('system_type_options')}
                {SETTING_GROUPS.slice(0, 2).flatMap((group) => group.keys.map(renderSetting))}
              </Card>
            ),
          },
          {
            key: 'ket-noi',
            label: 'Kết nối',
            forceRender: true,
            children: (
              <Card size="small">
                {SETTING_GROUPS.slice(2).flatMap((group) => group.keys.map(renderSetting))}
              </Card>
            ),
          },
          {
            key: 'cong-suat',
            label: 'Công suất',
            forceRender: true,
            children: (
              <Card size="small" data-testid="profile-capacity-section">
          <Text strong>Công suất làm việc (capacity)</Text>
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
            ),
          },
          {
            key: 'ai-team',
            label: 'AI & Team',
            forceRender: true,
            children: (
              <>
              <Card size="small" data-testid="profile-ai-team-section">
              <Text strong>Mẫu defaults cho đội AI (AI-team template)</Text>
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
              </>
            ),
          },
        ]}
        />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--gap-8)',
            flexWrap: 'wrap',
            paddingTop: 12,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Button danger icon={<DeleteOutlined />} disabled={!selectedProfile} onClick={handleDelete}>
            Xóa profile
          </Button>
          <Button icon={<CopyOutlined />} disabled={!selectedProfile} onClick={handleDuplicate}>
            Nhân bản profile
          </Button>
          <ConfigProfileExportButton profile={selectedProfile} />
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
            Lưu profile
          </Button>
        </div>
      </div>

      <div
        style={{
          borderLeft: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorFillQuaternary,
          padding: 16,
          minWidth: 0,
          overflowY: 'auto',
        }}
      >
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          Rà soát trước khi xuất
        </Text>
        {filledMachineFields.length > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={`Đã đổi ${filledMachineFields.length} giá trị theo máy. Người nhận sẽ cần tự chỉnh lại sau import.`}
          />
        )}
        <Checkbox
          data-testid="review-check-machine"
          checked={reviewChecks.machine}
          aria-label="Đã rà soát giá trị theo máy"
          onChange={(event) => setReviewChecks((current) => ({ ...current, machine: event.target.checked }))}
        >
          Đã rà soát giá trị theo máy{filledMachineFields.length > 0 ? ` (${filledMachineFields.length})` : ''}
        </Checkbox>
        <Checkbox
          data-testid="review-check-secret"
          checked={reviewChecks.secret}
          aria-label="Đã rà soát secret để trống"
          onChange={(event) => setReviewChecks((current) => ({ ...current, secret: event.target.checked }))}
        >
          Secret để trống ({declaredSecrets.length})
        </Checkbox>
        <Checkbox
          data-testid="review-check-preview"
          checked={reviewChecks.preview}
          aria-label="Đã xem trước JSON"
          onChange={(event) => setReviewChecks((current) => ({ ...current, preview: event.target.checked }))}
        >
          Đã xem trước nội dung JSON
        </Checkbox>
        <Text type="secondary" style={{ display: 'block', margin: '12px 0 4px' }}>
          Bản xem trước đang soạn — checkbox chỉ là nhắc nhở, không chặn Xuất.
        </Text>
        <pre
          data-testid="profile-export-preview"
          style={{
            margin: 0,
            padding: 12,
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadius,
            fontSize: token.fontSizeSM,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {previewJson}
        </pre>
      </div>
        </div>
      </div>
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
