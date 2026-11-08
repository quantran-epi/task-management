import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Drawer, InputNumber, Switch, Table, theme } from 'antd';
import type { AiEmployee, AiLead, AiTeam, AiTeamMember } from '../../../types/aiOffice';
import { agentColorFor, agentTextColorFor } from './AgentAttributionRow';
import { LinkedItemsList, type LinkedItemRow } from './LinkedItemsList';

export interface TeamSettingsDrawerProps {
  open: boolean;
  team: AiTeam;
  members: AiTeamMember[];
  lead: AiLead | undefined;
  employees: AiEmployee[];
  links: LinkedItemRow[];
  onCancel: () => void;
  onSave: (input: {
    budgetTokens: number;
    budgets: Record<string, number>;
    autoSplitEnabled: boolean;
    autoApproveMutations: boolean;
  }) => void;
}

interface SplitRow {
  memberId: string;
  agentId: string;
  name: string;
  role: 'lead' | 'employee';
  budgetTokens: number;
  usedTokens: number;
}

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

/** UI-SPEC §8a. Even split with the remainder on the lead row, per-row override allowed. */
export function evenSplitRows(
  total: number,
  rows: Array<Omit<SplitRow, 'budgetTokens' | 'usedTokens'> & { usedTokens: number }>
): SplitRow[] {
  const count = rows.length;
  const perRow = count > 0 ? Math.floor(total / count) : 0;
  const remainder = total - perRow * count;
  return rows.map((row) => ({
    ...row,
    budgetTokens: row.role === 'lead' ? perRow + remainder : perRow,
  }));
}

export const TeamSettingsDrawer: React.FC<TeamSettingsDrawerProps> = ({
  open,
  team,
  members,
  lead,
  employees,
  links,
  onCancel,
  onSave,
}) => {
  const { token } = theme.useToken();
  const [total, setTotal] = useState<number>(team.budgetTokens);
  const [rows, setRows] = useState<SplitRow[]>([]);
  const [autoSplit, setAutoSplit] = useState(team.autoSplitEnabled === true);
  const [autoApprove, setAutoApprove] = useState(team.autoApproveMutations === true);

  const baseRows = useMemo(
    () =>
      members
        .map((member) => {
          const isLead = member.role === 'lead';
          const agent = isLead ? lead : employees.find((row) => row.id === member.agentId);
          if (!agent) return null;
          return {
            memberId: member.id,
            agentId: member.agentId,
            name: agent.name,
            role: member.role,
            usedTokens: member.usedTokens,
          };
        })
        .filter((row): row is Omit<SplitRow, 'budgetTokens'> => row !== null),
    [members, lead, employees]
  );

  useEffect(() => {
    if (!open) return;
    setTotal(team.budgetTokens);
    setAutoSplit(team.autoSplitEnabled === true);
    setAutoApprove(team.autoApproveMutations === true);
    setRows(
      members
        .map((member) => {
          const isLead = member.role === 'lead';
          const agent = isLead ? lead : employees.find((row) => row.id === member.agentId);
          if (!agent) return null;
          return {
            memberId: member.id,
            agentId: member.agentId,
            name: agent.name,
            role: member.role,
            budgetTokens: member.budgetTokens,
            usedTokens: member.usedTokens,
          };
        })
        .filter((row): row is SplitRow => row !== null)
    );
  }, [open, team, members, lead, employees]);

  const applyTotal = (next: number) => {
    setTotal(next);
    setRows(evenSplitRows(next, baseRows));
  };

  const updateRow = (memberId: string, value: number) => {
    setRows((prev) =>
      prev.map((row) => (row.memberId === memberId ? { ...row, budgetTokens: value } : row))
    );
  };

  const handleSave = () => {
    const budgets: Record<string, number> = {};
    for (const row of rows) budgets[row.memberId] = row.budgetTokens;
    onSave({
      budgetTokens: total,
      budgets,
      autoSplitEnabled: autoSplit,
      autoApproveMutations: autoApprove,
    });
  };

  return (
    <Drawer
      width={600}
      placement="right"
      open={open}
      onClose={onCancel}
      destroyOnHidden
      title="Cài đặt nhóm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onCancel}>Hủy</Button>
          <Button type="primary" onClick={handleSave} data-testid="team-settings-save">
            Lưu cài đặt
          </Button>
        </div>
      }
    >
      <div data-testid="team-settings-drawer" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Ngân sách token</div>
          <InputNumber
            min={0}
            step={1000}
            style={{ width: 200 }}
            value={total}
            onChange={(value) => applyTotal(typeof value === 'number' ? value : 0)}
            aria-label="Tổng ngân sách nhóm"
          />
          <Table<SplitRow>
            size="small"
            pagination={false}
            rowKey="memberId"
            style={{ marginTop: 12 }}
            dataSource={rows}
            columns={[
              {
                title: 'Thành viên',
                dataIndex: 'name',
                render: (_value, row) => {
                  const color = agentColorFor(row.agentId);
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar
                        size={20}
                        shape={row.role === 'lead' ? 'square' : 'circle'}
                        style={{ backgroundColor: color, color: agentTextColorFor(color) }}
                      >
                        {initialOf(row.name)}
                      </Avatar>
                      <span>{row.name}</span>
                    </div>
                  );
                },
              },
              {
                title: 'Vai trò',
                dataIndex: 'role',
                render: (value: 'lead' | 'employee') => (value === 'lead' ? 'Lead' : 'Nhân viên'),
              },
              {
                title: 'Ngân sách',
                dataIndex: 'budgetTokens',
                render: (_value, row) => (
                  <InputNumber
                    size="small"
                    min={0}
                    step={1000}
                    value={row.budgetTokens}
                    onChange={(value) => updateRow(row.memberId, typeof value === 'number' ? value : 0)}
                    aria-label={`Ngân sách ${row.name}`}
                  />
                ),
              },
              {
                title: 'Đã dùng',
                dataIndex: 'usedTokens',
                render: (value: number) => (
                  <span style={{ fontSize: 12, color: token.colorTextSecondary }}>{value}</span>
                ),
              },
            ]}
          />
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
            {`Chia đều ${total} token cho ${rows.length} thành viên — sửa từng dòng nếu cần.`}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Liên kết mục</div>
          <LinkedItemsList items={links} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Chế độ</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12 }}>Tự động chia việc</span>
            <Switch
              size="small"
              checked={autoSplit}
              onChange={setAutoSplit}
              aria-label="Tự động chia việc"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12 }}>Tự động duyệt thay đổi</span>
            <Switch
              size="small"
              checked={autoApprove}
              onChange={setAutoApprove}
              aria-label="Tự động duyệt thay đổi"
            />
          </div>
        </div>
      </div>
    </Drawer>
  );
};

export default TeamSettingsDrawer;
