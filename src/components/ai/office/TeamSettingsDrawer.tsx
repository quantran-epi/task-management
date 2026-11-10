import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Avatar, Button, Drawer, InputNumber, Popconfirm, Select, Switch, Table, Tag, theme } from 'antd';
import type { AiEmployee, AiLead, AiTeam, AiTeamMember } from '../../../types/aiOffice';
import { agentColorFor, agentTextColorFor } from './AgentAttributionRow';
import { LinkedItemsList, type LinkedItemRow } from './LinkedItemsList';

export interface TeamSettingsDrawerProps {
  open: boolean;
  team: AiTeam;
  members: AiTeamMember[];
  lead: AiLead | undefined;
  employees: AiEmployee[];
  /** Every persisted lead — the leader Select's option source (D-09). */
  leads: AiLead[];
  links: LinkedItemRow[];
  onCancel: () => void;
  onAssignLeader: (leadId: string) => Promise<void> | void;
  onAddMember: (agentId: string) => Promise<void> | void;
  onRemoveMember: (memberId: string) => Promise<void> | void;
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
  leads,
  links,
  onCancel,
  onAssignLeader,
  onAddMember,
  onRemoveMember,
  onSave,
}) => {
  const { token } = theme.useToken();
  const [total, setTotal] = useState<number>(team.budgetTokens);
  const [rows, setRows] = useState<SplitRow[]>([]);
  const [autoSplit, setAutoSplit] = useState(team.autoSplitEnabled === true);
  const [autoApprove, setAutoApprove] = useState(team.autoApproveMutations === true);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const memberAgentIds = useMemo(
    () => new Set(members.filter((row) => row.role === 'employee').map((row) => row.agentId)),
    [members]
  );

  // A refusal from the repo (locked leader, duplicate member) is rendered here rather than
  // left as an unhandled rejection. The UI never decides whether the write is allowed.
  const runRosterAction = async (action: () => Promise<void> | void) => {
    setRosterError(null);
    try {
      await action();
    } catch (err) {
      setRosterError(err instanceof Error ? err.message : String(err));
    }
  };

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

  // WR-08: seed only when the drawer opens (or the team changes). `members` is a live
  // query whose identity changes on every usage write, which would otherwise reset the
  // user's in-progress edits mid-run.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      seededFor.current = null;
      return;
    }
    if (seededFor.current === team.id) return;
    seededFor.current = team.id;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seeded once per open
  }, [open, team.id]);

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
        <div data-testid="team-roster-block">
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Thành viên</div>
          {rosterError && (
            <Alert
              type="warning"
              showIcon
              closable
              style={{ marginBottom: 8 }}
              message={rosterError}
              onClose={() => setRosterError(null)}
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {members.length === 0 && (
              <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                Nhóm chưa có thành viên nào.
              </div>
            )}
            {members.map((member) => {
              const isLead = member.role === 'lead';
              const agent = isLead ? lead : employees.find((row) => row.id === member.agentId);
              const name = agent?.name ?? 'Không xác định';
              const color = agentColorFor(member.agentId);
              return (
                <div
                  key={member.id}
                  data-testid={`team-member-row-${member.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <Avatar
                    size={20}
                    shape={isLead ? 'square' : 'circle'}
                    style={{ backgroundColor: color, color: agentTextColorFor(color) }}
                  >
                    {initialOf(name)}
                  </Avatar>
                  <span style={{ fontSize: 13 }}>{name}</span>
                  <Tag style={{ fontSize: 11 }}>{isLead ? 'Lead' : 'Nhân viên'}</Tag>
                  {!isLead && (
                    <Popconfirm
                      title={`Gỡ «${name}» khỏi nhóm? Tin nhắn và phân công cũ vẫn được giữ.`}
                      okText="Gỡ"
                      cancelText="Hủy"
                      onConfirm={() => runRosterAction(() => onRemoveMember(member.id))}
                    >
                      <Button
                        size="small"
                        type="text"
                        danger
                        style={{ marginLeft: 'auto' }}
                        data-testid={`team-member-remove-${member.id}`}
                      >
                        Gỡ khỏi nhóm
                      </Button>
                    </Popconfirm>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Thêm nhân viên</div>
            <Select
              showSearch
              style={{ width: '100%' }}
              value={null}
              onChange={(agentId: string) => runRosterAction(() => onAddMember(agentId))}
              options={employees
                .filter((employee) => !memberAgentIds.has(employee.id))
                .map((employee) => ({
                  label: `${employee.name} · ${employee.role}`,
                  value: employee.id,
                }))}
              optionFilterProp="label"
              aria-label="Thêm nhân viên"
              placeholder="Chọn nhân viên để thêm"
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Leader</div>
            <Select
              showSearch
              style={{ width: '100%' }}
              value={team.leadId ?? null}
              onChange={(leadId: string) => runRosterAction(() => onAssignLeader(leadId))}
              options={leads.map((row) => ({ label: `${row.name} · ${row.role}`, value: row.id }))}
              optionFilterProp="label"
              aria-label="Leader"
              placeholder="Chọn leader"
              disabled={Boolean(team.leaderLockedAt)}
            />
            {team.leaderLockedAt ? (
              <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
                Leader đã khóa từ lượt chạy đầu tiên và cố định suốt đời nhóm. Cần leader khác thì
                tạo nhóm mới.
              </div>
            ) : null}
          </div>
        </div>

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
