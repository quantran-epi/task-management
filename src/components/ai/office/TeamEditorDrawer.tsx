import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Avatar, Button, Drawer, Input, InputNumber, Select, Switch, Tooltip, theme } from 'antd';
import type { AiEmployee, AiLead } from '../../../types/aiOffice';
import { ACTIVE_TEAM_CAP_MESSAGE, applyEvenSplit, createTeam } from '../../../db/repositories/aiTeamRepo';
import type { TaskPlannerDatabase } from '../../../db';
import { agentColorFor, agentTextColorFor } from './AgentAttributionRow';

export interface TeamEditorDrawerProps {
  open: boolean;
  leads: AiLead[];
  employees: AiEmployee[];
  activeCount: number;
  db: TaskPlannerDatabase;
  onCancel: () => void;
  onSaved: () => void;
}

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

/** UI-SPEC §5d create-team drawer. The only surface that creates a team. */
export const TeamEditorDrawer: React.FC<TeamEditorDrawerProps> = ({
  open,
  leads,
  employees,
  activeCount,
  db,
  onCancel,
  onSaved,
}) => {
  const { token } = theme.useToken();
  const [name, setName] = useState('');
  const [leadId, setLeadId] = useState<string | undefined>(undefined);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [budget, setBudget] = useState<number | null>(null);
  const [activateNow, setActivateNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setLeadId(undefined);
    setEmployeeIds([]);
    setBudget(null);
    setActivateNow(false);
    setError(null);
  }, [open]);

  const capReached = activeCount >= 3;
  const memberCount = (leadId ? 1 : 0) + employeeIds.length;
  const total = budget ?? 0;
  const valid = name.trim().length > 0 && Boolean(leadId) && budget !== null && budget >= 0;

  const selectedEmployees = useMemo(
    () => employees.filter((row) => employeeIds.includes(row.id)),
    [employees, employeeIds]
  );

  const handleSave = async () => {
    if (!valid || !leadId || budget === null) return;
    setSaving(true);
    setError(null);
    try {
      const team = await createTeam(
        {
          name: name.trim(),
          leadId,
          status: activateNow ? 'active' : 'idle',
          budgetTokens: budget,
          employeeIds,
        },
        db
      );
      // `createTeam` seeds the member rows; the split needs those rows to exist.
      await applyEvenSplit(team.id, budget, db);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      width={560}
      placement="right"
      open={open}
      onClose={onCancel}
      destroyOnHidden
      title="Tạo nhóm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onCancel}>Hủy</Button>
          <Button
            type="primary"
            disabled={!valid}
            loading={saving}
            onClick={handleSave}
            data-testid="team-editor-save"
          >
            Tạo nhóm
          </Button>
        </div>
      }
    >
      <div data-testid="team-editor-drawer" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <Alert type="error" showIcon message={error} />}

        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Tên nhóm</div>
          <Input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            aria-label="Tên nhóm"
          />
        </div>

        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Lead</div>
          <Select
            showSearch
            style={{ width: '100%' }}
            value={leadId ?? null}
            onChange={(value: string) => setLeadId(value)}
            options={leads.map((lead) => ({ label: `${lead.name} · ${lead.role}`, value: lead.id }))}
            optionFilterProp="label"
            aria-label="Lead"
            placeholder="Chọn lead"
          />
          {leads.length === 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 8 }}
              message="Chưa có lead nào. Tạo lead trước khi lập nhóm."
            />
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Nhân viên</div>
          <Select
            mode="multiple"
            maxCount={3}
            style={{ width: '100%' }}
            value={employeeIds}
            onChange={(value: string[]) => setEmployeeIds(value)}
            options={employees.map((employee) => ({
              label: `${employee.name} · ${employee.role}`,
              value: employee.id,
            }))}
            optionFilterProp="label"
            aria-label="Nhân viên"
            placeholder="Chọn tối đa 3 nhân viên"
          />
          {selectedEmployees.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
              {selectedEmployees.map((employee, index) => {
                const color = agentColorFor(employee.id);
                return (
                  <Avatar
                    key={employee.id}
                    size={24}
                    style={{
                      backgroundColor: color,
                      color: agentTextColorFor(color),
                      marginLeft: index === 0 ? 0 : -6,
                      border: `1px solid ${token.colorBgContainer}`,
                    }}
                  >
                    {initialOf(employee.name)}
                  </Avatar>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Tổng ngân sách nhóm</div>
          <InputNumber
            min={0}
            step={1000}
            style={{ width: 200 }}
            value={budget}
            onChange={(value) => setBudget(typeof value === 'number' ? value : null)}
            aria-label="Tổng ngân sách nhóm"
          />
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
            {`Chia đều ${total} token cho ${memberCount} thành viên — sửa từng dòng nếu cần.`}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12 }}>Kích hoạt ngay</span>
          <Tooltip title={capReached ? ACTIVE_TEAM_CAP_MESSAGE : ''}>
            <Switch
              checked={activateNow}
              onChange={setActivateNow}
              disabled={capReached}
              aria-label="Kích hoạt ngay"
            />
          </Tooltip>
        </div>
      </div>
    </Drawer>
  );
};

export default TeamEditorDrawer;
