import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Modal, Input, Segmented, List, Tag, Typography, Select, Space, Empty, theme } from 'antd';
import {
  SearchOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
  FlagOutlined,
  GlobalOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Task, Project, Milestone } from '../../types/models';
import type { ActiveScope } from '../../context/AIChatContext';

const { Text } = Typography;

export interface ScopePickerModalProps {
  open: boolean;
  onClose: () => void;
  currentScope: ActiveScope;
  onSelectScope: (scope: ActiveScope) => void;
  db?: TaskPlannerDatabase;
}

type ScopeTab = 'all' | 'task' | 'project' | 'milestone';

interface ScopeListItem {
  id: string;
  type: 'global' | 'task' | 'project' | 'milestone';
  title: string;
  subtitle?: string | undefined;
  status?: string | undefined;
  projectId?: string | undefined;
  projectName?: string | undefined;
}

export const ScopePickerModal: React.FC<ScopePickerModalProps> = ({
  open,
  onClose,
  currentScope,
  onSelectScope,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ScopeTab>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const inputRef = useRef<any>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveTab('all');
      setSelectedProjectId(null);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // Live queries for tasks, projects, milestones
  const tasks = useLiveQuery<Task[]>(() => db.tasks.toArray(), [db]) ?? [];
  const projects = useLiveQuery<Project[]>(() => db.projects.toArray(), [db]) ?? [];
  const milestones = useLiveQuery<Milestone[]>(() => db.milestones.toArray(), [db]) ?? [];

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) {
      map.set(p.id, p);
    }
    return map;
  }, [projects]);

  // Build items list
  const filteredItems = useMemo<ScopeListItem[]>(() => {
    const q = query.trim().toLowerCase();
    const items: ScopeListItem[] = [];

    // Global option
    if (activeTab === 'all' && !selectedProjectId) {
      if (!q || 'toàn cục không gắn global'.includes(q)) {
        items.push({
          id: 'global',
          type: 'global',
          title: 'Toàn cục (Không gắn)',
          subtitle: 'Hỏi đáp chung, không nạp dữ liệu chi tiết của tác vụ vào prompt',
        });
      }
    }

    // Projects
    if (activeTab === 'all' || activeTab === 'project') {
      if (!selectedProjectId) {
        for (const p of projects) {
          if (p.status === 'Done' || p.status === 'Cancelled') continue;
          if (q && !p.name.toLowerCase().includes(q)) continue;
          items.push({
            id: p.id,
            type: 'project',
            title: p.name,
            subtitle: `Dự án • ${p.status}`,
            status: p.status,
          });
        }
      }
    }

    // Milestones
    if (activeTab === 'all' || activeTab === 'milestone') {
      for (const m of milestones) {
        if (m.status === 'Done' || m.status === 'Cancelled') continue;
        if (selectedProjectId && m.projectId !== selectedProjectId) continue;
        const parentP = projectMap.get(m.projectId);
        if (q && !m.name.toLowerCase().includes(q) && !(parentP && parentP.name.toLowerCase().includes(q))) {
          continue;
        }
        items.push({
          id: m.id,
          type: 'milestone',
          title: m.name,
          subtitle: `Cột mốc • ${m.status}${parentP ? ` • [${parentP.name}]` : ''}`,
          status: m.status,
          projectId: m.projectId,
          projectName: parentP?.name,
        });
      }
    }

    // Tasks
    if (activeTab === 'all' || activeTab === 'task') {
      for (const t of tasks) {
        if (t.status === 'Done' || t.status === 'Cancelled') continue;
        if (selectedProjectId && t.projectId !== selectedProjectId) continue;
        const parentP = t.projectId ? projectMap.get(t.projectId) : undefined;
        if (q && !t.name.toLowerCase().includes(q) && !(parentP && parentP.name.toLowerCase().includes(q))) {
          continue;
        }
        items.push({
          id: t.id,
          type: 'task',
          title: t.name,
          subtitle: `Tác vụ • ${t.status} • Ưu tiên: ${t.priority}${parentP ? ` • [${parentP.name}]` : ''}`,
          status: t.status,
          projectId: t.projectId,
          projectName: parentP?.name,
        });
      }
    }

    return items;
  }, [query, activeTab, selectedProjectId, tasks, projects, milestones, projectMap]);

  const handleSelect = (item: ScopeListItem) => {
    if (item.type === 'global') {
      onSelectScope({ type: 'global' });
    } else {
      onSelectScope({
        type: item.type,
        id: item.id,
        title: item.title,
      });
    }
    onClose();
  };

  const isCurrent = (item: ScopeListItem) => {
    if (item.type === 'global') {
      return currentScope.type === 'global';
    }
    return currentScope.type === item.type && currentScope.id === item.id;
  };

  const getIcon = (type: ScopeListItem['type']) => {
    switch (type) {
      case 'global':
        return <GlobalOutlined style={{ color: token.colorPrimary, fontSize: 16 }} />;
      case 'task':
        return <CheckSquareOutlined style={{ color: '#52c41a', fontSize: 16 }} />;
      case 'project':
        return <ProjectOutlined style={{ color: '#fa8c16', fontSize: 16 }} />;
      case 'milestone':
        return <FlagOutlined style={{ color: '#722ed1', fontSize: 16 }} />;
    }
  };

  return (
    <Modal
      title={
        <Space>
          <SearchOutlined style={{ color: token.colorPrimary }} />
          <span>Chọn phạm vi ngữ cảnh AI</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnHidden
      style={{ top: 80 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <Input
          ref={inputRef}
          prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
          placeholder="Tìm kiếm tác vụ, dự án, cột mốc..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
          size="middle"
          aria-label="Tìm kiếm ngữ cảnh"
        />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Segmented
            value={activeTab}
            onChange={(val) => setActiveTab(val as ScopeTab)}
            options={[
              { label: 'Tất cả', value: 'all' },
              { label: 'Tác vụ', value: 'task' },
              { label: 'Dự án', value: 'project' },
              { label: 'Cột mốc', value: 'milestone' },
            ]}
          />

          {(activeTab === 'all' || activeTab === 'task' || activeTab === 'milestone') && (
            <Select
              allowClear
              placeholder="Lọc theo dự án"
              value={selectedProjectId}
              onChange={(val) => setSelectedProjectId(val ?? null)}
              style={{ minWidth: 160, flex: 1 }}
              size="middle"
              options={projects.map((p) => ({ label: p.name, value: p.id }))}
            />
          )}
        </div>

        <div
          style={{
            maxHeight: 380,
            overflowY: 'auto',
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 8,
          }}
        >
          {filteredItems.length === 0 ? (
            <div style={{ padding: 24 }}>
              <Empty description="Không tìm thấy mục phù hợp" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          ) : (
            <List
              dataSource={filteredItems}
              renderItem={(item) => {
                const selected = isCurrent(item);
                return (
                  <List.Item
                    onClick={() => handleSelect(item)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      backgroundColor: selected ? token.colorFillAlter : undefined,
                      transition: 'background-color 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    }}
                    className="scope-picker-item"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      {getIcon(item.type)}
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Text
                            strong={selected}
                            style={{
                              fontSize: 13,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.title}
                          </Text>
                          {item.status && (
                            <Tag style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '18px' }}>
                              {item.status}
                            </Tag>
                          )}
                        </div>
                        {item.subtitle && (
                          <Text
                            type="secondary"
                            style={{
                              fontSize: 11,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.subtitle}
                          </Text>
                        )}
                      </div>
                    </div>
                    {selected && (
                      <Tag color="blue" icon={<CheckOutlined />} style={{ marginLeft: 8 }}>
                        Đang chọn
                      </Tag>
                    )}
                  </List.Item>
                );
              }}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};
