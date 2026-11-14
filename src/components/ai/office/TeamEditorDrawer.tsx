import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Avatar, Button, Drawer, Input, InputNumber, Select, Switch, theme } from 'antd';
import type { AiEmployee, AiLead } from '../../../types/aiOffice';
import { createTeam } from '../../../db/repositories/aiTeamRepo';
import type { TaskPlannerDatabase } from '../../../db';
import { agentColorFor, agentTextColorFor } from './AgentAttributionRow';

export interface TeamEditorDrawerProps {
  open: boolean;
  leads: AiLead[];
  employees: AiEmployee[];
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
  const [leadSelectTouched, setLeadSelectTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setLeadId(undefined);
    setEmployeeIds([]);
    setBudget(null);
    setActivateNow(false);
    setLeadSelectTouched(false);
    setError(null);
  }, [open]);

  const memberCount = (leadId ? 1 : 0) + employeeIds.length;
  const total = budget ?? 0;
  // D-05: a name is the only requirement — leader, agents and budget are added later.
  const valid = name.trim().length > 0;

  const selectedEmployees = useMemo(
    () => employees.filter((row) => employeeIds.includes(row.id)),
    [employees, employeeIds]
  );

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await createTeam(
        {
          name: name.trim(),
          ...(leadId ? { leadId } : {}),
          status: activateNow ? 'active' : 'idle',
          budgetTokens: total,
          employeeIds,
        },
        db
      );
      // WR-09: `createTeam` already writes the even split inside its own transaction.
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
            onOpenChange={(next) => {
              if (next) setLeadSelectTouched(true);
            }}
          />
          {leadSelectTouched && leads.length === 0 && (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 8 }}
              message="Chưa có lead nào. Bạn vẫn có thể tạo nhóm trước, rồi chọn lead trong Cài đặt nhóm."
            />
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Nhân viên</div>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            value={employeeIds}
            onChange={(value: string[]) => setEmployeeIds(value)}
            options={employees.map((employee) => ({
              label: `${employee.name} · ${employee.role}`,
              value: employee.id,
            }))}
            optionFilterProp="label"
            aria-label="Nhân viên"
            placeholder="Chọn nhân viên"
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
            formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => Number((value ?? '').replace(/,/g, ''))}
            aria-label="Tổng ngân sách nhóm"
          />
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
            {`Chia đều ${total.toLocaleString()} token cho ${memberCount} thành viên — sửa từng dòng nếu cần.`}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12 }}>Kích hoạt ngay</span>
          <Switch
            checked={activateNow}
            onChange={setActivateNow}
            aria-label="Kích hoạt ngay"
          />
        </div>
      </div>
    </Drawer>
  );
};

export default TeamEditorDrawer;
