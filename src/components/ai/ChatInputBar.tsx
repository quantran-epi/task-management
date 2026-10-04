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
  PaperClipOutlined,
  FileTextOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Task, Project, Note } from '../../types/models';
import { isTauriApp } from '../../utils/timerPopout';

export interface ChatInputBarProps {
  onSubmit: (text: string) => void;
  onClear?: (() => void) | undefined;
  onClearAll?: (() => void) | undefined;
  onStop?: (() => void) | undefined;
  isStreaming?: boolean | undefined;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  autoFocus?: boolean | undefined;
  db?: TaskPlannerDatabase | undefined;
  attachedFiles?: string[] | undefined;
  onAttachFile?: ((filePath: string) => void) | undefined;
  onRemoveFile?: ((filePath: string) => void) | undefined;
}

const COMMANDS = [
  {
    name: 'clear',
    icon: <ClearOutlined style={{ color: '#ff4d4f' }} />,
    title: '/clear',
    description: 'Xóa lịch sử và làm mới ngữ cảnh trò chuyện',
  },
  {
    name: 'clear-all',
    icon: <ClearOutlined style={{ color: '#ff4d4f' }} />,
    title: '/clear-all',
    description: 'Xóa toàn bộ lịch sử trò chuyện AI trên mọi phạm vi',
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
  {
    name: 'file',
    icon: <PaperClipOutlined style={{ color: '#13c2c2' }} />,
    title: '/file',
    description: 'Tham chiếu hoặc đính kèm tập tin từ máy tính (@file)',
  },
  {
    name: 'doc',
    icon: <FileTextOutlined style={{ color: '#1677ff' }} />,
    title: '/doc',
    description: 'Tham chiếu tài liệu tri thức (@doc:)',
  },
];

export function parseFileInputPath(text: string): string {
  let inputPath = text;
  if (text.startsWith('file:')) {
    inputPath = text.slice(5);
  } else if (text.startsWith('file')) {
    inputPath = text.slice(4).replace(/^[:\s]+/, '');
  }
  if (!inputPath || inputPath === '~') {
    return '~/';
  }
  return inputPath;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  onSubmit,
  onClear,
  onClearAll,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder = 'Hỏi AI... (@, @file, #, /)',
  autoFocus = false,
  db = defaultDb,
  attachedFiles = [],
  onAttachFile,
  onRemoveFile,
}) => {
  const { token } = theme.useToken();
  const [value, setValue] = useState('');
  const [searchInfo, setSearchInfo] = useState<{ text: string; prefix: string }>({
    text: '',
    prefix: '',
  });
  const [fileSuggestions, setFileSuggestions] = useState<
    Array<{ path: string; name: string; is_dir: boolean }>
  >([]);

  const mentionsRef = useRef<MentionsRef>(null);
  const isSubmittingRef = useRef(false);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tasks = useLiveQuery<Task[]>(() => db.tasks?.toArray() ?? [], [db]) ?? [];
  const projects = useLiveQuery<Project[]>(() => db.projects?.toArray() ?? [], [db]) ?? [];
  const documents = useLiveQuery<Note[]>(
    async () => {
      if (!db.notes) return [];
      return await db.notes
        .filter((n: Note) => !n.deletedAt && (n.type === 'document' || !n.type))
        .toArray();
    },
    [db]
  ) ?? [];

  useEffect(() => {
    return () => {
      if (submitTimerRef.current) {
        clearTimeout(submitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const { prefix, text } = searchInfo;
    const isFileQuery =
      prefix === '@' &&
      (text.startsWith('file') || text.startsWith('/') || text.startsWith('~') || text.startsWith('.'));

    if (!isFileQuery) {
      setFileSuggestions([]);
      return;
    }

    const inputPath = parseFileInputPath(text);

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        if (isTauriApp()) {
          const api = await import('@tauri-apps/api/core');
          const results = await api.invoke<Array<{ path: string; name: string; is_dir: boolean }>>(
            'complete_local_path',
            { input: inputPath }
          );
          if (!cancelled) {
            setFileSuggestions(results || []);
          }
        }
      } catch (err) {
        console.warn('[ChatInputBar] Local path autocomplete error:', err);
      }
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchInfo]);

  useEffect(() => {
    if (autoFocus && !disabled && !isStreaming) {
      const timer = setTimeout(() => {
        mentionsRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, disabled, isStreaming]);

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

  const handlePickFile = async () => {
    try {
      if (isTauriApp()) {
        const api = await import('@tauri-apps/api/core');
        const selected = await api.invoke<string | null>('select_local_file');
        if (selected) {
          if (onAttachFile) {
            onAttachFile(selected);
          } else {
            const fileName = selected.split(/[/\\]/).pop() || selected;
            const ref = `[${fileName}](file:${selected}) `;
            setValue((prev) => (prev ? `${prev.trimEnd()} ${ref}` : ref));
          }
          setTimeout(() => {
            mentionsRef.current?.focus();
          }, 50);
        }
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = (e: any) => {
          const file = e.target?.files?.[0];
          if (file) {
            if (onAttachFile) {
              onAttachFile(file.name);
            } else {
              const ref = `[${file.name}](file:${file.name}) `;
              setValue((prev) => (prev ? `${prev.trimEnd()} ${ref}` : ref));
            }
          }
        };
        input.click();
      }
    } catch (err) {
      console.warn('[ChatInputBar] File selection error:', err);
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

    if (trimmed === '/clear-all') {
      onClearAll?.();
      return;
    }

    if (trimmed === '/file') {
      handlePickFile();
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
      } else if (rawText === '/clear-all') {
        onClearAll?.();
      } else if (rawText === '/file') {
        handlePickFile();
      } else {
        onSubmit(rawText);
      }
    }
  };

  const handleSelect = (option: any) => {
    if (option.key === 'cmd-file') {
      setValue((prev) => (prev ? `${prev.replace(/\/file\s*$/, '')}@file:~/` : '@file:~/'));
      setSearchInfo({ text: 'file:~/', prefix: '@' });
      setTimeout(() => {
        const textarea =
          mentionsRef.current?.textarea ||
          (mentionsRef.current as any)?.nativeElement?.querySelector?.('textarea');
        if (textarea) {
          textarea.focus();
          textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: '/' }));
        }
      }, 50);
      return;
    }

    if (option.key === 'cmd-doc' || option.key === 'mention-doc-entry') {
      setValue((prev) => {
        const clean = prev.replace(/\/doc\s*$/, '').trimEnd();
        return clean ? `${clean} @doc:` : '@doc:';
      });
      setSearchInfo({ text: 'doc:', prefix: '@' });
      setTimeout(() => {
        const textarea =
          mentionsRef.current?.textarea ||
          (mentionsRef.current as any)?.nativeElement?.querySelector?.('textarea');
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ':' }));
        }
      }, 50);
      return;
    }

    if (option.isDir || option.key === 'mention-file-entry') {
      const dirPath = option.key === 'mention-file-entry'
        ? '~/'
        : (option.filePath?.endsWith('/') ? option.filePath : `${option.filePath}/`);
      const cleanMention = `@file:${dirPath}`;

      setValue((prev) => {
        const nextVal = prev.replace(/@file:[^\s]+\s*$/, cleanMention);
        return nextVal.includes('@file:') ? nextVal : `${prev.trimEnd()} ${cleanMention}`.trimStart();
      });
      setSearchInfo({ text: `file:${dirPath}`, prefix: '@' });

      setTimeout(() => {
        const textarea =
          mentionsRef.current?.textarea ||
          (mentionsRef.current as any)?.nativeElement?.querySelector?.('textarea');
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: '/' }));
        }
      }, 50);
    }
  };

  const activePrefixes = useMemo(() => {
    const textarea =
      mentionsRef.current?.textarea ||
      (mentionsRef.current as any)?.nativeElement?.querySelector?.('textarea');
    const cursorPos = textarea ? textarea.selectionStart : value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastSpace = Math.max(textBeforeCursor.lastIndexOf(' '), textBeforeCursor.lastIndexOf('\n'));
    const currentToken = lastSpace === -1 ? textBeforeCursor : textBeforeCursor.slice(lastSpace + 1);

    if (currentToken.startsWith('@') || currentToken.startsWith('#')) {
      return ['@', '#'];
    }
    return ['@', '#', '/'];
  }, [value]);

  const handleSearch = (text: string, prefix: string) => {
    setSearchInfo({ text, prefix });
  };

  const options = useMemo(() => {
    const { prefix, text } = searchInfo;
    const q = text.trim().toLowerCase();

    if (prefix === '@') {
      const isDocMode = text.startsWith('doc:') || text.startsWith('doc');

      if (isDocMode) {
        const docQuery = text.startsWith('doc:')
          ? text.slice(4).trim().toLowerCase()
          : text.slice(3).replace(/^[:\s]+/, '').trim().toLowerCase();

        const docOptions = documents
          .filter((d) => {
            if (!docQuery) return true;
            const titleMatch = d.title?.toLowerCase().includes(docQuery);
            const tagMatch = d.tags?.some((t) => t.toLowerCase().includes(docQuery));
            return Boolean(titleMatch || tagMatch);
          })
          .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
          .slice(0, 15)
          .map((d) => ({
            key: `doc-${d.id}`,
            value: `@[${d.title || 'Untitled Document'}](doc:${d.id})`,
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
                  <FileTextOutlined style={{ color: '#1677ff', flexShrink: 0 }} />
                  <span
                    style={{
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.title || 'Untitled Document'}
                  </span>
                  {d.tags && d.tags.length > 0 && (
                    <Tag
                      color="blue"
                      style={{
                        margin: 0,
                        fontSize: 10,
                        lineHeight: '16px',
                        padding: '0 4px',
                      }}
                    >
                      {d.tags[0]}
                    </Tag>
                  )}
                </div>
                <Tag
                  style={{
                    margin: 0,
                    fontSize: 10,
                    lineHeight: '16px',
                    padding: '0 4px',
                  }}
                >
                  Tài liệu
                </Tag>
              </div>
            ),
          }));

        return docOptions;
      }

      const isFileMode =
        text.startsWith('file') ||
        text.startsWith('/') ||
        text.startsWith('~') ||
        text.startsWith('.');

      if (isFileMode) {
        if (!isTauriApp()) {
          return [
            {
              key: 'file-web-sandbox',
              value: text,
              disabled: true,
              label: (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 0',
                    color: '#faad14',
                  }}
                >
                  <WarningOutlined style={{ flexShrink: 0 }} />
                  <span>Autocomplete tập tin máy tính cần chạy app desktop Tauri (dùng icon 📎 để đính kèm trên Web)</span>
                </div>
              ),
            },
          ];
        }

        if (fileSuggestions.length > 0) {
          return fileSuggestions.map((s) => ({
            key: `file-${s.path}`,
            isDir: s.is_dir,
            filePath: s.path,
            value: s.is_dir
              ? `file:${s.path.endsWith('/') ? s.path : `${s.path}/`}`
              : `[${s.name}](file:${s.path})`,
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
                  {s.is_dir ? (
                    <FolderOutlined style={{ color: '#fa8c16', flexShrink: 0 }} />
                  ) : (
                    <FileTextOutlined style={{ color: '#52c41a', flexShrink: 0 }} />
                  )}
                  <span
                    style={{
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.name}{s.is_dir && !s.name.endsWith('/') ? '/' : ''}
                  </span>
                </div>
                <span
                  style={{
                    color: '#8c8c8c',
                    fontSize: 11,
                    flexShrink: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 160,
                  }}
                >
                  {s.path}
                </span>
              </div>
            ),
          }));
        }

        return [
          {
            key: 'file-empty-hint',
            value: text,
            disabled: true,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', color: '#8c8c8c' }}>
                <FileTextOutlined />
                <span>Không tìm thấy hoặc đang tải tập tin trong: {parseFileInputPath(text)}</span>
              </div>
            ),
          },
        ];
      }

      const taskOptions = tasks
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

      const docHintOption = {
        key: 'mention-doc-entry',
        value: 'doc:',
        label: (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 0',
              borderTop: `1px dashed ${token.colorBorderSecondary}`,
              marginTop: 4,
              paddingTop: 4,
            }}
          >
            <FileTextOutlined style={{ color: '#1677ff', flexShrink: 0 }} />
            <span style={{ fontWeight: 500, color: '#1677ff' }}>Tham chiếu tài liệu tri thức... (@doc:)</span>
          </div>
        ),
      };

      const fileHintOption = {
        key: 'mention-file-entry',
        isDir: true,
        filePath: '~/',
        value: 'file:~/',
        label: (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 0',
              marginTop: 2,
              paddingTop: 2,
            }}
          >
            <PaperClipOutlined style={{ color: '#13c2c2', flexShrink: 0 }} />
            <span style={{ fontWeight: 500, color: '#13c2c2' }}>Tham chiếu tập tin máy tính... (@file)</span>
          </div>
        ),
      };

      return [...taskOptions, docHintOption, fileHintOption];
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
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {attachedFiles && attachedFiles.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 6,
              maxHeight: 72,
              overflowY: 'auto',
            }}
          >
            {attachedFiles.map((filePath) => {
              const fileName = filePath.split(/[/\\]/).pop() || filePath;
              return (
                <Tag
                  key={filePath}
                  closable
                  onClose={() => onRemoveFile?.(filePath)}
                  icon={<FileTextOutlined style={{ color: '#52c41a' }} />}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    maxWidth: 240,
                    margin: 0,
                  }}
                >
                  <Tooltip title={filePath}>
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fileName}
                    </span>
                  </Tooltip>
                </Tag>
              );
            })}
          </div>
        )}
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
          onSelect={handleSelect}
          prefix={activePrefixes}
          placement="top"
          options={options}
          filterOption={false}
          validateSearch={(text) => !text.includes('\n') && text.length <= 150}
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
              lineHeight: '22px',
              padding: '4px 11px',
              resize: 'none',
            },
          }}
          style={{
            width: '100%',
            borderRadius: 8,
            fontSize: 14,
          }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <Tooltip title="Tham chiếu tập tin cục bộ">
          <Button
            type="text"
            icon={<PaperClipOutlined />}
            onClick={handlePickFile}
            disabled={disabled || isStreaming}
            aria-label="Tham chiếu tập tin"
            style={{ height: 32, width: 32, padding: 0 }}
          />
        </Tooltip>
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
