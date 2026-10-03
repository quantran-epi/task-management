import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Mentions, Button, Tooltip, Tag, theme } from 'antd';
import type { MentionsRef } from 'antd';
import {
  SendOutlined,
  StopOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
  ClearOutlined,
  CalendarOutlined,
  DashboardOutlined,
  WarningOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Task, Project } from '../../types/models';

export interface ChatInputBarProps {
  onSubmit: (text: string) => void;
  onClear?: (() => void) | undefined;
  onStop?: (() => void) | undefined;
  isStreaming?: boolean | undefined;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  db?: TaskPlannerDatabase | undefined;
}

const COMMANDS = [
  {
    name: 'clear',
    icon: <ClearOutlined style={{ color: '#ff4d4f' }} />,
    title: '/clear',
    description: 'Xóa lịch sử và làm mới ngữ cảnh trò chuyện',
  },
  {
    name: 'plan',
    icon: <CalendarOutlined style={{ color: '#1677ff' }} />,
    title: '/plan',
    description: 'Đề xuất kế hoạch phân bổ thời gian hôm nay',
  },
  {
    name: 'status',
    icon: <DashboardOutlined style={{ color: '#52c41a' }} />,
    title: '/status',
    description: 'Tóm tắt tiến độ công việc và tác vụ hiện tại',
  },
  {
    name: 'overdue',
    icon: <WarningOutlined style={{ color: '#faad14' }} />,
    title: '/overdue',
    description: 'Kiểm tra các tác vụ đã quá hạn hoặc sắp đến hạn',
  },
  {
    name: 'help',
    icon: <QuestionCircleOutlined style={{ color: '#13c2c2' }} />,
    title: '/help',
    description: 'Xem hướng dẫn sử dụng và danh sách công cụ AI',
  },
];

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  onSubmit,
  onClear,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder = 'Hỏi AI, gõ @ cho task, # cho project, / cho lệnh... (Cmd+Enter để gửi)',
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [value, setValue] = useState('');
  const [searchInfo, setSearchInfo] = useState<{ text: string; prefix: string }>({
    text: '',
    prefix: '',
  });

  const mentionsRef = useRef<MentionsRef>(null);
  const isSubmittingRef = useRef(false);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tasks = useLiveQuery<Task[]>(() => db.tasks?.toArray() ?? [], [db]) ?? [];
  const projects = useLiveQuery<Project[]>(() => db.projects?.toArray() ?? [], [db]) ?? [];

  useEffect(() => {
    return () => {
      if (submitTimerRef.current) {
        clearTimeout(submitTimerRef.current);
      }
    };
  }, []);

  const clearInput = (el?: HTMLTextAreaElement | null) => {
    setValue('');
    if (el && 'value' in el) {
      el.value = '';
    }
    const nativeArea =
      mentionsRef.current?.textarea ||
      (mentionsRef.current as any)?.nativeElement?.querySelector?.('textarea');
    if (nativeArea && 'value' in nativeArea) {
      nativeArea.value = '';
    }
  };

  const handleSend = (targetEl?: HTMLTextAreaElement) => {
    const rawVal = value || targetEl?.value || '';
    const trimmed = rawVal.trim();
    if (!trimmed) return;

    clearInput(targetEl);

    if (trimmed === '/clear') {
      onClear?.();
      return;
    }

    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      const rawText = value.trim() || el?.value?.trim() || '';
      if (!rawText) return;

      isSubmittingRef.current = true;
      clearInput(el);

      if (submitTimerRef.current) {
        clearTimeout(submitTimerRef.current);
      }

      // Hold lock across microtasks and subsequent IME/browser input macrotask cycles
      submitTimerRef.current = setTimeout(() => {
        clearInput();
        isSubmittingRef.current = false;
      }, 250);

      if (rawText === '/clear') {
        onClear?.();
      } else {
        onSubmit(rawText);
      }
    }
  };

  const handleSearch = (text: string, prefix: string) => {
    setSearchInfo({ text, prefix });
  };

  const options = useMemo(() => {
    const { prefix, text } = searchInfo;
    const q = text.trim().toLowerCase();

    if (prefix === '@') {
      return tasks
        .filter((t) => {
          if (t.status === 'Cancelled') return false;
          if (!q) return true;
          return (
            t.name.toLowerCase().includes(q) ||
            (t.jiraKey && t.jiraKey.toLowerCase().includes(q))
          );
        })
        .sort((a, b) => {
          const aOpen = a.status !== 'Done' ? 1 : 0;
          const bOpen = b.status !== 'Done' ? 1 : 0;
          if (aOpen !== bOpen) return bOpen - aOpen;
          return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        })
        .slice(0, 15)
        .map((t) => ({
          key: `task-${t.id}`,
          value: `[${t.name}](task:${t.id})`,
          label: (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '2px 0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <CheckSquareOutlined style={{ color: '#1677ff', flexShrink: 0 }} />
                <span
                  style={{
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.name}
                </span>
                {t.jiraKey && (
                  <Tag
                    color="blue"
                    style={{
                      margin: 0,
                      fontSize: 10,
                      lineHeight: '16px',
                      padding: '0 4px',
                    }}
                  >
                    {t.jiraKey}
                  </Tag>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <Tag
                  style={{
                    margin: 0,
                    fontSize: 10,
                    lineHeight: '16px',
                    padding: '0 4px',
                  }}
                >
                  {t.status}
                </Tag>
              </div>
            </div>
          ),
        }));
    }

    if (prefix === '#') {
      return projects
        .filter((p) => {
          if (p.status === 'Cancelled') return false;
          if (!q) return true;
          return (
            p.name.toLowerCase().includes(q) ||
            (p.jiraEpicKey && p.jiraEpicKey.toLowerCase().includes(q))
          );
        })
        .sort((a, b) => {
          const aActive = a.status !== 'Done' ? 1 : 0;
          const bActive = b.status !== 'Done' ? 1 : 0;
          if (aActive !== bActive) return bActive - aActive;
          return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        })
        .slice(0, 10)
        .map((p) => ({
          key: `project-${p.id}`,
          value: `[${p.name}](project:${p.id})`,
          label: (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '2px 0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <ProjectOutlined style={{ color: '#722ed1', flexShrink: 0 }} />
                <span
                  style={{
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.name}
                </span>
                {p.jiraEpicKey && (
                  <Tag
                    color="purple"
                    style={{
                      margin: 0,
                      fontSize: 10,
                      lineHeight: '16px',
                      padding: '0 4px',
                    }}
                  >
                    {p.jiraEpicKey}
                  </Tag>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <Tag
                  style={{
                    margin: 0,
                    fontSize: 10,
                    lineHeight: '16px',
                    padding: '0 4px',
                  }}
                >
                  {p.status}
                </Tag>
              </div>
            </div>
          ),
        }));
    }

    if (prefix === '/') {
      return COMMANDS.filter((cmd) => {
        if (!q) return true;
        return (
          cmd.name.toLowerCase().includes(q) ||
          cmd.description.toLowerCase().includes(q)
        );
      }).map((cmd) => ({
        key: `cmd-${cmd.name}`,
        value: `${cmd.name}`,
        label: (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '2px 0',
            }}
          >
            {cmd.icon}
            <span style={{ fontWeight: 600, minWidth: 65 }}>{cmd.title}</span>
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>{cmd.description}</span>
          </div>
        ),
      }));
    }

    return [];
  }, [searchInfo, tasks, projects]);

  return (
    <div
      style={{
        padding: '10px 14px',
        backgroundColor: token.colorBgContainer,
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <Mentions
          ref={mentionsRef}
          value={value}
          onChange={(newVal) => {
            if (isSubmittingRef.current) {
              clearInput();
              return;
            }
            setValue(newVal);
          }}
          onInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
            if (isSubmittingRef.current) {
              const target = e.target as HTMLTextAreaElement;
              clearInput(target);
            }
          }}
          onCompositionEnd={(e: React.CompositionEvent<HTMLTextAreaElement>) => {
            if (isSubmittingRef.current) {
              const target = e.target as HTMLTextAreaElement;
              clearInput(target);
            }
          }}
          onSearch={handleSearch}
          prefix={['@', '#', '/']}
          placement="top"
          options={options}
          filterOption={false}
          validateSearch={(text) => !text.includes('\n') && text.length <= 40}
          notFoundContent={null}
          autoSize={{ minRows: 1, maxRows: 5 }}
          placeholder={placeholder}
          aria-label="Nội dung tin nhắn trò chuyện AI"
          disabled={disabled || isStreaming}
          onKeyDown={handleKeyDown}
          styles={{
            popup: {
              zIndex: 1300,
              minWidth: 280,
              maxWidth: 480,
            },
            textarea: {
              fontSize: 14,
              borderRadius: 8,
            },
          }}
          style={{
            width: '100%',
            borderRadius: 8,
            fontSize: 14,
          }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {isStreaming ? (
          <Tooltip title="Dừng sinh phản hồi">
            <Button
              type="primary"
              danger
              icon={<StopOutlined />}
              onClick={onStop}
              aria-label="Dừng sinh phản hồi"
              style={{ height: 32 }}
            >
              Dừng
            </Button>
          </Tooltip>
        ) : (
          <Tooltip title="Gửi tin nhắn (Cmd+Enter)">
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => handleSend()}
              disabled={disabled || !value.trim()}
              aria-label="Gửi tin nhắn"
              style={{ height: 32 }}
            >
              Gửi
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};
