import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Mentions, Avatar, Button, Tooltip, Tag, Modal, useAntdToken, TextArea } from '../ui';
import type { MentionsRef } from 'antd';
import { SendOutlined, StopOutlined, CheckSquareOutlined, BranchesOutlined, ApartmentOutlined, ClearOutlined, CalendarOutlined, DashboardOutlined, WarningOutlined, QuestionCircleOutlined, FileTextOutlined, FullscreenOutlined, FolderOpenOutlined } from '../ui/icon';
import { StandaloneSshFileBrowser } from './StandaloneSshFileBrowser';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Task, ChangeRequest, System, Note } from '../../types/models';
import { agentColorFor, agentTextColorFor } from './office/AgentAttributionRow';
import { foldForSearch, searchIncludes } from '../../utils/searchText';

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
  onAttachFiles?: ((filePaths: string[]) => void) | undefined;
  onRemoveFile?: ((filePath: string) => void) | undefined;
  /** Retained for caller compatibility; no longer gates attach — SSH browser is on every AI chat surface. */
  isStandaloneChat?: boolean | undefined;
  externalValue?: string | undefined;
  onExternalValueConsumed?: (() => void) | undefined;
  /** Controlled value owned by the tab runtime. Omit for uncontrolled mode. */
  value?: string | undefined;
  onValueChange?: ((next: string) => void) | undefined;
  leadingContent?: React.ReactNode;
  /** Phase 34 D-08: lead-first `@agent` suggestions; absent leaves the bar unchanged. */
  agentOptions?: Array<{ id: string; name: string; role: string; isLead: boolean }> | undefined;
}

const COMMANDS = [
  {
    name: 'clear',
    icon: <ClearOutlined style={{ color: 'var(--danger)' }} />,
    title: '/clear',
    description: 'Xóa lịch sử và làm mới ngữ cảnh trò chuyện',
  },
  {
    name: 'clear-all',
    icon: <ClearOutlined style={{ color: 'var(--danger)' }} />,
    title: '/clear-all',
    description: 'Xóa toàn bộ lịch sử trò chuyện AI trên mọi phạm vi',
  },
  {
    name: 'plan',
    icon: <CalendarOutlined style={{ color: 'var(--accent)' }} />,
    title: '/plan',
    description: 'Đề xuất kế hoạch phân bổ thời gian hôm nay',
  },
  {
    name: 'status',
    icon: <DashboardOutlined style={{ color: 'var(--success)' }} />,
    title: '/status',
    description: 'Tóm tắt tiến độ công việc và tác vụ hiện tại',
  },
  {
    name: 'overdue',
    icon: <WarningOutlined style={{ color: 'var(--warning)' }} />,
    title: '/overdue',
    description: 'Kiểm tra các tác vụ đã quá hạn hoặc sắp đến hạn',
  },
  {
    name: 'help',
    icon: <QuestionCircleOutlined style={{ color: 'var(--info-fg)' }} />,
    title: '/help',
    description: 'Xem hướng dẫn sử dụng và danh sách công cụ AI',
  },
  {
    name: 'doc',
    icon: <FileTextOutlined style={{ color: 'var(--accent)' }} />,
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
  placeholder = 'Hỏi AI... (@, #, /)',
  autoFocus = false,
  db = defaultDb,
  attachedFiles = [],
  onAttachFile,
  onAttachFiles,
  onRemoveFile,
  externalValue,
  onExternalValueConsumed,
  value,
  onValueChange,
  leadingContent,
  agentOptions,
}) => {
  const { token } = useAntdToken();
  const isComposingRef = useRef(false);
  const [internalValue, setInternalValue] = useState(value ?? '');
  // Local mirror drives the DOM. The controlled `value` is a coalesced (~50ms) echo of
  // what we emitted; binding the DOM to it wipes live IME preedit in the echo window.
  const effectiveValue = internalValue;
  const update = (next: string) => {
    setInternalValue(next);
    onValueChange?.(next);
  };
  const [isFullscreenModalOpen, setIsFullscreenModalOpen] = useState(false);
  const [isSshBrowserOpen, setIsSshBrowserOpen] = useState(false);
  // Transient modal scratchpad, not a second draft store: switching tabs unmounts this component
  // (key={activeTabId}) and discards text typed here but never applied.
  const [fullscreenDraft, setFullscreenDraft] = useState('');

  useEffect(() => {
    if (typeof externalValue === 'string') {
      update(externalValue);
      onExternalValueConsumed?.();
    }
  }, [externalValue, onExternalValueConsumed]);

  // Follow the controlled value between edits/remounts, but never mid-IME: the parent's
  // echo is coalesced and can arrive while preedit is live, which would wipe the composition.
  useEffect(() => {
    if (isComposingRef.current) return;
    if (typeof value === 'string' && value !== internalValue) setInternalValue(value);
  }, [value]);

  // During composition the DOM owns the preedit text. Keep local state in step for handlers
  // but defer parent notification to compositionEnd, so no coalesced echo can clobber preedit.
  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };
  const handleCompositionChange = (next: string) => {
    setInternalValue(next);
  };
  const handleCompositionEnd = (next: string) => {
    isComposingRef.current = false;
    update(next);
  };
  const [searchInfo, setSearchInfo] = useState<{ text: string; prefix: string }>({
    text: '',
    prefix: '',
  });

  const taskMentionSearchActive = searchInfo.prefix === '@' && !searchInfo.text.toLowerCase().startsWith('doc');
  const crMentionSearchActive = searchInfo.prefix === '#';
  const documentMentionSearchActive = searchInfo.prefix === '@' && searchInfo.text.toLowerCase().startsWith('doc');

  const mentionsRef = useRef<MentionsRef>(null);
  const isSubmittingRef = useRef(false);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tasks = useLiveQuery<Task[]>(() => taskMentionSearchActive ? (db.tasks?.toArray() ?? []) : [], [db, taskMentionSearchActive]) ?? [];
  const changeRequests = useLiveQuery<ChangeRequest[]>(() => crMentionSearchActive ? (db.changeRequests?.toArray() ?? []) : [], [db, crMentionSearchActive]) ?? [];
  const systems = useLiveQuery<System[]>(() => crMentionSearchActive ? (db.systems?.toArray() ?? []) : [], [db, crMentionSearchActive]) ?? [];
  const documents = useLiveQuery<Note[]>(
    async () => {
      if (!documentMentionSearchActive || !db.notes) return [];
      return await db.notes
        .filter((n: Note) => !n.deletedAt && (n.type === 'document' || !n.type))
        .toArray();
    },
    [db, documentMentionSearchActive]
  ) ?? [];

  useEffect(() => {
    return () => {
      if (submitTimerRef.current) {
        clearTimeout(submitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (autoFocus && !disabled && !isStreaming) {
      const timer = setTimeout(() => {
        mentionsRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, disabled, isStreaming]);

  const clearInput = (el?: HTMLTextAreaElement | null) => {
    update('');
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
    if (disabled || isStreaming) return;
    const rawVal = effectiveValue || targetEl?.value || '';
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

    onSubmit(trimmed);
  };

  const handleOpenFullscreen = () => {
    setFullscreenDraft(effectiveValue);
    setIsFullscreenModalOpen(true);
  };

  const handleApplyFullscreen = () => {
    update(fullscreenDraft);
    setIsFullscreenModalOpen(false);
    setTimeout(() => {
      mentionsRef.current?.focus();
    }, 50);
  };

  const handleSendFromFullscreen = () => {
    if (disabled || isStreaming) return;
    const trimmed = fullscreenDraft.trim();
    if (!trimmed) return;
    clearInput();
    setIsFullscreenModalOpen(false);

    if (trimmed === '/clear') {
      onClear?.();
      return;
    }
    if (trimmed === '/clear-all') {
      onClearAll?.();
      return;
    }
    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // An IME uses Enter to commit a Vietnamese word; never send mid-composition.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (disabled || isStreaming) return;
      const el = e.currentTarget;
      const rawText = effectiveValue.trim() || el?.value?.trim() || '';
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
      } else {
        onSubmit(rawText);
      }
    }
  };

  const handleSelect = (option: any) => {
    if (option.key === 'cmd-doc' || option.key === 'mention-doc-entry') {
      update(
        (() => {
          const clean = effectiveValue.replace(/\/doc\s*$/, '').trimEnd();
          return clean ? `${clean} @doc:` : '@doc:';
        })()
      );
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
  };

  const activePrefixes = useMemo(() => {
    const textarea =
      mentionsRef.current?.textarea ||
      (mentionsRef.current as any)?.nativeElement?.querySelector?.('textarea');
    const cursorPos = textarea ? textarea.selectionStart : effectiveValue.length;
    const textBeforeCursor = effectiveValue.slice(0, cursorPos);
    const lastSpace = Math.max(textBeforeCursor.lastIndexOf(' '), textBeforeCursor.lastIndexOf('\n'));
    const currentToken = lastSpace === -1 ? textBeforeCursor : textBeforeCursor.slice(lastSpace + 1);

    if (currentToken.startsWith('@') || currentToken.startsWith('#')) {
      return ['@', '#'];
    }
    return ['@', '#', '/'];
  }, [effectiveValue]);

  const handleSearch = (text: string, prefix: string) => {
    setSearchInfo({ text, prefix });
  };

  const options = useMemo(() => {
    const { prefix, text } = searchInfo;
    const q = foldForSearch(text);

    if (prefix === '@') {
      const isDocMode = text.startsWith('doc:') || text.startsWith('doc');

      if (isDocMode) {
        const docQuery = foldForSearch(text.startsWith('doc:') ? text.slice(4) : text.slice(3).replace(/^[:\s]+/, ''));

        const docOptions = documents
          .filter((d) => {
            if (!docQuery) return true;
            const titleMatch = d.title && searchIncludes(d.title, docQuery);
            const tagMatch = d.tags?.some((t) => searchIncludes(t, docQuery));
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
                  gap: 'var(--gap-8)',
                  padding: '2px 0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)', minWidth: 0 }}>
                  <FileTextOutlined style={{ color: 'var(--accent)', flexShrink: 0 }} />
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

      const agentSection = (agentOptions ?? [])
        .filter((agent) => {
          if (!q) return true;
          return (
            searchIncludes(agent.name, q) || searchIncludes(agent.role, q)
          );
        })
        .sort((a, b) => {
          if (a.isLead !== b.isLead) return a.isLead ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .slice(0, 5)
        .map((agent) => {
          const color = agentColorFor(agent.id);
          return {
            key: `agent-${agent.id}`,
            value: `@[${agent.name}](agent:${agent.id})`,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)', padding: '2px 0' }}>
                <Avatar
                  size={20}
                  shape={agent.isLead ? 'square' : 'circle'}
                  style={{ backgroundColor: color, color: agentTextColorFor(color), flexShrink: 0 }}
                >
                  {Array.from(agent.name.trim())[0]?.toUpperCase() ?? '?'}
                </Avatar>
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {agent.name}
                </span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>{agent.role}</span>
                {agent.isLead && (
                  <Tag style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>Lead</Tag>
                )}
              </div>
            ),
          };
        });

      const taskOptions = tasks
        .filter((t) => {
          if (t.status === 'Cancelled') return false;
          if (!q) return true;
          return (
            searchIncludes(t.name, q) ||
            (t.jiraKey && searchIncludes(t.jiraKey, q))
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
                gap: 'var(--gap-8)',
                padding: '2px 0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)', minWidth: 0 }}>
                <CheckSquareOutlined style={{ color: 'var(--accent)', flexShrink: 0 }} />
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-4)', flexShrink: 0 }}>
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
              gap: 'var(--gap-6)',
              padding: '2px 0',
              borderTop: `1px dashed ${token.colorBorderSecondary}`,
              marginTop: 4,
              paddingTop: 4,
            }}
          >
            <FileTextOutlined style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontWeight: 500, color: 'var(--accent)' }}>Tham chiếu tài liệu tri thức... (@doc:)</span>
          </div>
        ),
      };

      return [...agentSection, ...taskOptions, docHintOption];
    }

    if (prefix === '#') {
      const crOptions = changeRequests
        .filter((c) => {
          if (c.status === 'Cancelled') return false;
          if (!q) return true;
          return (
            searchIncludes(c.code, q) ||
            searchIncludes(c.name, q)
          );
        })
        .sort((a, b) => {
          const aActive = a.status !== 'Done' ? 1 : 0;
          const bActive = b.status !== 'Done' ? 1 : 0;
          if (aActive !== bActive) return bActive - aActive;
          return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        })
        .slice(0, 10)
        .map((c) => ({
          key: `cr-${c.id}`,
          value: `[${c.code}](cr:${c.id})`,
          label: (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--gap-8)',
                padding: '2px 0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)', minWidth: 0 }}>
                <BranchesOutlined style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span
                  style={{
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.code} · {c.name}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-4)', flexShrink: 0 }}>
                <Tag
                  style={{
                    margin: 0,
                    fontSize: 10,
                    lineHeight: '16px',
                    padding: '0 4px',
                  }}
                >
                  {c.status}
                </Tag>
              </div>
            </div>
          ),
        }));

      const systemOptions = systems
        .filter((sys) => {
          if (!q) return true;
          return (
            searchIncludes(sys.code, q) ||
            searchIncludes(sys.name, q)
          );
        })
        .sort((a, b) => a.code.localeCompare(b.code))
        .slice(0, 10)
        .map((sys) => ({
          key: `system-${sys.id}`,
          value: `[${sys.code}](system:${sys.id})`,
          label: (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--gap-8)',
                padding: '2px 0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)', minWidth: 0 }}>
                <ApartmentOutlined style={{ color: 'var(--info-fg)', flexShrink: 0 }} />
                <span
                  style={{
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {sys.code} · {sys.name}
                </span>
              </div>
              <Tag
                style={{
                  margin: 0,
                  fontSize: 10,
                  lineHeight: '16px',
                  padding: '0 4px',
                }}
              >
                {sys.type}
              </Tag>
            </div>
          ),
        }));

      return [...crOptions, ...systemOptions];
    }

    if (prefix === '/') {
      return COMMANDS.filter((cmd) => {
        if (!q) return true;
        return (
          searchIncludes(cmd.name, q) ||
          searchIncludes(cmd.description, q)
        );
      }).map((cmd) => ({
        key: `cmd-${cmd.name}`,
        value: `${cmd.name}`,
        label: (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--gap-8)',
              padding: '2px 0',
            }}
          >
            {cmd.icon}
            <span style={{ fontWeight: 600, minWidth: 65 }}>{cmd.title}</span>
            <span style={{ color: 'var(--fg-secondary)', fontSize: 'var(--font-size-small)' }}>{cmd.description}</span>
          </div>
        ),
      }));
    }

    return [];
  }, [searchInfo, tasks, changeRequests, systems, documents, agentOptions, token.colorBorderSecondary]);

  return (
    <div
      style={{
        padding: '10px 14px',
        backgroundColor: token.colorBgContainer,
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 'var(--gap-8)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {leadingContent}
        {attachedFiles && attachedFiles.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--gap-6)',
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
                  icon={<FileTextOutlined style={{ color: 'var(--success)' }} />}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-control)',
                    fontSize: 'var(--font-size-small)',
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
          value={effectiveValue}
          onChange={(newVal) => {
            if (isSubmittingRef.current) {
              clearInput();
              return;
            }
            if (isComposingRef.current) {
              handleCompositionChange(newVal);
              return;
            }
            update(newVal);
          }}
          onCompositionStart={handleCompositionStart}
          onInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
            if (isSubmittingRef.current) {
              const target = e.target as HTMLTextAreaElement;
              clearInput(target);
            }
          }}
          onCompositionEnd={(e: React.CompositionEvent<HTMLTextAreaElement>) => {
            isComposingRef.current = false;
            if (isSubmittingRef.current) {
              const target = e.target as HTMLTextAreaElement;
              clearInput(target);
              return;
            }
            handleCompositionEnd((e.target as HTMLTextAreaElement).value);
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
              borderRadius: 'var(--radius-control)',
              lineHeight: '22px',
              padding: '4px 11px',
              resize: 'none',
            },
          }}
          style={{
            width: '100%',
            borderRadius: 'var(--radius-control)',
            fontSize: 14,
          }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)', flexShrink: 0 }}>
        <Tooltip title="Mở rộng soạn thảo toàn màn hình">
          <Button
            type="text"
            icon={<FullscreenOutlined />}
            onClick={handleOpenFullscreen}
            disabled={disabled || isStreaming}
            aria-label="Mở rộng soạn thảo"
            style={{ height: 32, width: 32, padding: 0 }}
          />
        </Tooltip>
        {(onAttachFile || onAttachFiles) && (
          <Tooltip title="Duyệt tệp SSH từ xa">
            <Button
              type="text"
              icon={<FolderOpenOutlined />}
              onClick={() => setIsSshBrowserOpen(true)}
              disabled={disabled || isStreaming}
              aria-label="Duyệt tệp SSH từ xa"
              style={{ height: 32, width: 32, padding: 0 }}
            />
          </Tooltip>
        )}
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
              disabled={disabled || !effectiveValue.trim()}
              aria-label="Gửi tin nhắn"
              style={{ height: 32 }}
            >
              Gửi
            </Button>
          </Tooltip>
        )}
      </div>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)' }}>
            <FullscreenOutlined style={{ color: token.colorPrimary }} />
            <span>Soạn thảo tin nhắn AI toàn màn hình</span>
          </div>
        }
        open={isFullscreenModalOpen}
        onCancel={() => setIsFullscreenModalOpen(false)}
        width="80vw"
        style={{ top: 32, maxWidth: 1200 }}
        styles={{
          body: {
            padding: '16px 0 8px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--gap-12)',
          },
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-small)', color: token.colorTextSecondary }}>
              Mẹo: Nhấn <b>Cmd + Enter</b> (hoặc <b>Ctrl + Enter</b>) để gửi trực tiếp.
            </span>
            <div style={{ display: 'flex', gap: 'var(--gap-8)' }}>
              <Button onClick={() => setIsFullscreenModalOpen(false)}>
                Hủy
              </Button>
              <Button onClick={handleApplyFullscreen}>
                Xong (Lưu vào ô chat)
              </Button>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSendFromFullscreen}
                disabled={disabled || isStreaming || !fullscreenDraft.trim()}
              >
                Gửi ngay
              </Button>
            </div>
          </div>
        }
        destroyOnHidden={false}
      >
        <TextArea
          autoFocus
          value={fullscreenDraft}
          onChange={(e) => setFullscreenDraft(e.target.value)}
          placeholder={placeholder}
          aria-label="Soạn thảo tin nhắn mở rộng"
          // The shared TextArea wrapper defaults to autoSize; disable it so `rows` governs height.
          autoSize={false}
          rows={16}
          showCount
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSendFromFullscreen();
            }
          }}
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            resize: 'vertical',
            borderRadius: 'var(--radius-control)',
          }}
        />
      </Modal>
      <StandaloneSshFileBrowser
        open={isSshBrowserOpen}
        onClose={() => setIsSshBrowserOpen(false)}
        onAttach={(paths) => {
          if (onAttachFiles) onAttachFiles(paths);
          else for (const path of paths) onAttachFile?.(path);
        }}
        db={db}
      />
    </div>
  );
};
