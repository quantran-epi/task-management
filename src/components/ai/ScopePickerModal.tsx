import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Modal, Input, Segmented, List, Tag, Typography, Select, Space, Empty, theme } from 'antd';
import {
  SearchOutlined,
  CheckSquareOutlined,
  BranchesOutlined,
  ApartmentOutlined,
  GlobalOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Task, ChangeRequest, System } from '../../types/models';
import type { ActiveScope } from '../../context/AIChatContext';

const { Text } = Typography;

export interface ScopePickerModalProps {
  open: boolean;
  onClose: () => void;
  currentScope: ActiveScope;
  onSelectScope: (scope: ActiveScope) => void;
  db?: TaskPlannerDatabase;
}

type ScopeTab = 'all' | 'task' | 'cr' | 'system';

interface ScopeListItem {
  id: string;
  type: 'global' | 'task' | 'cr' | 'system';
  title: string;
  subtitle?: string | undefined;
  status?: string | undefined;
  crId?: string | undefined;
  crName?: string | undefined;
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
  const [selectedCrId, setSelectedCrId] = useState<string | null>(null);
  const inputRef = useRef<any>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveTab('all');
      setSelectedCrId(null);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // Live queries for tasks, change requests, and systems
  const tasks = useLiveQuery<Task[]>(() => db.tasks.toArray(), [db]) ?? [];
  const changeRequests = useLiveQuery<ChangeRequest[]>(() => db.changeRequests.toArray(), [db]) ?? [];
  const systems = useLiveQuery<System[]>(() => db.systems.toArray(), [db]) ?? [];

  const crMap = useMemo(() => {
    const map = new Map<string, ChangeRequest>();
    for (const c of changeRequests) {
      map.set(c.id, c);
    }
    return map;
  }, [changeRequests]);

  // Build items list
  const filteredItems = useMemo<ScopeListItem[]>(() => {
    const q = query.trim().toLowerCase();
    const items: ScopeListItem[] = [];

    // Global option
    if (activeTab === 'all' && !selectedCrId) {
      if (!q || 'toàn cục không gắn global'.includes(q)) {
        items.push({
          id: 'global',
          type: 'global',
          title: 'Toàn cục (Không gắn)',
          subtitle: 'Hỏi đáp chung, không nạp dữ liệu chi tiết của tác vụ vào prompt',
        });
      }
    }

    // Change requests
    if (activeTab === 'all' || activeTab === 'cr') {
      if (!selectedCrId) {
        for (const c of changeRequests) {
          if (c.status === 'Done' || c.status === 'Cancelled') continue;
          if (q && !c.name.toLowerCase().includes(q) && !c.code.toLowerCase().includes(q)) continue;
          items.push({
            id: c.id,
            type: 'cr',
            title: c.name,
            subtitle: `CR • ${c.code} • ${c.status}`,
            status: c.status,
          });
        }
      }
    }

    // Systems
    if (activeTab === 'all' || activeTab === 'system') {
      for (const s of systems) {
        if (selectedCrId) {
          const cr = crMap.get(selectedCrId);
          if (!cr || !cr.targets.some((t) => t.systemId === s.id)) continue;
        }
        if (q && !s.name.toLowerCase().includes(q) && !s.code.toLowerCase().includes(q)) continue;
        const parentCr = selectedCrId ? crMap.get(selectedCrId) : undefined;
        items.push({
          id: s.id,
          type: 'system',
          title: s.name,
          subtitle: `Subsystem • ${s.code} • ${s.type}${parentCr ? ` • [${parentCr.code}]` : ''}`,
          crId: parentCr?.id,
          crName: parentCr?.name,
        });
      }
    }

    // Tasks
    if (activeTab === 'all' || activeTab === 'task') {
      for (const t of tasks) {
        if (t.status === 'Done' || t.status === 'Cancelled') continue;
        if (selectedCrId && t.crId !== selectedCrId) continue;
        const parentCr = t.crId ? crMap.get(t.crId) : undefined;
        if (q && !t.name.toLowerCase().includes(q) && !(parentCr && parentCr.name.toLowerCase().includes(q))) {
          continue;
        }
        items.push({
          id: t.id,
          type: 'task',
          title: t.name,
          subtitle: `Tác vụ • ${t.status} • Ưu tiên: ${t.priority}${parentCr ? ` • [${parentCr.code}]` : ''}`,
          status: t.status,
          crId: t.crId,
          crName: parentCr?.name,
        });
      }
    }

    return items;
  }, [query, activeTab, selectedCrId, tasks, changeRequests, systems, crMap]);

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
      case 'cr':
        return <BranchesOutlined style={{ color: '#fa8c16', fontSize: 16 }} />;
      case 'system':
        return <ApartmentOutlined style={{ color: '#722ed1', fontSize: 16 }} />;
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
          placeholder="Tìm kiếm tác vụ, CR, subsystem..."
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
              { label: 'CR', value: 'cr' },
              { label: 'Subsystem', value: 'system' },
            ]}
          />

          {(activeTab === 'all' || activeTab === 'task' || activeTab === 'system') && (
            <Select
              allowClear
              placeholder="Lọc theo CR"
              value={selectedCrId}
              onChange={(val) => setSelectedCrId(val ?? null)}
              style={{ minWidth: 160, flex: 1 }}
              size="middle"
              options={changeRequests.map((c) => ({ label: `${c.code} · ${c.name}`, value: c.id }))}
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
                    key={`${item.type}:${item.id ?? 'global'}`}
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
