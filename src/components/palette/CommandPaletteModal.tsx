import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Input, List, Tag, Typography, Space, Empty, Button } from 'antd';
import {
  SearchOutlined,
  AppstoreOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
  FileTextOutlined,
  PlusOutlined,
  CalendarOutlined,
  BarChartOutlined,
  SettingOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { AppRoute, NavigateFunction } from '../../types/navigation';
import type { Task, Project, Note } from '../../types/models';

const { Text } = Typography;

export interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate: NavigateFunction;
  onOpenTask?: (taskId: string) => void;
  onOpenProject?: (project: Project) => void;
  onCreateTask?: (taskName?: string) => void;
  db?: TaskPlannerDatabase;
}

interface PaletteItem {
  id: string;
  category: 'view' | 'action' | 'task' | 'project' | 'note';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  open,
  onClose,
  onNavigate,
  onOpenTask,
  onOpenProject,
  onCreateTask,
  db = defaultDb,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<any>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Live queries for tasks, projects, notes
  const tasks = useLiveQuery<Task[]>(() => db.tasks.toArray(), [db]) ?? [];
  const projects = useLiveQuery<Project[]>(() => db.projects.toArray(), [db]) ?? [];
  const notes = useLiveQuery<Note[]>(() => db.notes.toArray(), [db]) ?? [];

  // Static Views and Actions
  const staticItems = useMemo<PaletteItem[]>(() => {
    return [
      {
        id: 'view-dashboard',
        category: 'view',
        title: 'Tổng quan (Dashboard)',
        subtitle: 'Chuyển đến màn hình chính',
        icon: <DashboardOutlined style={{ color: '#1677ff' }} />,
        action: () => {
          onNavigate('dashboard');
          onClose();
        },
      },
      {
        id: 'view-tasks',
        category: 'view',
        title: 'Công việc (Tasks)',
        subtitle: 'Xem và quản lý tất cả nhiệm vụ',
        icon: <CheckSquareOutlined style={{ color: '#52c41a' }} />,
        action: () => {
          onNavigate('tasks');
          onClose();
        },
      },
      {
        id: 'view-projects',
        category: 'view',
        title: 'Dự án & Mốc (Projects)',
        subtitle: 'Quản lý dự án, mốc và phân loại',
        icon: <ProjectOutlined style={{ color: '#fa8c16' }} />,
        action: () => {
          onNavigate('projects');
          onClose();
        },
      },
      {
        id: 'view-planner',
        category: 'view',
        title: 'Lập kế hoạch tuần (Planner)',
        subtitle: 'Phân bổ giờ và công suất tuần',
        icon: <CalendarOutlined style={{ color: '#722ed1' }} />,
        action: () => {
          onNavigate('planner');
          onClose();
        },
      },
      {
        id: 'view-analytics',
        category: 'view',
        title: 'Báo cáo & Thống kê (Analytics)',
        subtitle: 'Biểu đồ tiến độ, năng suất và phân tích',
        icon: <BarChartOutlined style={{ color: '#13c2c2' }} />,
        action: () => {
          onNavigate('analytics');
          onClose();
        },
      },
      {
        id: 'view-notes',
        category: 'view',
        title: 'Ghi chú nhanh (Notes)',
        subtitle: 'Xem danh sách ghi chú và tệp đính kèm',
        icon: <FileTextOutlined style={{ color: '#eb2f96' }} />,
        action: () => {
          onNavigate('notes');
          onClose();
        },
      },
      {
        id: 'view-settings',
        category: 'view',
        title: 'Cài đặt (Settings)',
        subtitle: 'Cấu hình công suất, sao lưu và thông báo',
        icon: <SettingOutlined style={{ color: '#8c8c8c' }} />,
        action: () => {
          onNavigate('settings');
          onClose();
        },
      },
      {
        id: 'action-create-task',
        category: 'action',
        title: 'Tạo công việc mới',
        subtitle: 'Mở cửa sổ thêm nhanh tác vụ',
        icon: <PlusOutlined style={{ color: '#1677ff' }} />,
        action: () => {
          onClose();
          onCreateTask?.();
        },
      },
    ];
  }, [onNavigate, onClose, onCreateTask]);

  // Dynamic search items
  const filteredItems = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();

    const taskItems: PaletteItem[] = tasks.map((t) => ({
      id: `task-${t.id}`,
      category: 'task',
      title: t.name,
      subtitle: `${t.status} • ${t.priority} ${t.jiraKey ? `• [${t.jiraKey}]` : ''}`,
      icon: <CheckSquareOutlined style={{ color: t.status === 'Done' ? '#52c41a' : '#1677ff' }} />,
      action: () => {
        onClose();
        onOpenTask?.(t.id);
      },
    }));

    const projectItems: PaletteItem[] = projects.map((p) => ({
      id: `project-${p.id}`,
      category: 'project',
      title: p.name,
      subtitle: `Dự án • ${p.status}`,
      icon: <ProjectOutlined style={{ color: '#fa8c16' }} />,
      action: () => {
        onClose();
        onOpenProject?.(p);
      },
    }));

    const noteItems: PaletteItem[] = notes.map((n) => ({
      id: `note-${n.id}`,
      category: 'note',
      title: n.title || (n.body.length > 50 ? n.body.slice(0, 50) + '...' : n.body),
      subtitle: 'Ghi chú',
      icon: <FileTextOutlined style={{ color: '#eb2f96' }} />,
      action: () => {
        onClose();
        onNavigate('notes');
      },
    }));

    const all = [...staticItems, ...taskItems, ...projectItems, ...noteItems];

    if (!q) {
      // Default: show static views/actions and top tasks/projects
      return [...staticItems, ...taskItems.slice(0, 5), ...projectItems.slice(0, 3)];
    }

    // Filter items
    const matched = all.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q))
    );

    // If query has text, also offer quick create task action with this name
    if (q.length > 0) {
      const quickCreate: PaletteItem = {
        id: 'action-quick-create',
        category: 'action',
        title: `Tạo công việc: "${query.trim()}"`,
        subtitle: 'Nhấn Enter để tạo nhanh',
        icon: <PlusOutlined style={{ color: '#52c41a' }} />,
        action: () => {
          onClose();
          onCreateTask?.(query.trim());
        },
      };
      return [quickCreate, ...matched];
    }

    return matched;
  }, [query, staticItems, tasks, projects, notes, onClose, onOpenTask, onOpenProject, onNavigate, onCreateTask]);

  // Keep selected index within bounds
  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = filteredItems[selectedIndex];
      if (current) {
        current.action();
      }
    }
  };

  const getCategoryTag = (cat: PaletteItem['category']) => {
    switch (cat) {
      case 'view':
        return <Tag color="blue">Màn hình</Tag>;
      case 'action':
        return <Tag color="green">Thao tác</Tag>;
      case 'task':
        return <Tag color="cyan">Tác vụ</Tag>;
      case 'project':
        return <Tag color="orange">Dự án</Tag>;
      case 'note':
        return <Tag color="magenta">Ghi chú</Tag>;
      default:
        return null;
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      destroyOnClose
      width={600}
      style={{ top: 80 }}
      styles={{
        body: { padding: '12px' },
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input
          ref={inputRef}
          size="large"
          prefix={<SearchOutlined style={{ color: '#8c8c8c', fontSize: 18 }} />}
          placeholder="Tìm công việc, dự án, màn hình, lệnh... (gõ để tìm hoặc tạo)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          aria-label="Tìm kiếm lệnh toàn cục"
          allowClear
        />

        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {filteredItems.length === 0 ? (
            <Empty description="Không tìm thấy kết quả phù hợp" style={{ margin: '24px 0' }} />
          ) : (
            <List
              size="small"
              dataSource={filteredItems}
              renderItem={(item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <List.Item
                    key={item.id}
                    onClick={() => item.action()}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      cursor: 'pointer',
                      padding: '8px 12px',
                      borderRadius: 6,
                      backgroundColor: isSelected ? '#e6f4ff' : 'transparent',
                      transition: 'background-color 0.15s ease',
                      borderBottom: '1px solid #f0f0f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Space style={{ overflow: 'hidden' }}>
                      <span style={{ fontSize: 18, display: 'flex', alignItems: 'center' }}>
                        {item.icon}
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <Text strong style={{ fontSize: 14 }}>
                          {item.title}
                        </Text>
                        {item.subtitle && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {item.subtitle}
                          </Text>
                        )}
                      </div>
                    </Space>
                    <div>{getCategoryTag(item.category)}</div>
                  </List.Item>
                );
              }}
            />
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 8,
            borderTop: '1px solid #f0f0f0',
            fontSize: 12,
            color: '#8c8c8c',
          }}
        >
          <Space size="middle">
            <span>
              <kbd style={{ padding: '2px 4px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fafafa' }}>
                ↑
              </kbd>{' '}
              <kbd style={{ padding: '2px 4px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fafafa' }}>
                ↓
              </kbd>{' '}
              để chuyển
            </span>
            <span>
              <kbd style={{ padding: '2px 4px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fafafa' }}>
                Enter
              </kbd>{' '}
              để chọn
            </span>
            <span>
              <kbd style={{ padding: '2px 4px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fafafa' }}>
                Esc
              </kbd>{' '}
              để đóng
            </span>
          </Space>
          <span>Cmd+K / Ctrl+K</span>
        </div>
      </div>
    </Modal>
  );
};
