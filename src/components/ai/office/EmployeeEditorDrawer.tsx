import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Drawer, Input, Select, Space } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import {
  countTeamsUsingEmployee,
  createEmployee,
  createLead,
  listSkills,
  updateEmployee,
  updateLead,
} from '../../../db/repositories/aiOfficeRepo';
import { fetchAvailableModels } from '../../../services/ai/nineRouterTokenService';
import {
  AiEmployeeInputSchema,
  AiLeadInputSchema,
} from '../../../validation/aiOfficeSchemas';
import type { AiEmployee, AiLead } from '../../../types/aiOffice';

const CODE_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const NO_MODEL_COPY =
  'Chưa có mô hình AI nào khả dụng. Mở Cài đặt để cấu hình nhà cung cấp mô hình trước khi lưu.';
const SHARED_EDIT_COPY = 'Thay đổi này áp dụng cho mọi nhóm đang dùng nhân viên này.';

interface AgentFormState {
  name: string;
  role: string;
  capability: string;
  persona: string;
  model: string;
  skillId: string | undefined;
}

const EMPTY_FORM: AgentFormState = {
  name: '',
  role: '',
  capability: '',
  persona: '',
  model: '',
  skillId: undefined,
};

function useAvailableModels(db: TaskPlannerDatabase): string[] {
  const [models, setModels] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetchAvailableModels(db)
      .then((list) => {
        if (!cancelled) setModels(list);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [db]);
  return models;
}

interface AgentEditorShellProps {
  open: boolean;
  db: TaskPlannerDatabase;
  kind: 'employee' | 'lead';
  row: AiEmployee | AiLead | null;
  onCancel: () => void;
  onSaved: () => void;
}

const AgentEditorShell: React.FC<AgentEditorShellProps> = ({
  open,
  db,
  kind,
  row,
  onCancel,
  onSaved,
}) => {
  const isEmployee = kind === 'employee';
  const [form, setForm] = useState<AgentFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [sharedTeamCount, setSharedTeamCount] = useState(0);
  const models = useAvailableModels(db);
  const skills = useLiveQuery(() => listSkills(db), [db]) ?? [];

  useEffect(() => {
    if (!open) return;
    setForm(
      row
        ? {
            name: row.name,
            role: row.role,
            capability: row.capability,
            persona: row.persona,
            model: row.model,
            skillId: isEmployee ? (row as AiEmployee).skillId : undefined,
          }
        : EMPTY_FORM
    );
  }, [open, row, isEmployee]);

  useEffect(() => {
    if (!open || !isEmployee || !row) {
      setSharedTeamCount(0);
      return;
    }
    let cancelled = false;
    void countTeamsUsingEmployee(row.id, db).then((count) => {
      if (!cancelled) setSharedTeamCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [open, isEmployee, row, db]);

  const valid = useMemo(() => {
    const base = {
      name: form.name,
      role: form.role,
      capability: form.capability,
      persona: form.persona,
      model: form.model,
    };
    if (isEmployee) {
      const candidate = form.skillId ? { ...base, skillId: form.skillId } : base;
      return AiEmployeeInputSchema.safeParse(candidate).success;
    }
    return AiLeadInputSchema.safeParse(base).success;
  }, [form, isEmployee]);

  const set = <K extends keyof AgentFormState>(key: K, value: AgentFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isEmployee) {
        const payload = {
          name: form.name,
          role: form.role,
          capability: form.capability,
          persona: form.persona,
          model: form.model,
          ...(form.skillId ? { skillId: form.skillId } : {}),
        };
        if (row) {
          await updateEmployee(row.id, { ...payload, skillId: form.skillId ?? null }, db);
        } else {
          await createEmployee(payload, db);
        }
      } else {
        const payload = {
          name: form.name,
          role: form.role,
          capability: form.capability,
          persona: form.persona,
          model: form.model,
        };
        if (row) await updateLead(row.id, payload, db);
        else await createLead(payload, db);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const noun = isEmployee ? 'nhân viên' : 'lead';
  const title = `${row ? 'Sửa' : 'Thêm'} ${noun}`;

  return (
    <Drawer
      width={560}
      placement="right"
      open={open}
      onClose={onCancel}
      destroyOnHidden
      title={title}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onCancel}>Hủy</Button>
          <Button
            type="primary"
            disabled={!valid}
            loading={saving}
            onClick={handleSave}
            data-testid={isEmployee ? 'employee-editor-save' : 'lead-editor-save'}
          >
            {`Lưu ${noun}`}
          </Button>
        </div>
      }
    >
      <div
        data-testid={isEmployee ? 'employee-editor-drawer' : 'lead-editor-drawer'}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {isEmployee && sharedTeamCount > 0 && (
          <Alert type="info" showIcon message={SHARED_EDIT_COPY} />
        )}

        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Tên</div>
            <Input
              value={form.name}
              maxLength={60}
              onChange={(e) => set('name', e.target.value)}
              aria-label="Tên"
            />
          </div>

          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Vai trò</div>
            <Input
              value={form.role}
              maxLength={60}
              placeholder="VD: Chuyên viên phân tích nghiệp vụ"
              onChange={(e) => set('role', e.target.value)}
              aria-label="Vai trò"
            />
          </div>

          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Mô tả năng lực (lead nhìn thấy)</div>
            <Input.TextArea
              rows={2}
              maxLength={300}
              value={form.capability}
              onChange={(e) => set('capability', e.target.value)}
              aria-label="Mô tả năng lực (lead nhìn thấy)"
            />
          </div>

          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Persona</div>
            <Input.TextArea
              rows={8}
              value={form.persona}
              onChange={(e) => set('persona', e.target.value)}
              aria-label="Persona"
              style={{ fontFamily: CODE_FONT, fontSize: 12 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Mô hình</div>
            <Select
              showSearch
              style={{ width: '100%' }}
              value={form.model || null}
              onChange={(value: string) => set('model', value)}
              options={models.map((model) => ({ label: model, value: model }))}
              aria-label="Mô hình"
            />
            {models.length === 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 8 }}
                message={NO_MODEL_COPY}
              />
            )}
          </div>

          {isEmployee && (
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Kỹ năng</div>
              <Select
                allowClear
                showSearch
                style={{ width: '100%' }}
                value={form.skillId}
                onChange={(value?: string) => set('skillId', value)}
                options={skills.map((skill) => ({ label: skill.name, value: skill.id }))}
                aria-label="Kỹ năng"
              />
            </div>
          )}
        </Space>
      </div>
    </Drawer>
  );
};

export interface EmployeeEditorDrawerProps {
  open: boolean;
  employee: AiEmployee | null;
  onCancel: () => void;
  onSaved: () => void;
  db?: TaskPlannerDatabase | undefined;
}

export const EmployeeEditorDrawer: React.FC<EmployeeEditorDrawerProps> = ({
  open,
  employee,
  onCancel,
  onSaved,
  db = defaultDb,
}) => (
  <AgentEditorShell
    open={open}
    db={db}
    kind="employee"
    row={employee}
    onCancel={onCancel}
    onSaved={onSaved}
  />
);

export interface LeadEditorDrawerProps {
  open: boolean;
  lead: AiLead | null;
  onCancel: () => void;
  onSaved: () => void;
  db?: TaskPlannerDatabase | undefined;
}

export const LeadEditorDrawer: React.FC<LeadEditorDrawerProps> = ({
  open,
  lead,
  onCancel,
  onSaved,
  db = defaultDb,
}) => (
  <AgentEditorShell
    open={open}
    db={db}
    kind="lead"
    row={lead}
    onCancel={onCancel}
    onSaved={onSaved}
  />
);

export default EmployeeEditorDrawer;
