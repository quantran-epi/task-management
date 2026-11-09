import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input, Select, Space, message } from 'antd';
import { SaveOutlined, UserOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import {
  countTeamsUsingEmployee,
  listSkills,
  updateEmployee,
  updateLead,
} from '../db/repositories/aiOfficeRepo';
import { fetchAvailableModels } from '../services/ai/nineRouterTokenService';
import {
  AiEmployeeInputSchema,
  AiLeadInputSchema,
} from '../validation/aiOfficeSchemas';
import type { AiEmployee, AiLead } from '../types/aiOffice';

const CODE_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const NO_MODEL_COPY =
  'Chưa có mô hình AI nào khả dụng. Mở Cài đặt để cấu hình nhà cung cấp mô hình trước khi lưu.';
const SHARED_EDIT_COPY = 'Thay đổi này áp dụng cho mọi nhóm đang dùng nhân viên này.';

export interface StaffDetailViewProps {
  db?: TaskPlannerDatabase | undefined;
  staffId: string;
  role: 'employee' | 'lead';
}

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

function useAvailableModels(database: TaskPlannerDatabase): string[] {
  const [models, setModels] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetchAvailableModels(database)
      .then((list) => {
        if (!cancelled) setModels(list);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [database]);
  return models;
}

export const StaffDetailView: React.FC<StaffDetailViewProps> = ({
  db = defaultDb,
  staffId,
  role,
}) => {
  const isEmployee = role === 'employee';

  const staffRecord = useLiveQuery(async () => {
    if (isEmployee) {
      return (await db.aiEmployees.get(staffId)) as AiEmployee | undefined;
    }
    return (await db.aiLeads.get(staffId)) as AiLead | undefined;
  }, [db, staffId, isEmployee]);

  const [form, setForm] = useState<AgentFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [sharedTeamCount, setSharedTeamCount] = useState(0);

  const models = useAvailableModels(db);
  const skills = useLiveQuery(() => listSkills(db), [db]) ?? [];

  useEffect(() => {
    if (!staffRecord) return;
    setForm({
      name: staffRecord.name,
      role: staffRecord.role,
      capability: staffRecord.capability,
      persona: staffRecord.persona,
      model: staffRecord.model,
      skillId: isEmployee ? (staffRecord as AiEmployee).skillId : undefined,
    });
  }, [staffRecord, isEmployee]);

  useEffect(() => {
    if (!isEmployee || !staffId) {
      setSharedTeamCount(0);
      return;
    }
    let cancelled = false;
    void countTeamsUsingEmployee(staffId, db).then((count) => {
      if (!cancelled) setSharedTeamCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [isEmployee, staffId, db]);

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

  const setField = <K extends keyof AgentFormState>(key: K, value: AgentFormState[K]) =>
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
          skillId: form.skillId ?? null,
        };
        await updateEmployee(staffId, payload, db);
      } else {
        const payload = {
          name: form.name,
          role: form.role,
          capability: form.capability,
          persona: form.persona,
          model: form.model,
        };
        await updateLead(staffId, payload, db);
      }
      message.success(`Đã cập nhật ${isEmployee ? 'nhân viên' : 'lead'} thành công`);
    } catch (err) {
      message.error('Không thể lưu thông tin: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  if (!staffRecord) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-secondary, #5f6269)' }}>
        Không tìm thấy thông tin nhân viên hoặc lead này. Có thể đã bị xóa.
      </div>
    );
  }

  const noun = isEmployee ? 'nhân viên' : 'lead';

  return (
    <div
      data-testid="staff-detail-view"
      style={{
        padding: '20px 28px',
        maxWidth: 820,
        margin: '0 auto',
        overflowY: 'auto',
        height: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          borderBottom: '1px solid var(--border, #e9eaee)',
          paddingBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <UserOutlined style={{ fontSize: 20, color: 'var(--accent, #3871e1)' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {staffRecord.name || `Chi tiết ${noun}`}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--fg-secondary, #5f6269)' }}>
              {isEmployee ? 'Nhân viên AI thực thi' : 'AI Lead điều phối'} • ID: {staffId}
            </div>
          </div>
        </div>

        <Button
          type="primary"
          icon={<SaveOutlined />}
          disabled={!valid}
          loading={saving}
          onClick={handleSave}
          data-testid="staff-detail-save-btn"
        >
          {`Lưu ${noun}`}
        </Button>
      </div>

      {isEmployee && sharedTeamCount > 0 && (
        <Alert type="info" showIcon message={SHARED_EDIT_COPY} style={{ marginBottom: 16 }} />
      )}

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Tên</div>
          <Input
            value={form.name}
            maxLength={60}
            onChange={(e) => setField('name', e.target.value)}
            aria-label="Tên"
            placeholder="Tên hiển thị..."
          />
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Vai trò</div>
          <Input
            value={form.role}
            maxLength={60}
            placeholder="VD: Chuyên viên phân tích nghiệp vụ"
            onChange={(e) => setField('role', e.target.value)}
            aria-label="Vai trò"
          />
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
            Mô tả năng lực (lead nhìn thấy để giao việc)
          </div>
          <Input.TextArea
            rows={2}
            maxLength={300}
            value={form.capability}
            onChange={(e) => setField('capability', e.target.value)}
            aria-label="Mô tả năng lực (lead nhìn thấy)"
            placeholder="Năng lực chính..."
          />
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Persona (Prompt hệ thống)</div>
          <Input.TextArea
            rows={8}
            value={form.persona}
            onChange={(e) => setField('persona', e.target.value)}
            aria-label="Persona"
            style={{ fontFamily: CODE_FONT, fontSize: 12 }}
            placeholder="Nhập system prompt chi tiết quy định phong cách làm việc..."
          />
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Mô hình AI</div>
          <Select
            showSearch
            style={{ width: '100%' }}
            value={form.model || null}
            onChange={(value: string) => setField('model', value)}
            options={models.map((model) => ({ label: model, value: model }))}
            aria-label="Mô hình"
            placeholder="Chọn mô hình AI..."
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
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Kỹ năng quy trình (Skill)</div>
            <Select
              allowClear
              showSearch
              style={{ width: '100%' }}
              value={form.skillId}
              onChange={(value?: string) => setField('skillId', value)}
              options={skills.map((skill) => ({ label: skill.name, value: skill.id }))}
              aria-label="Kỹ năng"
              placeholder="Chọn kỹ năng chuẩn..."
            />
          </div>
        )}
      </Space>
    </div>
  );
};

export default StaffDetailView;
