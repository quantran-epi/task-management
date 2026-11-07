import React from 'react';
import { Tag, Tooltip, Typography, theme } from 'antd';
import { BranchesOutlined, CodeOutlined, ConsoleSqlOutlined } from '@ant-design/icons';
import type { ChangeRequest, System, SystemType } from '../../types/models';
import type { SshConfig } from '../../types/ssh';
import { useSystemActions } from '../../workbench/hooks/useSystemActions';

export interface SubsystemsReposPanelProps {
  changeRequest: ChangeRequest;
  systems: System[];
  sshConfigs: SshConfig[];
  onEditSubsystem: (system: System) => void;
  onChooseSubsystem: () => void;
}

/** UI-SPEC §5b type badge. Local copy so this read-only panel never imports a view. */
const SYSTEM_TYPE_TAG: Record<SystemType, { label: string; color: string }> = {
  LOGICAL_GROUP: { label: 'Parent System (Logical Group)', color: 'purple' },
  SERVICE: { label: 'Service / Microservice', color: 'blue' },
  SCHEMA: { label: 'Database Schema', color: 'cyan' },
  UI: { label: 'Frontend UI', color: 'green' },
  WORKER: { label: 'Background Worker', color: 'orange' },
};

type ConnectionState = 'connected' | 'unconfigured' | 'failed';

const CONNECTION_DOT: Record<ConnectionState, { color: string; label: string }> = {
  connected: { color: '#52c41a', label: 'Đã cấu hình' },
  unconfigured: { color: '#faad14', label: 'Chưa cấu hình' },
  failed: { color: '#c54e58', label: 'Lỗi kết nối' },
};

/**
 * Read-only projection of a CR's target subsystems (D-37, UI-SPEC §5b).
 *
 * Hard rule: observation only. No form control may appear here — the single config source
 * stays `SystemModal`, reached through `onEditSubsystem` (T-31.2-38).
 */
export const SubsystemsReposPanel: React.FC<SubsystemsReposPanelProps> = ({
  changeRequest,
  systems,
  sshConfigs,
  onEditSubsystem,
  onChooseSubsystem,
}) => {
  const { token } = theme.useToken();
  const { openGit, openTerminal, disabledReason } = useSystemActions();

  const rows = changeRequest.targets
    .map((target) => ({ target, system: systems.find((s) => s.id === target.systemId) }))
    .filter((row): row is { target: (typeof changeRequest.targets)[number]; system: System } =>
      Boolean(row.system)
    );

  const connectionState = (system: System): ConnectionState => {
    if (!system.sshConfigId || !system.remoteRepoPath) return 'unconfigured';
    const ssh = sshConfigs.find((c) => c.id === system.sshConfigId);
    return ssh ? 'connected' : 'failed';
  };

  return (
    <div
      data-testid="subsystems-repos-panel"
      style={{
        background: '#f7f8fa',
        border: '1px solid var(--border, #e9eaee)',
        borderRadius: 4,
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <BranchesOutlined style={{ color: 'var(--fg-icon, #8c8c8c)' }} />
        <Typography.Text strong style={{ fontSize: 16, lineHeight: 1.3 }}>
          Subsystems &amp; Repos
        </Typography.Text>
        <Tag style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
          {rows.length}
        </Tag>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: token.colorTextTertiary }}>
          CR chưa gắn subsystem nào{' '}
          <Typography.Link style={{ fontSize: 12 }} onClick={onChooseSubsystem}>
            Chọn subsystem
          </Typography.Link>
        </div>
      ) : (
        rows.map(({ target, system }) => {
          const ssh = system.sshConfigId
            ? sshConfigs.find((c) => c.id === system.sshConfigId)
            : undefined;
          const state = connectionState(system);
          const dot = CONNECTION_DOT[state];
          const reason = disabledReason(system);
          const typeTag = SYSTEM_TYPE_TAG[system.type];
          return (
            <div
              key={system.id}
              data-testid={`repo-row-${system.id}`}
              style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <Tag
                  color="cyan"
                  style={{ margin: 0, fontFamily: 'monospace', fontSize: 11, lineHeight: '18px' }}
                >
                  {system.code}
                </Tag>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 400,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={system.name}
                >
                  {system.name}
                </span>
                <Tag color={typeTag?.color ?? 'default'} style={{ margin: 0, fontSize: 10 }}>
                  {typeTag?.label ?? system.type}
                </Tag>
                <span
                  data-testid={`repo-connection-${system.id}`}
                  title={dot.label}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: dot.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 10, color: token.colorTextTertiary }}>{dot.label}</span>
                <Tooltip title={reason ?? 'Mở Git Explorer'}>
                  <button
                    type="button"
                    aria-label={reason ?? 'Mở Git Explorer'}
                    disabled={Boolean(reason)}
                    onClick={() => openGit(system)}
                    style={{
                      width: 30,
                      height: 30,
                      border: '1px solid var(--border, #e9eaee)',
                      borderRadius: 4,
                      background: 'transparent',
                      cursor: reason ? 'not-allowed' : 'pointer',
                      opacity: reason ? 0.45 : 1,
                    }}
                  >
                    <CodeOutlined />
                  </button>
                </Tooltip>
                <Tooltip title={reason ?? 'Mở SSH Terminal'}>
                  <button
                    type="button"
                    aria-label={reason ?? 'Mở SSH Terminal'}
                    disabled={Boolean(reason)}
                    onClick={() => openTerminal(system)}
                    style={{
                      width: 30,
                      height: 30,
                      border: '1px solid var(--border, #e9eaee)',
                      borderRadius: 4,
                      background: 'transparent',
                      cursor: reason ? 'not-allowed' : 'pointer',
                      opacity: reason ? 0.45 : 1,
                    }}
                  >
                    <ConsoleSqlOutlined />
                  </button>
                </Tooltip>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: ssh ? token.colorTextSecondary : 'var(--warning, #faad14)',
                  }}
                >
                  {ssh ? `${ssh.username}@${ssh.host}:${ssh.port}` : 'Chưa cấu hình'}
                </span>
                <Tooltip title={system.remoteRepoPath ?? 'Chưa cấu hình'}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: token.colorTextSecondary,
                    }}
                  >
                    {system.remoteRepoPath ?? '—'}
                  </span>
                </Tooltip>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: token.colorTextTertiary }}>
                  {system.defaultBaseBranch ?? '—'}
                </span>
                <span style={{ fontSize: 10, color: token.colorTextTertiary }}>
                  {target.featureBranch ?? 'Chưa chọn nhánh'}
                </span>
              </div>
            </div>
          );
        })
      )}

      {rows.length > 0 && (
        <Typography.Link
          style={{ fontSize: 12, alignSelf: 'flex-start' }}
          onClick={() => {
            const first = rows[0];
            if (first) onEditSubsystem(first.system);
          }}
        >
          Chỉnh sửa trong System Catalog
        </Typography.Link>
      )}
    </div>
  );
};
