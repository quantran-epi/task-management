import React from 'react';
import { Segmented, Tag, Tooltip, theme } from 'antd';
import { CodeOutlined, ConsoleSqlOutlined } from '@ant-design/icons';
import type { CrTarget, System } from '../../types/models';
import { useSystemActions } from '../../workbench/hooks/useSystemActions';

export interface SubsystemContextBarProps {
  targets: CrTarget[];
  systems: System[];
  selectedSystemId: string;
  onSelect: (systemId: string) => void;
}

/**
 * Shared Step 3 / Step 4 subsystem switcher (D-38, UI-SPEC §5c).
 *
 * Fully controlled: the single `selectedSystemId` lives at the SDLC view level, so a selection
 * persists across step changes within one CR (T-31.2-40). No local state, and no SSH/repo
 * rebinding side-effects — those values are derived from the CR target and the system (D-38b).
 */
export const SubsystemContextBar: React.FC<SubsystemContextBarProps> = ({
  targets,
  systems,
  selectedSystemId,
  onSelect,
}) => {
  const { token } = theme.useToken();
  const { openGit, openTerminal, disabledReason } = useSystemActions();

  // UI-SPEC §5c: not rendered at all for a single subsystem — no empty container, no height.
  if (targets.length < 2) return null;

  const targetSystems = targets
    .map((target) => ({ target, system: systems.find((s) => s.id === target.systemId) }))
    .filter((row): row is { target: CrTarget; system: System } => Boolean(row.system));

  const selected = targetSystems.find((row) => row.system.id === selectedSystemId);
  const selectedSystem = selected?.system;
  const featureBranch = selected?.target.featureBranch;
  const reason = selectedSystem ? disabledReason(selectedSystem) : undefined;

  const iconButtonStyle: React.CSSProperties = {
    width: 30,
    height: 30,
    border: '1px solid var(--border, #e9eaee)',
    borderRadius: 4,
    background: 'transparent',
    cursor: reason ? 'not-allowed' : 'pointer',
    opacity: reason ? 0.45 : 1,
  };

  return (
    <div
      data-testid="subsystem-context-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        background: '#f7f8fa',
        border: '1px solid var(--border, #e9eaee)',
        borderRadius: 4,
        padding: '8px 12px',
        marginBottom: 12,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 400, color: token.colorTextSecondary }}>
        Subsystem đang chọn:
      </span>
      <Segmented
        size="small"
        value={selectedSystemId}
        onChange={(value) => onSelect(String(value))}
        options={targetSystems.map(({ system }) => ({
          value: system.id,
          label: `${system.code} (${system.name})`,
        }))}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        {featureBranch ? (
          <Tag style={{ margin: 0, fontFamily: 'monospace', fontSize: 11 }}>{featureBranch}</Tag>
        ) : (
          <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>
            Chưa chọn nhánh
          </Tag>
        )}
        <Tooltip title={reason ?? 'Mở Git Explorer'}>
          <button
            type="button"
            aria-label={reason ?? 'Mở Git Explorer'}
            disabled={Boolean(reason)}
            onClick={() => selectedSystem && openGit(selectedSystem)}
            style={iconButtonStyle}
          >
            <CodeOutlined />
          </button>
        </Tooltip>
        <Tooltip title={reason ?? 'Mở SSH Terminal'}>
          <button
            type="button"
            aria-label={reason ?? 'Mở SSH Terminal'}
            disabled={Boolean(reason)}
            onClick={() => selectedSystem && openTerminal(selectedSystem)}
            style={iconButtonStyle}
          >
            <ConsoleSqlOutlined />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
