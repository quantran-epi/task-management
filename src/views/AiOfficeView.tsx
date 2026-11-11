import React, { useMemo, useState } from 'react';
import { Alert, Button, Empty, Input, Segmented, Space, theme } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import {
  deleteEmployee,
  deleteLead,
  deleteSkill,
  listEmployees,
  listLeads,
  listSkills,
} from '../db/repositories/aiOfficeRepo';
import { PageHeader } from '../components/common/PageHeader';
import { refusalMessage } from '../components/ai/office/deleteRefusalMessage';
import { EmployeeCard, LeadCard } from '../components/ai/office/EmployeeCard';
import { SkillCard } from '../components/ai/office/SkillCard';
import {
  EmployeeEditorDrawer,
  LeadEditorDrawer,
} from '../components/ai/office/EmployeeEditorDrawer';
import { SkillEditorDrawer } from '../components/ai/office/SkillEditorDrawer';
import type { AiEmployee, AiLead, AiSkill } from '../types/aiOffice';

export interface AiOfficeViewProps {
  db?: TaskPlannerDatabase | undefined;
}

type OfficeSegment = 'employees' | 'leads' | 'skills';

const SEGMENT_COPY: Record<
  OfficeSegment,
  { cta: string; placeholder: string; emptyTitle: string; emptyBody: string }
> = {
  employees: {
    cta: 'Tạo nhân viên',
    placeholder: 'Tìm nhân viên theo tên, vai trò...',
    emptyTitle: 'Chưa có nhân viên AI nào',
    emptyBody:
      'Tạo nhân viên đầu tiên với tên, vai trò và persona. Nhân viên dùng chung được cho nhiều nhóm.',
  },
  leads: {
    cta: 'Tạo lead',
    placeholder: 'Tìm lead theo tên, vai trò...',
    emptyTitle: 'Chưa có lead nào',
    emptyBody:
      'Lead phân rã yêu cầu, chia việc và tổng hợp kết quả cho nhóm. Tạo lead trước khi lập nhóm.',
  },
  skills: {
    cta: 'Tạo kỹ năng',
    placeholder: 'Tìm kỹ năng theo tên, mô tả...',
    emptyTitle: 'Chưa có kỹ năng nào',
    emptyBody:
      'Kỹ năng là mẫu prompt gồm tên, mô tả và nội dung Markdown, gán cho một nhân viên. Tạo kỹ năng để nhân viên làm theo quy trình chuẩn.',
  },
};

/**
 * UI-SPEC §1 employee tab. `'agents'` is a shell: the Ghost Dev surface stays mounted
 * behind the second segment, so the phase adds a surface rather than replacing one (T-34-50).
 */
/**
 * D-10/D-11/D-12: the repo decides, the view only renders. Names only — never an id (T-36-15).
 * An empty `usedBy` means a running turn holds the profile (D-13), not a roster reference.
 */

export const AiOfficeView: React.FC<AiOfficeViewProps> = ({ db = defaultDb }) => {
  const { token } = theme.useToken();
  const [segment, setSegment] = useState<OfficeSegment>('employees');
  const [search, setSearch] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<'employee' | 'lead' | 'skill' | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<AiEmployee | null>(null);
  const [editingLead, setEditingLead] = useState<AiLead | null>(null);
  const [editingSkill, setEditingSkill] = useState<AiSkill | null>(null);

  const employees = useLiveQuery(() => listEmployees(db), [db]) ?? [];
  const leads = useLiveQuery(() => listLeads(db), [db]) ?? [];
  const skills = useLiveQuery(() => listSkills(db), [db]) ?? [];
  const members = useLiveQuery(() => db.aiTeamMembers.toArray(), [db]) ?? [];

  const teamCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of members) {
      counts.set(member.agentId, (counts.get(member.agentId) ?? 0) + 1);
    }
    return counts;
  }, [members]);

  const agentCountBySkill = useMemo(() => {
    const counts = new Map<string, number>();
    for (const employee of employees) {
      if (!employee.skillId) continue;
      counts.set(employee.skillId, (counts.get(employee.skillId) ?? 0) + 1);
    }
    return counts;
  }, [employees]);

  const query = search.trim().toLowerCase();
  const matches = (...values: Array<string | undefined>) =>
    !query || values.some((value) => (value ?? '').toLowerCase().includes(query));

  const visibleEmployees = employees.filter((e) => matches(e.name, e.role));
  const visibleLeads = leads.filter((l) => matches(l.name, l.role));
  const visibleSkills = skills.filter((s) => matches(s.name, s.description));

  const copy = SEGMENT_COPY[segment];
  const visibleCount =
    segment === 'employees'
      ? visibleEmployees.length
      : segment === 'leads'
      ? visibleLeads.length
      : visibleSkills.length;

  const openCreate = () => {
    setEditingEmployee(null);
    setEditingLead(null);
    setEditingSkill(null);
    setDrawer(segment === 'employees' ? 'employee' : segment === 'leads' ? 'lead' : 'skill');
  };

  const closeDrawer = () => setDrawer(null);

  const handleDeleteEmployee = async (employee: AiEmployee) => {
    setDeleteError(refusalMessage(await deleteEmployee(employee.id, db)));
  };
  const handleDeleteLead = async (lead: AiLead) => {
    setDeleteError(refusalMessage(await deleteLead(lead.id, db)));
  };
  const handleDeleteSkill = async (skill: AiSkill) => {
    setDeleteError(refusalMessage(await deleteSkill(skill.id, db)));
  };

  const emptyBlock = (
    <div
      style={{
        padding: '48px 16px',
        background: 'var(--bg-island, #ffffff)',
        borderRadius: 8,
        border: '1px solid var(--border, #e9eaee)',
        textAlign: 'center',
      }}
    >
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>{copy.emptyTitle}</div>
            <div
              style={{
                color: 'var(--fg-secondary, #5f6269)',
                maxWidth: 460,
                margin: '0 auto 16px',
              }}
            >
              {copy.emptyBody}
            </div>
          </div>
        }
      >
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {copy.cta}
        </Button>
      </Empty>
    </div>
  );

  return (
    <div
      data-testid="ai-office-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 16,
        background: token.colorBgContainer,
      }}
    >
      <PageHeader
        title="Văn phòng AI"
        subtitle="Nhân viên AI, lead và kỹ năng dùng chung cho mọi nhóm"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {copy.cta}
          </Button>
        }
      />

          <Segmented
            value={segment}
            onChange={(value) => {
              setSegment(value as OfficeSegment);
              setSearch('');
              setDeleteError(null);
            }}
            options={[
              {
                label: <span data-testid="ai-office-segment-employees">Nhân viên</span>,
                value: 'employees',
              },
              { label: <span data-testid="ai-office-segment-leads">Lead</span>, value: 'leads' },
              { label: <span data-testid="ai-office-segment-skills">Kỹ năng</span>, value: 'skills' },
            ]}
          />

          {deleteError && (
            <Alert
              type="warning"
              showIcon
              closable
              data-testid="ai-office-delete-error"
              message={deleteError}
              onClose={() => setDeleteError(null)}
            />
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              background: 'var(--bg-island, #ffffff)',
              borderRadius: 8,
              border: '1px solid var(--border, #e9eaee)',
            }}
          >
            <Space size="middle">
              <Input
                prefix={<SearchOutlined style={{ color: 'var(--fg-muted, #6c707e)' }} />}
                placeholder={copy.placeholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
                style={{ width: 280 }}
              />
            </Space>

            <Button icon={<ReloadOutlined />} onClick={() => setSearch('')}>
              Đặt lại bộ lọc
            </Button>
          </div>

          {visibleCount === 0 ? (
            // WR-07: a search that matches nothing is not an empty collection — showing
            // the "create your first employee" panel here would be factually wrong.
            query ? (
              <Empty description="Không có kết quả phù hợp" />
            ) : (
              emptyBlock
            )
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {segment === 'employees' &&
                visibleEmployees.map((employee) => (
                  <EmployeeCard
                    key={employee.id}
                    employee={employee}
                    skillName={skills.find((s) => s.id === employee.skillId)?.name}
                    teamCount={teamCountByAgent.get(employee.id) ?? 0}
                    onEdit={() => {
                      setEditingEmployee(employee);
                      setDrawer('employee');
                    }}
                    onDelete={() => handleDeleteEmployee(employee)}
                  />
                ))}
              {segment === 'leads' &&
                visibleLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onEdit={() => {
                      setEditingLead(lead);
                      setDrawer('lead');
                    }}
                    onDelete={() => handleDeleteLead(lead)}
                  />
                ))}
              {segment === 'skills' &&
                visibleSkills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    agentCount={agentCountBySkill.get(skill.id) ?? 0}
                    onEdit={() => {
                      setEditingSkill(skill);
                      setDrawer('skill');
                    }}
                    onDelete={() => handleDeleteSkill(skill)}
                  />
                ))}
            </div>
          )}

      <EmployeeEditorDrawer
        open={drawer === 'employee'}
        employee={editingEmployee}
        onCancel={closeDrawer}
        onSaved={closeDrawer}
        db={db}
      />
      <LeadEditorDrawer
        open={drawer === 'lead'}
        lead={editingLead}
        onCancel={closeDrawer}
        onSaved={closeDrawer}
        db={db}
      />
      <SkillEditorDrawer
        open={drawer === 'skill'}
        skill={editingSkill}
        onCancel={closeDrawer}
        onSaved={closeDrawer}
        db={db}
      />
    </div>
  );
};

export default AiOfficeView;
