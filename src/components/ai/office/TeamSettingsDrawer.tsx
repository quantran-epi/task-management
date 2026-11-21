import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Avatar, Button, Drawer, InputNumber, Popconfirm, Select, Switch, Table, Tag, useAntdToken, TextArea } from '../../ui';
import type { AiEmployee, AiLead, AiTeam, AiTeamMember } from '../../../types/aiOffice';
import {
  DEFAULT_BUDGET_WARN_THRESHOLD_PCT,
  DEFAULT_TEAM_CONCURRENCY,
  MAX_TEAM_CONCURRENCY,
  MIN_TEAM_CONCURRENCY,
} from '../../../types/aiOffice';
import { agentColorFor, agentTextColorFor } from './AgentAttributionRow';
import { splitEvenly } from '../../../services/ai/office/budgetSplit';
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
    concurrencyLimit: number;
    /** Quick cz2: per-team enablement of SSH FS / Oracle tool payloads. */
    sshFsToolsEnabled: boolean;
    oracleToolsEnabled: boolean;
    /** D-04: absent = leave the stored override alone, `null` = inherit, number = store. */
    budgetWarnThresholdPct?: number | null | undefined;
    /** Phase 45 D-16: team-scoped pinned context note; empty string clears the pin. */
    pinnedContext: string;
  }) => void;
  /** D-04: the global default, shown as the inherited value. Never written from here. */
  globalThresholdPct?: number | undefined;
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

/** UI-SPEC §8a. Thin adapter over `splitEvenly` — the arithmetic lives in `budgetSplit.ts`. */
export function evenSplitRows(
  total: number,
  rows: Array<Omit<SplitRow, 'budgetTokens' | 'usedTokens'> & { usedTokens: number }>
): SplitRow[] {
  return splitEvenly(total, rows);
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
  globalThresholdPct,
}) => {
  const { token } = useAntdToken();
  // The displayed table is the LIVE roster overlaid with per-member edits, so a member added
  // or removed while the drawer is open shows up without closing it. The team total is the
  // sum of those rows plus whatever the team holds beyond them (a deliberate under-allocation),
  // so allocating to a member raises the total and removing one lowers it.
  //
  // `unallocated === null` means "untouched": the total is simply the live `team.budgetTokens`,
  // which keeps the drawer correct even if it opens before the roster query resolves. The
  // baseline is captured on the FIRST edit, from the persisted numbers at that moment.
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [unallocated, setUnallocated] = useState<number | null>(null);
  const [autoSplit, setAutoSplit] = useState(team.autoSplitEnabled === true);
  const [autoApprove, setAutoApprove] = useState(team.autoApproveMutations === true);
  const [sshFsToolsEnabled, setSshFsToolsEnabled] = useState(team.sshFsToolsEnabled === true);
  const [oracleToolsEnabled, setOracleToolsEnabled] = useState(team.oracleToolsEnabled === true);
  const [concurrency, setConcurrency] = useState<number>(
    team.concurrencyLimit ?? DEFAULT_TEAM_CONCURRENCY
  );
  // D-04: three states. `undefined` = untouched, `null` = clear (inherit), number = override.
  // The state is seeded from the STORED override for display only; `thresholdTouched` is what
  // decides whether the save carries it. Seeding the global default instead is exactly how an
  // unrelated save would turn an inherited 65 into an explicit 80.
  const [thresholdPct, setThresholdPct] = useState<number | null | undefined>(
    team.budgetWarnThresholdPct
  );
  const [thresholdTouched, setThresholdTouched] = useState(false);
  // Phase 45 D-16: local draft for the team-scoped pinned context note.
  const [pinnedContext, setPinnedContext] = useState<string>(team.pinnedContext ?? '');
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

  // Live roster, rebuilt whenever a member is added or removed while the drawer is open.
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
            budgetTokens: member.budgetTokens,
            usedTokens: member.usedTokens,
          };
        })
        .filter((row): row is SplitRow => row !== null),
    [members, lead, employees]
  );

  const rows = useMemo(
    () =>
      baseRows.map((row) =>
        overrides[row.memberId] === undefined
          ? row
          : { ...row, budgetTokens: overrides[row.memberId]! }
      ),
    [baseRows, overrides]
  );

  // The team total is the sum of the grants plus whatever the team holds beyond them. Editing
  // one row's budget therefore moves the total by the same amount, and a member added or
  // removed moves it by that member's share — the two can never drift apart.
  //
  // Summed over every LIVE member, not over the rendered rows: a member whose agent profile is
  // missing from `employees` has no display row, but its grant still belongs to the total.
  const allocatedSum = members.reduce(
    (sum, member) => sum + (overrides[member.id] ?? member.budgetTokens),
    0
  );
  const total = unallocated === null ? team.budgetTokens : allocatedSum + unallocated;

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
    setOverrides({});
    setUnallocated(null);
    setAutoSplit(team.autoSplitEnabled === true);
    setAutoApprove(team.autoApproveMutations === true);
    setSshFsToolsEnabled(team.sshFsToolsEnabled === true);
    setOracleToolsEnabled(team.oracleToolsEnabled === true);
    setConcurrency(team.concurrencyLimit ?? DEFAULT_TEAM_CONCURRENCY);
    setThresholdPct(team.budgetWarnThresholdPct);
    setThresholdTouched(false);
    setPinnedContext(team.pinnedContext ?? '');
  }, [open, team.id]);

  /** First edit freezes the under-allocation the persisted rows already imply. */
  const baseline = () =>
    Math.max(
      0,
      team.budgetTokens - members.reduce((sum, member) => sum + member.budgetTokens, 0)
    );

  const applyTotal = (next: number) => {
    const split = evenSplitRows(next, baseRows);
    setOverrides(Object.fromEntries(split.map((row) => [row.memberId, row.budgetTokens])));
    // A member with no display row keeps its grant, so it is subtracted here — the typed total
    // is what the user sees, and it stays exact.
    const shown = new Set(split.map((row) => row.memberId));
    const hidden = members.reduce(
      (sum, member) => sum + (shown.has(member.id) ? 0 : member.budgetTokens),
      0
    );
    // Signed on purpose: typing a total below the current allocations must still show exactly
    // that total (the rows then exceed it), rather than snapping back up to their sum.
    setUnallocated(
      next - split.reduce((sum, row) => sum + row.budgetTokens, 0) - hidden
    );
  };

  const updateRow = (memberId: string, value: number) => {
    setUnallocated((prev) => prev ?? baseline());
    setOverrides((prev) => ({ ...prev, [memberId]: value }));
  };

  const handleSave = () => {
    const budgets: Record<string, number> = {};
    // `rows` covers the live roster, so a member added while the drawer is open is included.
    for (const row of rows) budgets[row.memberId] = row.budgetTokens;
    // A member whose agent profile is not in `employees` has no display row but still owns a
    // grant; save it rather than silently dropping the roster row.
    for (const member of members) {
      if (budgets[member.id] === undefined) {
        budgets[member.id] = overrides[member.id] ?? member.budgetTokens;
      }
    }
    onSave({
      budgetTokens: total,
      budgets,
      autoSplitEnabled: autoSplit,
      autoApproveMutations: autoApprove,
      concurrencyLimit: concurrency,
      sshFsToolsEnabled,
      oracleToolsEnabled,
      // D-04: untouched leaves the stored value alone; a clear sends `null`; a typed value
      // sends the number. `undefined` is the only "do nothing" spelling.
      budgetWarnThresholdPct: thresholdTouched ? thresholdPct : undefined,
      // Phase 45 D-16: persist the whole trimmed note; empty string clears the pin.
      pinnedContext: pinnedContext.trim(),
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--gap-8)' }}>
          <Button onClick={onCancel}>Hủy</Button>
          <Button type="primary" onClick={handleSave} data-testid="team-settings-save">
            Lưu cài đặt nhóm
          </Button>
        </div>
      }
    >
      <div data-testid="team-settings-drawer" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-16)' }}>
        <div data-testid="team-roster-block">
          <div style={{ fontSize: 'var(--font-size-small)', fontWeight: 600, marginBottom: 8 }}>Thành viên</div>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-6)' }}>
            {members.length === 0 && (
              <div style={{ fontSize: 'var(--font-size-small)', color: token.colorTextSecondary }}>
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
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)' }}
                >
                  <Avatar
                    size={20}
                    shape={isLead ? 'square' : 'circle'}
                    style={{ backgroundColor: color, color: agentTextColorFor(color) }}
                  >
                    {initialOf(name)}
                  </Avatar>
                  <span style={{ fontSize: 13 }}>{name}</span>
                  <Tag style={{ fontSize: 'var(--font-size-xs)' }}>{isLead ? 'Lead' : 'Nhân viên'}</Tag>
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
            <div style={{ fontSize: 'var(--font-size-small)', marginBottom: 4 }}>Thêm nhân viên</div>
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
            <div style={{ fontSize: 'var(--font-size-small)', marginBottom: 4 }}>Leader</div>
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
              <div style={{ fontSize: 'var(--font-size-small)', color: token.colorTextSecondary, marginTop: 4 }}>
                Leader đã khóa từ lượt chạy đầu tiên và cố định suốt đời nhóm. Cần leader khác thì
                tạo nhóm mới.
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 'var(--font-size-small)', fontWeight: 600, marginBottom: 8 }}>Ngân sách token</div>
          <InputNumber
            min={0}
            step={1000}
            style={{ width: 200 }}
            value={total}
            onChange={(value) => applyTotal(typeof value === 'number' ? value : 0)}
            formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => Number((value ?? '').replace(/,/g, ''))}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)' }}>
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
                    formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value) => Number((value ?? '').replace(/,/g, ''))}
                    aria-label={`Ngân sách ${row.name}`}
                  />
                ),
              },
              {
                title: 'Đã dùng',
                dataIndex: 'usedTokens',
                render: (value: number) => (
                  <span style={{ fontSize: 'var(--font-size-small)', color: token.colorTextSecondary }}>
                    {value.toLocaleString()}
                  </span>
                ),
              },
            ]}
          />
          <div style={{ fontSize: 'var(--font-size-small)', color: token.colorTextSecondary, marginTop: 4 }}>
            {`Chia đều ${total.toLocaleString()} token cho ${rows.length} thành viên — sửa từng dòng nếu cần.`}
          </div>
        </div>

        <div data-testid="team-threshold-block">
          <div style={{ fontSize: 'var(--font-size-small)', fontWeight: 600, marginBottom: 8 }}>Ngưỡng cảnh báo</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)' }}>
            <InputNumber
              min={1}
              max={100}
              precision={0}
              style={{ width: 100 }}
              value={thresholdPct ?? globalThresholdPct ?? DEFAULT_BUDGET_WARN_THRESHOLD_PCT}
              onChange={(value) => {
                setThresholdTouched(true);
                setThresholdPct(typeof value === 'number' ? value : null);
              }}
              aria-label="Ngưỡng cảnh báo ngân sách"
              data-testid="team-threshold-input"
            />
            <span style={{ fontSize: 'var(--font-size-small)' }}>%</span>
            <Button
              size="small"
              type="text"
              onClick={() => {
                setThresholdTouched(true);
                setThresholdPct(null);
              }}
              data-testid="team-threshold-clear"
            >
              Dùng mặc định toàn cục
            </Button>
          </div>
          <div style={{ fontSize: 'var(--font-size-small)', color: token.colorTextSecondary, marginTop: 4 }}>
            {thresholdPct === null || thresholdPct === undefined
              ? `Đang kế thừa mặc định toàn cục (${globalThresholdPct ?? DEFAULT_BUDGET_WARN_THRESHOLD_PCT}%).`
              : `Đang dùng ngưỡng riêng của nhóm (${thresholdPct}%).`}
          </div>
        </div>

        <div data-testid="team-pinned-context-block">
          <div style={{ fontSize: 'var(--font-size-small)', fontWeight: 600, marginBottom: 8 }}>Pinned Team Context</div>
          <TextArea
            value={pinnedContext}
            onChange={(event) => setPinnedContext(event.target.value)}
            placeholder="Ghi chú định hướng cho nhóm này, ví dụ: dùng môi trường DB SIT cho oracle_query."
            autoSize={{ minRows: 3, maxRows: 8 }}
            aria-label="Pinned Team Context"
            data-testid="team-pinned-context-input"
          />
          <div style={{ fontSize: 'var(--font-size-small)', color: token.colorTextSecondary, marginTop: 4 }}>
            Nội dung này chỉ áp dụng cho nhóm và được đưa vào mọi lượt của leader lẫn nhân viên. Việc
            nêu tên môi trường DB ở đây chỉ định hướng agent chọn kết nối Oracle — không thay đổi
            kết nối đang dùng chung của toàn ứng dụng.
          </div>
        </div>

        <div>
          <div style={{ fontSize: 'var(--font-size-small)', fontWeight: 600, marginBottom: 8 }}>Liên kết mục</div>
          <LinkedItemsList items={links} />
        </div>

        <div>
          <div style={{ fontSize: 'var(--font-size-small)', fontWeight: 600, marginBottom: 8 }}>Chạy đồng thời</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--font-size-small)' }}>Số nhân viên chạy đồng thời</span>
            <InputNumber
              min={MIN_TEAM_CONCURRENCY}
              max={MAX_TEAM_CONCURRENCY}
              step={1}
              style={{ width: 90 }}
              value={concurrency}
              onChange={(value) =>
                setConcurrency(
                  typeof value === 'number'
                    ? value
                    : team.concurrencyLimit ?? DEFAULT_TEAM_CONCURRENCY
                )
              }
              aria-label="Số nhân viên chạy đồng thời"
              data-testid="team-concurrency-limit"
            />
          </div>
          <div style={{ fontSize: 'var(--font-size-small)', color: token.colorTextSecondary, marginTop: 4 }}>
            {`Từ ${MIN_TEAM_CONCURRENCY} đến ${MAX_TEAM_CONCURRENCY} nhân viên chạy cùng lúc; thay đổi áp dụng ngay cho lô đang chạy.`}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-8)' }}>
          <div style={{ fontSize: 'var(--font-size-small)', fontWeight: 600 }}>Chế độ</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--font-size-small)' }}>Tự động chia việc</span>
            <Switch
              size="small"
              checked={autoSplit}
              onChange={setAutoSplit}
              aria-label="Tự động chia việc"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--font-size-small)' }}>Tự động duyệt thay đổi</span>
            <Switch
              size="small"
              checked={autoApprove}
              onChange={setAutoApprove}
              aria-label="Tự động duyệt thay đổi"
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-8)' }}>
          <div style={{ fontSize: 'var(--font-size-small)', fontWeight: 600 }}>Công cụ AI theo nhóm</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--font-size-small)' }}>SSH File System</span>
            <Switch
              size="small"
              checked={sshFsToolsEnabled}
              onChange={setSshFsToolsEnabled}
              aria-label="Bật SSH File System cho nhóm này"
              data-testid="team-ssh-fs-tools-enabled"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--font-size-small)' }}>Oracle SQLcl</span>
            <Switch
              size="small"
              checked={oracleToolsEnabled}
              onChange={setOracleToolsEnabled}
              aria-label="Bật Oracle SQLcl cho nhóm này"
              data-testid="team-oracle-tools-enabled"
            />
          </div>
          <div style={{ fontSize: 'var(--font-size-small)', color: token.colorTextSecondary }}>
            Cấu hình kết nối được quản lý chung trong Settings; bật/tắt ở đây áp dụng cho nhóm chat này.
          </div>
        </div>
      </div>
    </Drawer>
  );
};

export default TeamSettingsDrawer;
