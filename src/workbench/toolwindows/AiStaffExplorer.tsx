import React, { useMemo, useState } from 'react';
import { Input, Button, Tag, Typography, Tooltip } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  UserOutlined,
  CrownOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { listEmployees, listLeads } from '../../db/repositories/aiOfficeRepo';
import { useLayoutStore } from '../store/layoutStore';
import {
  EmployeeEditorDrawer,
  LeadEditorDrawer,
} from '../../components/ai/office/EmployeeEditorDrawer';

export interface AiStaffExplorerProps {
  db?: TaskPlannerDatabase | undefined;
}

export const AiStaffExplorer: React.FC<AiStaffExplorerProps> = ({ db = defaultDb }) => {
  const [search, setSearch] = useState('');
  const [createKind, setCreateKind] = useState<'employee' | 'lead' | null>(null);

  const openTab = useLayoutStore((s) => s.openTab);

  const employees = useLiveQuery(() => listEmployees(db), [db]) ?? [];
  const leads = useLiveQuery(() => listLeads(db), [db]) ?? [];

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

  const handleOpenStaff = (id: string, name: string, roleType: 'employee' | 'lead') => {
    openTab({
      id: `staff_detail:${id}`,
      title: name || (roleType === 'employee' ? 'AI Employee' : 'AI Lead'),
      viewType: 'staff_detail',
      closable: true,
      params: { staffId: id, role: roleType },
    });
  };

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
          placeholder="Tìm staff..."
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
              <div
                key={lead.id}
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
              <div
                key={emp.id}
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
            ))
          )}
        </div>
      </div>

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
    </div>
  );
};

export default AiStaffExplorer;
