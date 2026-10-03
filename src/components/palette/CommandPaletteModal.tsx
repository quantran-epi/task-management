import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Input, List, Tag, Typography, Space, Empty, Button, Tooltip } from 'antd';
import {
  SearchOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
  FlagOutlined,
  FileTextOutlined,
  PlusOutlined,
  CalendarOutlined,
  BarChartOutlined,
  SettingOutlined,
  DashboardOutlined,
  QuestionCircleOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useAIChat } from '../../context/AIChatContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { NavigateFunction } from '../../types/navigation';
import type { Task, Project, Milestone, Note } from '../../types/models';

const { Text } = Typography;

export interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate: NavigateFunction;
  onOpenTask?: (taskId: string) => void;
  onOpenProject?: (project: Project) => void;
  onOpenMilestone?: (milestone: Milestone) => void;
  onOpenNote?: (note: Note) => void;
  onCreateTask?: (taskName?: string) => void;
  db?: TaskPlannerDatabase;
}

export interface PaletteItem {
  id: string;
  category: 'view' | 'action' | 'task' | 'project' | 'milestone' | 'note';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
}

export const CHEATSHEET_ENTRIES = [
  { prefix: '>', name: 'Màn hình', desc: 'Chỉ tìm các trang / màn hình chức năng', example: '> tasks, > planner' },
  { prefix: '@', name: 'Tác vụ', desc: 'Chỉ tìm kiếm danh sách công việc', example: '@ họp sprint, @ refactor' },
  { prefix: '#', name: 'Dự án', desc: 'Chỉ tìm kiếm danh sách dự án & cột mốc', example: '# website, # mobile app' },
  { prefix: '!', name: 'Ghi chú', desc: 'Chỉ tìm kiếm ghi chú và nội dung đính kèm', example: '! auth, ! api' },
  { prefix: '+', name: 'Tạo việc', desc: 'Tạo ngay một tác vụ mới với tên đã nhập', example: '+ Soạn hợp đồng quý 4' },
  { prefix: '?', name: 'Trợ lý AI', desc: 'Mở Trợ lý AI hoặc hỏi nhanh câu hỏi', example: '? làm sao tối ưu tuần này' },
];

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  open,
  onClose,
  onNavigate,
  onOpenTask,
  onOpenProject,
  onOpenMilestone,
  onOpenNote,
  onCreateTask,
  db = defaultDb,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const inputRef = useRef<any>(null);
  const { openChat } = useAIChat();

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setShowCheatsheet(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Live queries for tasks, projects, notes, milestones
  const tasks = useLiveQuery<Task[]>(() => db.tasks.toArray(), [db]) ?? [];
  const projects = useLiveQuery<Project[]>(() => db.projects.toArray(), [db]) ?? [];
  const milestones = useLiveQuery<Milestone[]>(() => db.milestones.toArray(), [db]) ?? [];
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
        id: 'action-open-ai',
        category: 'action',
        title: 'Trợ lý AI (AI Chat)',
        subtitle: 'Mở cửa sổ trợ lý AI phân tích và hỗ trợ (Cmd+J)',
        icon: <RobotOutlined style={{ color: '#722ed1' }} />,
        action: () => {
          onClose();
          openChat();
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

  // Dynamic search items with prefix filtering
  const filteredItems = useMemo<PaletteItem[]>(() => {
    const raw = query.trim();
    const q = raw.toLowerCase();

    // Check prefixes
    const isViewOnly = q.startsWith('>') || q.startsWith('/');
    const isTaskOnly = q.startsWith('@');
    const isProjectOnly = q.startsWith('#');
    const isNoteOnly = q.startsWith('!');
    const isCreateOnly = q.startsWith('+');
    const isAiOnly = (q.startsWith('?') && q.length > 1) || q.startsWith('ai ');

    let cleanQuery = q;
    if (isViewOnly || isTaskOnly || isProjectOnly || isNoteOnly || isCreateOnly) {
      cleanQuery = q.slice(1).trim();
    } else if (isAiOnly) {
      cleanQuery = q.startsWith('?') ? q.slice(1).trim() : q.slice(3).trim();
    }

    // AI shortcut
    if (isAiOnly) {
      const prompt = raw.startsWith('?') ? raw.slice(1).trim() : raw.slice(3).trim();
      return [
        {
          id: 'action-ai-prompt',
          category: 'action',
          title: prompt ? `Hỏi Trợ lý AI: "${prompt}"` : 'Mở Trợ lý AI (Cmd+J)',
          subtitle: prompt ? 'Gửi trực tiếp tới Trợ lý AI ở ngữ cảnh Toàn cục' : 'Nhấn Enter để mở cửa sổ trò chuyện AI',
          icon: <RobotOutlined style={{ color: '#722ed1' }} />,
          action: () => {
            onClose();
            openChat({ type: 'global' }, prompt || undefined);
          },
        },
      ];
    }

    // Quick create shortcut
    if (isCreateOnly) {
      const taskName = raw.slice(1).trim();
      return [
        {
          id: 'action-quick-create-prefix',
          category: 'action',
          title: taskName ? `Tạo công việc: "${taskName}"` : 'Tạo công việc mới (gõ tiếp tên)',
          subtitle: 'Nhấn Enter để tạo nhanh',
          icon: <PlusOutlined style={{ color: '#52c41a' }} />,
          action: () => {
            if (taskName) {
              onClose();
              onCreateTask?.(taskName);
            }
          },
        },
      ];
    }

    const taskItems: PaletteItem[] = tasks.map((t) => ({
      id: `task-${t.id}`,
      category: 'task',
      title: t.name,
      subtitle: `${t.status} • ${t.priority} ${t.jiraKey ? `• [${t.jiraKey}]` : ''}`,
      icon: <CheckSquareOutlined style={{ color: t.status === 'Done' ? '#52c41a' : '#1677ff' }} />,
      action: () => {
        onClose();
        onNavigate('insight', { type: 'task', id: t.id });
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
        onNavigate('insight', { type: 'project', id: p.id });
      },
    }));

    const milestoneItems: PaletteItem[] = milestones.map((m) => {
      const parentProj = projects.find((p) => p.id === m.projectId);
      return {
        id: `milestone-${m.id}`,
        category: 'milestone',
        title: m.name,
        subtitle: `Cột mốc • ${m.status}${parentProj ? ` • [${parentProj.name}]` : ''}`,
        icon: <FlagOutlined style={{ color: '#faad14' }} />,
        action: () => {
          onClose();
          onNavigate('insight', { type: 'milestone', id: m.id });
        },
      };
    });

    const noteItems: PaletteItem[] = notes.map((n) => ({
      id: `note-${n.id}`,
      category: 'note',
      title: n.title || (n.body.length > 50 ? n.body.slice(0, 50) + '...' : n.body),
      subtitle: 'Ghi chú',
      icon: <FileTextOutlined style={{ color: '#eb2f96' }} />,
      action: () => {
        onClose();
        if (onOpenNote) {
          onOpenNote(n);
        } else {
          onNavigate('notes');
        }
      },
    }));

    // Filter by specific prefix
    if (isViewOnly) {
      if (!cleanQuery) return staticItems;
      return staticItems.filter((i) => i.title.toLowerCase().includes(cleanQuery) || i.subtitle?.toLowerCase().includes(cleanQuery));
    }

    if (isTaskOnly) {
      if (!cleanQuery) return taskItems.slice(0, 10);
      return taskItems.filter((i) => i.title.toLowerCase().includes(cleanQuery) || i.subtitle?.toLowerCase().includes(cleanQuery));
    }

    if (isProjectOnly) {
      const combined = [...projectItems, ...milestoneItems];
      if (!cleanQuery) return combined.slice(0, 10);
      return combined.filter((i) => i.title.toLowerCase().includes(cleanQuery) || i.subtitle?.toLowerCase().includes(cleanQuery));
    }

    if (isNoteOnly) {
      if (!cleanQuery) return noteItems.slice(0, 10);
      return noteItems.filter((i) => i.title.toLowerCase().includes(cleanQuery) || i.subtitle?.toLowerCase().includes(cleanQuery));
    }

    // Default global search
    const all = [...staticItems, ...taskItems, ...projectItems, ...milestoneItems, ...noteItems];

    if (!cleanQuery) {
      return [...staticItems, ...taskItems.slice(0, 5), ...projectItems.slice(0, 3)];
    }

    const matched = all.filter(
      (item) =>
        item.title.toLowerCase().includes(cleanQuery) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(cleanQuery))
    );

    if (cleanQuery.length > 0) {
      const quickCreate: PaletteItem = {
        id: 'action-quick-create',
        category: 'action',
        title: `Tạo công việc: "${raw}"`,
        subtitle: 'Nhấn Enter để tạo nhanh',
        icon: <PlusOutlined style={{ color: '#52c41a' }} />,
        action: () => {
          onClose();
          onCreateTask?.(raw);
        },
      };
      return [quickCreate, ...matched];
    }

    return matched;
  }, [query, staticItems, tasks, projects, milestones, notes, onClose, onOpenTask, onOpenProject, onOpenMilestone, onOpenNote, onNavigate, onCreateTask]);

  // Keep selected index within bounds
  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCheatsheet) {
      if (e.key === 'Escape') {
        setShowCheatsheet(false);
      }
      return;
    }

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
      case 'milestone':
        return <Tag color="gold">Cột mốc</Tag>;
      case 'note':
        return <Tag color="magenta">Ghi chú</Tag>;
      default:
        return null;
    }
  };

  const isAskingCheatsheet = query.trim() === '?' || showCheatsheet;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      destroyOnClose
      width={660}
      style={{ top: 80 }}
      styles={{
        body: { padding: '12px' },
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Search input bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input
            ref={inputRef}
            size="large"
            prefix={<SearchOutlined style={{ color: '#8c8c8c', fontSize: 18 }} />}
            placeholder="Tìm công việc, dự án, màn hình, lệnh... (gõ '?' để xem cú pháp)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            aria-label="Tìm kiếm lệnh toàn cục"
            allowClear
            style={{ flex: 1 }}
          />
          <Tooltip title={isAskingCheatsheet ? 'Đóng hướng dẫn' : 'Bảng tra cứu cú pháp (?)'}>
            <Button
              type={isAskingCheatsheet ? 'primary' : 'default'}
              icon={<QuestionCircleOutlined />}
              onClick={() => setShowCheatsheet((prev) => !prev)}
              aria-label="Hướng dẫn cú pháp"
            />
          </Tooltip>
        </div>

        {/* Quick prefix filter buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text type="secondary" style={{ fontSize: 12, marginRight: 2 }}>
            Bộ lọc nhanh:
          </Text>
          <Tag
            color={query.startsWith('>') ? 'blue' : 'default'}
            style={{ cursor: 'pointer', margin: 0 }}
            onClick={() => setQuery('> ')}
          >
            &gt; Màn hình
          </Tag>
          <Tag
            color={query.startsWith('@') ? 'cyan' : 'default'}
            style={{ cursor: 'pointer', margin: 0 }}
            onClick={() => setQuery('@ ')}
          >
            @ Tác vụ
          </Tag>
          <Tag
            color={query.startsWith('#') ? 'orange' : 'default'}
            style={{ cursor: 'pointer', margin: 0 }}
            onClick={() => setQuery('# ')}
          >
            # Dự án
          </Tag>
          <Tag
            color={query.startsWith('!') ? 'magenta' : 'default'}
            style={{ cursor: 'pointer', margin: 0 }}
            onClick={() => setQuery('! ')}
          >
            ! Ghi chú
          </Tag>
          <Tag
            color={query.startsWith('+') ? 'green' : 'default'}
            style={{ cursor: 'pointer', margin: 0 }}
            onClick={() => setQuery('+ ')}
          >
            + Tạo việc
          </Tag>
        </div>

        {/* Main Content: Cheatsheet or Filtered List */}
        {isAskingCheatsheet ? (
          <div
            style={{
              maxHeight: 380,
              overflowY: 'auto',
              padding: '8px 4px',
              backgroundColor: '#fafafa',
              borderRadius: 6,
              border: '1px solid #f0f0f0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 8px' }}>
              <Text strong style={{ fontSize: 14 }}>
                📖 Hướng dẫn cú pháp Command Palette
              </Text>
              <Button size="small" type="text" onClick={() => { setShowCheatsheet(false); if (query === '?') setQuery(''); }}>
                Đóng hướng dẫn
              </Button>
            </div>

            <List
              size="small"
              dataSource={CHEATSHEET_ENTRIES}
              renderItem={(item) => (
                <List.Item
                  style={{
                    cursor: 'pointer',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onClick={() => {
                    setQuery(`${item.prefix} `);
                    setShowCheatsheet(false);
                    inputRef.current?.focus();
                  }}
                >
                  <Space size="middle">
                    <kbd
                      style={{
                        padding: '2px 8px',
                        border: '1px solid #d9d9d9',
                        borderRadius: 4,
                        background: '#fff',
                        fontWeight: 600,
                        fontSize: 13,
                        color: '#1677ff',
                      }}
                    >
                      {item.prefix}
                    </kbd>
                    <div>
                      <Text strong>{item.name}</Text>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.desc}
                        </Text>
                      </div>
                    </div>
                  </Space>
                  <Text code style={{ fontSize: 12 }}>
                    {item.example}
                  </Text>
                </List.Item>
              )}
            />
          </div>
        ) : (
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
        )}

        {/* Footer info bar */}
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
          <Button
            type="link"
            size="small"
            style={{ padding: 0, fontSize: 12 }}
            onClick={() => setShowCheatsheet((prev) => !prev)}
          >
            {isAskingCheatsheet ? 'Đóng hướng dẫn' : 'Xem phím tắt (?)'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
