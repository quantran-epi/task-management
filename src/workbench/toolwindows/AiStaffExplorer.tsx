import React, { useMemo, useState } from 'react';
import { Alert, Input, Button, Tag, Typography, Tooltip, Dropdown, Modal, type MenuProps } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  UserOutlined,
  CrownOutlined,
  EditOutlined,
  DeleteOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  deleteEmployee,
  deleteLead,
  deleteSkill,
  listEmployees,
  listLeads,
  listSkills,
  type AiOfficeDeleteResult,
} from '../../db/repositories/aiOfficeRepo';
import { useLayoutStore } from '../store/layoutStore';
import {
  EmployeeEditorDrawer,
  LeadEditorDrawer,
} from '../../components/ai/office/EmployeeEditorDrawer';
import { SkillCard } from '../../components/ai/office/SkillCard';
import { SkillEditorDrawer } from '../../components/ai/office/SkillEditorDrawer';
import { refusalMessage } from '../../components/ai/office/deleteRefusalMessage';
import type { AiSkill } from '../../types/aiOffice';

export interface AiStaffExplorerProps {
  db?: TaskPlannerDatabase | undefined;
}

export const AiStaffExplorer: React.FC<AiStaffExplorerProps> = ({ db = defaultDb }) => {
  const [search, setSearch] = useState('');
  /**
   * D-31/D-33: the ONE open/closed source for all three drawers. A second `drawer` flag
   * would drift and leave a create button opening nothing.
   */
  const [createKind, setCreateKind] = useState<'employee' | 'lead' | 'skill' | null>(null);
  /** Create vs edit for the skill drawer. Never decides whether the drawer is open. */
  const [editingSkill, setEditingSkill] = useState<AiSkill | null>(null);
  /** D-10/D-11/D-12: the refusal copy names the blocking groups/agents, never a UUID. */
  const [refusal, setRefusal] = useState<string | null>(null);

  const openTab = useLayoutStore((s) => s.openTab);

  const employees = useLiveQuery(() => listEmployees(db), [db]) ?? [];
  const leads = useLiveQuery(() => listLeads(db), [db]) ?? [];
  const skills = useLiveQuery(() => listSkills(db), [db]) ?? [];
  /** T-39-30: one query reduced into a Map — never one query per card. */
  const pendingRows =
    useLiveQuery(() => db.aiSkillVersions.where('status').equals('pending').toArray(), [db]) ?? [];

  const query = search.trim().toLowerCase();
  const matches = (...values: Array<string | undefined>) =>
    !query || values.some((val) => (val ?? '').toLowerCase().includes(query));

  const filteredEmployees = useMemo(
    () => employees.filter((e) => matches(e.name, e.role, e.model)),
    [employees, query]
  );
  const filteredLeads = useMemo(
    () => leads.filter((l) => matches(l.name, l.role, l.model)),
    [leads, query]
  );
  const filteredSkills = useMemo(
    () => skills.filter((s) => matches(s.name, s.description)),
    [skills, query]
  );

  /** T-39-30: derived from the one `employees` read, not one count query per skill. */
  const agentCountBySkill = useMemo(() => {
    const counts = new Map<string, number>();
    for (const emp of employees) {
      if (!emp.skillId) continue;
      counts.set(emp.skillId, (counts.get(emp.skillId) ?? 0) + 1);
    }
    return counts;
  }, [employees]);

  const pendingCountBySkill = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of pendingRows) {
      counts.set(row.skillId, (counts.get(row.skillId) ?? 0) + 1);
    }
    return counts;
  }, [pendingRows]);

  const handleOpenStaff = (id: string, name: string, roleType: 'employee' | 'lead') => {
    openTab({
      id: `staff_detail:${id}`,
      title: name || (roleType === 'employee' ? 'AI Employee' : 'AI Lead'),
      viewType: 'staff_detail',
      closable: true,
      params: { staffId: id, role: roleType },
    });
  };

  const applyRefusal = (result: AiOfficeDeleteResult) => setRefusal(refusalMessage(result));

  /**
   * T-39-28: `SkillCard`'s own `Popconfirm` already asked. Routing this through
   * `confirmDelete` would stack a second `Modal.confirm` on top of it.
   */
  const handleDeleteSkill = async (skill: AiSkill) => {
    applyRefusal(await deleteSkill(skill.id, db));
  };

  /**
   * Confirms, then lets the repo decide. A refusal is not an error dialog: the row is still
   * there and the alert names what blocks it, so the user knows which roster to edit first.
   */
  const confirmDelete = (name: string, run: () => Promise<AiOfficeDeleteResult>) => {
    Modal.confirm({
      title: `Xóa «${name}»?`,
      content: 'Nếu hồ sơ còn được dùng, thao tác sẽ bị chặn và bạn cần gỡ khỏi nhóm trước.',
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => applyRefusal(await run()),
    });
  };

  const staffMenu = (
    id: string,
    name: string,
    roleType: 'employee' | 'lead'
  ): NonNullable<MenuProps['items']> => [
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: 'Mở chi tiết',
      onClick: () => handleOpenStaff(id, name, roleType),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined style={{ color: 'var(--danger, #c54e58)' }} />,
      danger: true,
      label: 'Xóa',
      onClick: () =>
        confirmDelete(name, () =>
          roleType === 'lead' ? deleteLead(id, db) : deleteEmployee(id, db)
        ),
    },
  ];

  return (
    <div
      data-testid="ai-staff-explorer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--bg-island, #ffffff)',
      }}
    >
      {/* Search and Action Bar */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--border, #e9eaee)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Input
          size="small"
          prefix={<SearchOutlined style={{ color: 'var(--fg-muted, #6c707e)' }} />}
          placeholder="Tìm lead, nhân viên, kỹ năng..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ flex: 1, fontSize: 12 }}
        />
        <Tooltip title="Thêm Lead AI">
          <Button
            size="small"
            type="text"
            icon={<CrownOutlined style={{ color: '#d97706' }} />}
            onClick={() => setCreateKind('lead')}
            aria-label="Thêm Lead AI"
          />
        </Tooltip>
        <Tooltip title="Thêm Nhân viên AI">
          <Button
            size="small"
            type="text"
            icon={<PlusOutlined />}
            onClick={() => setCreateKind('employee')}
            aria-label="Thêm Nhân viên AI"
          />
        </Tooltip>
        <Tooltip title="Thêm Kỹ năng">
          <Button
            size="small"
            type="text"
            icon={<BookOutlined style={{ color: 'var(--accent, #5b4fe8)' }} />}
            onClick={() => {
              setEditingSkill(null);
              setCreateKind('skill');
            }}
            aria-label="Thêm Kỹ năng"
            data-testid="ai-staff-skill-create"
          />
        </Tooltip>
      </div>

      {/* Staff List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '6px 8px',
        }}
      >
        {/* Section: AI Leads */}
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 6px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--fg-secondary, #5f6269)',
              letterSpacing: '0.04em',
            }}
          >
            <span>AI Leads ({filteredLeads.length})</span>
          </div>

          {filteredLeads.length === 0 ? (
            <div style={{ padding: '6px 8px', fontSize: 12, color: 'var(--fg-muted, #8c8f9c)' }}>
              Chưa có AI Lead
            </div>
          ) : (
            filteredLeads.map((lead) => (
              <Dropdown key={lead.id} menu={{ items: staffMenu(lead.id, lead.name, 'lead') }} trigger={['contextMenu']}>
              <div
                role="button"
                tabIndex={0}
                data-testid={`ai-staff-lead-${lead.id}`}
                onClick={() => handleOpenStaff(lead.id, lead.name, 'lead')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleOpenStaff(lead.id, lead.name, 'lead');
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  marginBottom: 2,
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-selected, #f0f2f5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}>
                  <CrownOutlined style={{ fontSize: 13, color: '#d97706', flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Typography.Text
                      ellipsis
                      style={{ fontSize: 12, fontWeight: 500, display: 'block', lineHeight: 1.3 }}
                    >
                      {lead.name}
                    </Typography.Text>
                    <Typography.Text
                      ellipsis
                      type="secondary"
                      style={{ fontSize: 11, display: 'block', lineHeight: 1.2 }}
                    >
                      {lead.role}
                    </Typography.Text>
                  </div>
                </div>
                <Tag style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }} color="orange">
                  Lead
                </Tag>
              </div>
              </Dropdown>
            ))
          )}
        </div>

        {/* Section: AI Employees */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 6px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--fg-secondary, #5f6269)',
              letterSpacing: '0.04em',
            }}
          >
            <span>Nhân viên AI ({filteredEmployees.length})</span>
          </div>

          {filteredEmployees.length === 0 ? (
            <div style={{ padding: '6px 8px', fontSize: 12, color: 'var(--fg-muted, #8c8f9c)' }}>
              Chưa có nhân viên AI
            </div>
          ) : (
            filteredEmployees.map((emp) => (
              <Dropdown key={emp.id} menu={{ items: staffMenu(emp.id, emp.name, 'employee') }} trigger={['contextMenu']}>
              <div
                role="button"
                tabIndex={0}
                data-testid={`ai-staff-employee-${emp.id}`}
                onClick={() => handleOpenStaff(emp.id, emp.name, 'employee')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleOpenStaff(emp.id, emp.name, 'employee');
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  marginBottom: 2,
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-selected, #f0f2f5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}>
                  <UserOutlined style={{ fontSize: 13, color: 'var(--accent, #3871e1)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Typography.Text
                      ellipsis
                      style={{ fontSize: 12, fontWeight: 500, display: 'block', lineHeight: 1.3 }}
                    >
                      {emp.name}
                    </Typography.Text>
                    <Typography.Text
                      ellipsis
                      type="secondary"
                      style={{ fontSize: 11, display: 'block', lineHeight: 1.2 }}
                    >
                      {emp.role}
                    </Typography.Text>
                  </div>
                </div>
                {emp.model && (
                  <Tag style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>
                    {emp.model}
                  </Tag>
                )}
              </div>
              </Dropdown>
            ))
          )}
        </div>

        {/* Section: Kỹ năng — D-31/D-33: the only skill CRUD entry point in the app. */}
        <div data-testid="ai-staff-skills-section" style={{ marginTop: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 6px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--fg-secondary, #5f6269)',
              letterSpacing: '0.04em',
            }}
          >
            <span>Kỹ năng ({filteredSkills.length})</span>
          </div>

          {filteredSkills.length === 0 ? (
            <div style={{ padding: '6px 8px', fontSize: 12, color: 'var(--fg-muted, #8c8f9c)' }}>
              Chưa có kỹ năng nào
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredSkills.map((skill) => (
                <div key={skill.id} data-testid={`ai-staff-skill-${skill.id}`}>
                  <SkillCard
                    skill={skill}
                    agentCount={agentCountBySkill.get(skill.id) ?? 0}
                    pendingCount={pendingCountBySkill.get(skill.id) ?? 0}
                    onEdit={() => {
                      setEditingSkill(skill);
                      setCreateKind('skill');
                    }}
                    onDelete={() => void handleDeleteSkill(skill)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {refusal && (
        <div style={{ padding: '0 8px 8px' }}>
          <Alert
            type="warning"
            showIcon
            closable
            message={refusal}
            onClose={() => setRefusal(null)}
            data-testid="ai-staff-delete-error"
          />
        </div>
      )}

      <EmployeeEditorDrawer
        open={createKind === 'employee'}
        employee={null}
        onCancel={() => setCreateKind(null)}
        onSaved={() => setCreateKind(null)}
        db={db}
      />
      <LeadEditorDrawer
        open={createKind === 'lead'}
        lead={null}
        onCancel={() => setCreateKind(null)}
        onSaved={() => setCreateKind(null)}
        db={db}
      />
      <SkillEditorDrawer
        open={createKind === 'skill'}
        skill={editingSkill}
        onCancel={() => {
          setCreateKind(null);
          setEditingSkill(null);
        }}
        onSaved={() => {
          setCreateKind(null);
          setEditingSkill(null);
        }}
        db={db}
      />
    </div>
  );
};

export default AiStaffExplorer;
