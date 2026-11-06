import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card,
  Input,
  Button,
  Space,
  Typography,
  Select,
  Tooltip,
  Alert,
  Spin,
  theme,
  message,
  Divider,
  Tag,
  Modal,
} from 'antd';
import {
  RobotOutlined,
  CopyOutlined,
  DownloadOutlined,
  PictureOutlined,
  ClearOutlined,
  PlayCircleOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ColumnWidthOutlined,
  CodeOutlined,
  ApartmentOutlined,
  CheckOutlined,
  SaveOutlined,
  CloudSyncOutlined,
  FullscreenOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { NoteEntityType } from '../types/models';
import { createNote, updateNote } from '../db/repositories/noteRepo';
import { useLayoutStore } from '../workbench/store/layoutStore';
import { fixMermaidWithAi } from '../services/ai/mermaidFixerService';
import { downloadMermaidSvg, downloadMermaidPng } from '../utils/mermaidExport';

const { TextArea } = Input;
const { Text } = Typography;

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const STEP = 0.2;

let mermaidPromise: Promise<typeof import('mermaid')> | null = null;
function getMermaid() {
  if (!mermaidPromise) mermaidPromise = import('mermaid');
  return mermaidPromise;
}

const TEMPLATES: Record<string, { label: string; code: string }> = {
  flowchart: {
    label: 'Flowchart (Quy trình)',
    code: `flowchart TD
  Start([Bắt đầu]) --> Step1[Bước 1: Tiếp nhận yêu cầu]
  Step1 --> Decision{Hợp lệ không?}
  Decision -- Có --> Process[Xử lý tác vụ]
  Decision -- Không --> Reject[Từ chối & Báo lỗi]
  Process --> Finish([Hoàn thành])`,
  },
  sequence: {
    label: 'Sequence (Tuần tự)',
    code: `sequenceDiagram
  autonumber
  actor User as Người dùng
  participant App as TaskMate Client
  participant AI as AI Engine / 9Router
  participant DB as IndexedDB

  User->>App: Gửi prompt vẽ biểu đồ
  App->>AI: Gửi ngữ cảnh & yêu cầu
  AI-->>App: Trả về mã Mermaid
  App->>DB: Lưu lịch sử hội thoại
  App-->>User: Render biểu đồ trực quan`,
  },
  architecture: {
    label: 'Architecture (Kiến trúc)',
    code: `flowchart LR
  subgraph Client ["Desktop Client (Tauri + React 19)"]
    UI["Ant Design 6 UI"]
    State["Dexie IndexedDB Store"]
    Parser["Mermaid Engine"]
  end

  subgraph AI_Gateway ["AI Gateway"]
    NineRouter["9Router / Local Proxy"]
    LLM["LLM (Claude / Gemini / Local)"]
  end

  UI --> State
  UI --> Parser
  UI --> NineRouter
  NineRouter --> LLM`,
  },
  classDiagram: {
    label: 'Class Diagram (Lớp)',
    code: `classDiagram
  class Task {
    +string id
    +string name
    +TaskStatus status
    +number estimateMinutes
    +markDone()
  }
  class Project {
    +string id
    +string name
    +string color
  }
  Project "1" *-- "many" Task : contains`,
  },
  erDiagram: {
    label: 'ER Diagram (Thực thể)',
    code: `erDiagram
  PROJECT ||--o{ TASK : contains
  PROJECT ||--o{ MILESTONE : defines
  TASK ||--o{ WORK_SESSION : logs
  TASK ||--o{ REMINDER : schedules`,
  },
  mindmap: {
    label: 'Mindmap (Bản đồ tư duy)',
    code: `mindmap
  root((TaskMate System))
    Quản lý công việc
      Tasks
      Projects
      Milestones
    Kế hoạch & Tải trọng
      Capacity Rules
      Workload Forecast
    AI Assistant
      Mermaid Diagram Studio
      Grounded Insights
      Telegram Bot`,
  },
  gantt: {
    label: 'Gantt Chart (Tiến độ)',
    code: `gantt
  title Tiến độ dự án
  dateFormat YYYY-MM-DD
  section Lập kế hoạch
    Nghiên cứu yêu cầu   :done, p1, 2026-11-01, 2026-11-03
    Thiết kế giải pháp    :done, p2, 2026-11-03, 2026-11-05
  section Phát triển
    Sửa lỗi Reminder     :active, p3, 2026-11-05, 1d
    Mermaid Studio       :active, p4, 2026-11-05, 1d
  section Kiểm thử
    Viết Unit Tests      :crit, p5, 2026-11-06, 2d`,
  },
};

const STORAGE_KEY = 'tm_mermaid_studio_saved_code';

export interface MermaidAssistantViewProps {
  initialCode?: string | undefined;
  noteId?: string | undefined;
  db?: TaskPlannerDatabase | undefined;
}

export const MermaidAssistantView: React.FC<MermaidAssistantViewProps> = ({
  initialCode,
  noteId,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const isDark = Boolean(
    (token as any).colorBgBase === '#000000' ||
      (token.colorBgContainer && parseInt(token.colorBgContainer.slice(1, 3) || 'ff', 16) < 128)
  );

  const openTab = useLayoutStore((s) => s.openTab);
  const activeTabId = useLayoutStore((s) => s.activeTabId);

  const [currentNoteId, setCurrentNoteId] = useState<string | undefined>(noteId);
  const [title, setTitle] = useState<string>('Biểu đồ Mermaid');
  const [entityType, setEntityType] = useState<NoteEntityType | undefined>(undefined);
  const [entityId, setEntityId] = useState<string | undefined>(undefined);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const noteLoadedRef = useRef<boolean>(false);

  // Live queries for active note and entity pickers
  const currentNote = useLiveQuery(
    async () => {
      if (!currentNoteId) return null;
      return await db.notes.get(currentNoteId);
    },
    [currentNoteId, db]
  );

  const tasks = useLiveQuery(() => db.tasks.toArray(), [db], []);
  const projects = useLiveQuery(() => db.projects.toArray(), [db], []);
  const milestones = useLiveQuery(() => db.milestones.toArray(), [db], []);

  const [code, setCode] = useState<string>(() => {
    if (initialCode) return initialCode;
    try {
      const fromSession = sessionStorage.getItem('tm_mermaid_studio_code');
      if (fromSession) {
        sessionStorage.removeItem('tm_mermaid_studio_code');
        return fromSession;
      }
      const fromLocal = localStorage.getItem(STORAGE_KEY);
      if (fromLocal) return fromLocal;
    } catch {
      // ignore storage errors
    }
    return TEMPLATES.flowchart?.code || '';
  });

  const [svgHtml, setSvgHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fixing, setFixing] = useState<boolean>(false);
  const [aiCustomPrompt, setAiCustomPrompt] = useState<string>('');
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [modalPromptDraft, setModalPromptDraft] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Sync prop noteId change
  useEffect(() => {
    if (noteId !== currentNoteId) {
      setCurrentNoteId(noteId);
      noteLoadedRef.current = false;
    }
  }, [noteId, currentNoteId]);

  // Load existing note data
  useEffect(() => {
    if (currentNote && !noteLoadedRef.current) {
      noteLoadedRef.current = true;
      setTitle(currentNote.title || 'Biểu đồ Mermaid');
      if (currentNote.body !== undefined && currentNote.body !== '') {
        setCode(currentNote.body);
      }
      setEntityType(currentNote.entityType);
      setEntityId(currentNote.entityId);
    }
  }, [currentNote]);

  // Synchronize when initialCode prop changes
  useEffect(() => {
    if (initialCode && initialCode.trim()) {
      setCode(initialCode.trim());
    }
  }, [initialCode]);

  // Listen for open studio custom events with code payload
  useEffect(() => {
    const handleStudioOpen = (e: Event) => {
      const customEvent = e as CustomEvent<{ code?: string }>;
      if (customEvent.detail?.code && customEvent.detail.code.trim()) {
        setCode(customEvent.detail.code.trim());
      } else {
        try {
          const fromSession = sessionStorage.getItem('tm_mermaid_studio_code');
          if (fromSession && fromSession.trim()) {
            sessionStorage.removeItem('tm_mermaid_studio_code');
            setCode(fromSession.trim());
          }
        } catch {}
      }
    };
    window.addEventListener('taskmate:open-mermaid-studio', handleStudioOpen);
    return () => {
      window.removeEventListener('taskmate:open-mermaid-studio', handleStudioOpen);
    };
  }, []);

  // Auto-save debounced when diagram is persistent
  useEffect(() => {
    if (!currentNoteId || !noteLoadedRef.current) return;
    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await updateNote(
          currentNoteId,
          {
            title: title.trim() || 'Biểu đồ Mermaid',
            body: code,
            entityType: entityType || undefined,
            entityId: entityId || undefined,
          },
          db
        );
        setSaveStatus('saved');
        if (activeTabId && activeTabId.includes(currentNoteId)) {
          openTab({
            id: activeTabId,
            title: title.trim() || 'Biểu đồ Mermaid',
            viewType: 'mermaid',
            closable: true,
            params: { noteId: currentNoteId, code },
          });
        }
      } catch {
        setSaveStatus('unsaved');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [title, code, entityType, entityId, currentNoteId, db, activeTabId, openTab]);

  const handleSaveAsDiagramNote = async () => {
    try {
      const newNote = await createNote(
        {
          title: title.trim() || 'Biểu đồ Mermaid mới',
          body: code,
          type: 'diagram',
          tags: ['diagram'],
          entityType: entityType || undefined,
          entityId: entityId || undefined,
        },
        db
      );
      setCurrentNoteId(newNote.id);
      noteLoadedRef.current = true;
      setSaveStatus('saved');
      message.success('Đã lưu thành Diagram Note');
      if (activeTabId) {
        openTab({
          id: `mermaid-${newNote.id}`,
          title: newNote.title || 'Biểu đồ Mermaid mới',
          viewType: 'mermaid',
          closable: true,
          params: { noteId: newNote.id, code },
        });
      }
    } catch {
      message.error('Không thể lưu diagram note');
    }
  };

  // Zoom & Pan
  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
  });

  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Save to localStorage on code change if standalone
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // ignore
    }
  }, [code]);

  const clampScale = (value: number) => Math.min(Math.max(Number(value.toFixed(2)), MIN_SCALE), MAX_SCALE);

  const handleZoomIn = () => setScale((prev) => clampScale(prev + STEP));
  const handleZoomOut = () => setScale((prev) => clampScale(prev - STEP));
  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleFitToView = () => {
    if (!containerRef.current || !canvasRef.current) return;
    const svg = canvasRef.current.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const naturalWidth = rect.width / scale;
    const naturalHeight = rect.height / scale;
    if (naturalWidth <= 0 || naturalHeight <= 0) return;

    const vpWidth = containerRef.current.clientWidth - 48;
    const vpHeight = containerRef.current.clientHeight - 48;
    const fitScale = Math.min(vpWidth / naturalWidth, vpHeight / naturalHeight, 1.5);
    setScale(clampScale(fitScale));
    setPosition({ x: 0, y: 0 });
  };

  // Render diagram
  const renderDiagram = useCallback(async (diagramCode: string) => {
    const trimmed = diagramCode.trim();
    if (!trimmed) {
      setSvgHtml('');
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { default: m } = await getMermaid();
      m.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        suppressErrorRendering: true,
        theme: isDark ? 'dark' : 'default',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      });

      const diagramId = `mermaid-studio-${Date.now()}`;
      const { svg } = await m.render(diagramId, trimmed);
      setSvgHtml(svg);
    } catch (err: unknown) {
      // Clean up leaking mermaid elements
      document.querySelectorAll('[id^="dmermaid-studio"]').forEach((el) => el.remove());
      setSvgHtml('');
      setError((err as Error)?.message || 'Lỗi cú pháp biểu đồ Mermaid');
    } finally {
      setLoading(false);
    }
  }, [isDark]);

  useEffect(() => {
    const timer = setTimeout(() => {
      renderDiagram(code);
    }, 250);
    return () => clearTimeout(timer);
  }, [code, renderDiagram]);

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: position.x,
      initY: position.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPosition({
      x: dragStartRef.current.initX + (e.clientX - dragStartRef.current.startX),
      y: dragStartRef.current.initY + (e.clientY - dragStartRef.current.startY),
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const next = scale * (e.deltaY < 0 ? 1.1 : 0.9);
    setScale(clampScale(next));
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      message.success('Đã sao chép mã Mermaid');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('Không thể sao chép');
    }
  };

  const handleDownloadSvg = () => {
    const svgEl = canvasRef.current?.querySelector('svg');
    downloadMermaidSvg(svgEl, { isDark, filename: 'diagram' });
  };

  const handleDownloadPng = () => {
    const svgEl = canvasRef.current?.querySelector('svg');
    downloadMermaidPng(svgEl, { isDark, filename: 'diagram' });
  };

  const handleAiFix = async (overridePrompt?: string) => {
    const promptToSend = typeof overridePrompt === 'string' ? overridePrompt : aiCustomPrompt;
    setFixing(true);
    const hideLoading = message.loading('AI đang phân tích và sửa cú pháp Mermaid...', 0);
    try {
      const res = await fixMermaidWithAi({
        code,
        errorMessage: error || undefined,
        prompt: promptToSend.trim() || undefined,
      });
      setCode(res.fixedCode);
      setAiCustomPrompt('');
      setModalPromptDraft('');
      setIsAiModalOpen(false);
      message.success('AI đã sửa cú pháp thành công!');
    } catch (err: any) {
      message.error(err?.message || 'Không thể sửa cú pháp bằng AI');
    } finally {
      hideLoading();
      setFixing(false);
    }
  };

  const handleOpenAiModal = () => {
    setModalPromptDraft(aiCustomPrompt);
    setIsAiModalOpen(true);
  };

  const handleApplyModalDraft = () => {
    setAiCustomPrompt(modalPromptDraft);
    setIsAiModalOpen(false);
  };

  return (
    <div style={{ padding: '16px 20px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <ApartmentOutlined style={{ fontSize: 20, color: '#10b981' }} />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tên biểu đồ..."
            style={{
              fontWeight: 600,
              fontSize: 14,
              width: 220,
              borderRadius: 4,
            }}
          />

          {/* Entity Linker */}
          <Space size={4}>
            <Tooltip title="Gắn liên kết với Task, Dự án hoặc Milestone">
              <Select
                size="small"
                value={entityType || 'none'}
                onChange={(val) => {
                  if (val === 'none') {
                    setEntityType(undefined);
                    setEntityId(undefined);
                  } else {
                    setEntityType(val as NoteEntityType);
                    setEntityId(undefined);
                  }
                }}
                style={{ width: 110 }}
                options={[
                  { value: 'none', label: 'Không gắn' },
                  { value: 'task', label: '📌 Tác vụ' },
                  { value: 'project', label: '📁 Dự án' },
                  { value: 'milestone', label: '🚩 Milestone' },
                ]}
              />
            </Tooltip>
            {entityType && (
              <Select
                size="small"
                showSearch
                placeholder={`Chọn ${entityType}...`}
                value={entityId}
                onChange={(val) => setEntityId(val)}
                style={{ width: 180 }}
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={
                  entityType === 'task'
                    ? (tasks || []).map((t) => ({ value: t.id, label: t.name }))
                    : entityType === 'project'
                    ? (projects || []).map((p) => ({ value: p.id, label: p.name }))
                    : (milestones || []).map((m) => ({ value: m.id, label: m.name }))
                }
              />
            )}
          </Space>

          {/* Persistence status */}
          {currentNoteId ? (
            <Tag
              color={saveStatus === 'saved' ? 'green' : saveStatus === 'saving' ? 'processing' : 'warning'}
              style={{ fontSize: 11, margin: 0, padding: '0 6px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <CloudSyncOutlined />
              {saveStatus === 'saved' ? 'Đã lưu' : saveStatus === 'saving' ? 'Đang lưu...' : 'Chưa lưu'}
            </Tag>
          ) : (
            <Button
              type="primary"
              size="small"
              icon={<SaveOutlined />}
              onClick={handleSaveAsDiagramNote}
            >
              Lưu vào Diagram Explorer
            </Button>
          )}
        </div>

        <Space wrap>
          <Select
            placeholder="Chọn mẫu sơ đồ..."
            style={{ width: 220 }}
            onChange={(val) => {
              const tmpl = TEMPLATES[val];
              if (tmpl) setCode(tmpl.code);
            }}
            options={Object.entries(TEMPLATES).map(([k, v]) => ({
              value: k,
              label: v.label,
            }))}
          />
          <Tooltip title="Sao chép cú pháp">
            <Button icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={handleCopyCode}>
              {copied ? 'Đã chép' : 'Sao chép'}
            </Button>
          </Tooltip>
          <Tooltip title="Tải file ảnh SVG">
            <Button icon={<DownloadOutlined />} onClick={handleDownloadSvg} disabled={!svgHtml || Boolean(error)}>
              Xuất SVG
            </Button>
          </Tooltip>
          <Tooltip title="Tải file ảnh PNG">
            <Button icon={<PictureOutlined />} onClick={handleDownloadPng} disabled={!svgHtml || Boolean(error)}>
              Xuất PNG
            </Button>
          </Tooltip>
          <Tooltip title="Xóa trắng mã nguồn">
            <Button icon={<ClearOutlined />} onClick={() => setCode('')} />
          </Tooltip>
        </Space>
      </div>

      {/* Main Two-Column Layout */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          gap: 16,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Left Column: Editor & AI Prompt */}
        <Card
          size="small"
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CodeOutlined />
                <span>Mã nguồn Mermaid</span>
              </span>
              <Button
                type="text"
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => renderDiagram(code)}
              >
                Vẽ lại
              </Button>
            </div>
          }
          style={{
            flex: '0 0 460px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          styles={{
            body: {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: 12,
              gap: 12,
              overflowY: 'auto',
            },
          }}
        >
          <TextArea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Nhập mã Mermaid tại đây (ví dụ: flowchart TD, sequenceDiagram, erDiagram...)"
            style={{
              flex: 1,
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: 13,
              lineHeight: 1.5,
              resize: 'none',
              backgroundColor: token.colorFillAlter,
            }}
          />

          <Divider style={{ margin: '4px 0' }} />

          {/* AI Assistance Box */}
          <div
            style={{
              padding: 10,
              background: token.colorFillAlter,
              borderRadius: 8,
              border: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <RobotOutlined style={{ color: token.colorPrimary }} />
                <span>AI Diagram Fixer & Enhancer</span>
              </span>
              <Button
                type="primary"
                size="small"
                icon={<RobotOutlined />}
                loading={fixing}
                onClick={() => handleAiFix()}
                disabled={!code.trim()}
              >
                Sửa / Nâng cấp bằng AI
              </Button>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Input
                size="small"
                value={aiCustomPrompt}
                onChange={(e) => setAiCustomPrompt(e.target.value)}
                placeholder="Yêu cầu thêm (tùy chọn: ví dụ 'thêm node DB', 'đổi sang sơ đồ ngang')..."
                onPressEnter={() => handleAiFix()}
                style={{ flex: 1 }}
              />
              <Tooltip title="Mở rộng soạn thảo yêu cầu AI">
                <Button
                  size="small"
                  icon={<FullscreenOutlined />}
                  onClick={handleOpenAiModal}
                  aria-label="Mở rộng soạn thảo AI prompt"
                />
              </Tooltip>
            </div>
          </div>
        </Card>

        {/* Right Column: Live Interactive Canvas */}
        <Card
          size="small"
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Xem trước sơ đồ (Live Preview)</span>
              <Space size="small">
                <Tooltip title="Thu nhỏ (-)">
                  <Button size="small" icon={<ZoomOutOutlined />} onClick={handleZoomOut} />
                </Tooltip>
                <span style={{ fontSize: 12, fontWeight: 500, minWidth: 46, textAlign: 'center' }}>
                  {Math.round(scale * 100)}%
                </span>
                <Tooltip title="Phóng to (+)">
                  <Button size="small" icon={<ZoomInOutlined />} onClick={handleZoomIn} />
                </Tooltip>
                <Tooltip title="Vừa màn hình">
                  <Button size="small" icon={<ColumnWidthOutlined />} onClick={handleFitToView} />
                </Tooltip>
                <Tooltip title="Đặt lại zoom">
                  <Button size="small" icon={<UndoOutlined />} onClick={handleResetZoom} />
                </Tooltip>
              </Space>
            </div>
          }
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          styles={{
            body: {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              position: 'relative',
              overflow: 'hidden',
              backgroundColor: isDark ? '#141414' : '#fafafa',
            },
          }}
        >
          {/* Error Banner if parse failed */}
          {error && (
            <div style={{ padding: 12, zIndex: 10 }}>
              <Alert
                type="error"
                showIcon
                message="Lỗi cú pháp Mermaid"
                description={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    <Text type="danger" style={{ fontSize: 12 }}>
                      {error}
                    </Text>
                    <div>
                      <Button
                        type="primary"
                        danger
                        size="small"
                        icon={<RobotOutlined />}
                        loading={fixing}
                        onClick={() => handleAiFix()}
                      >
                        Bấm để AI tự động sửa lỗi ngay
                      </Button>
                    </div>
                  </div>
                }
              />
            </div>
          )}

          {/* Interactive Canvas Viewport */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            style={{
              flex: 1,
              overflow: 'hidden',
              position: 'relative',
              cursor: isDragging ? 'grabbing' : 'grab',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Spin size="small" />
                <Text type="secondary">Đang dựng sơ đồ...</Text>
              </div>
            ) : !code.trim() ? (
              <Text type="secondary">Hãy nhập hoặc chọn mẫu mã Mermaid ở cột bên trái</Text>
            ) : (
              <div
                ref={canvasRef}
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                  transformOrigin: 'center center',
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                  userSelect: 'none',
                }}
                dangerouslySetInnerHTML={{ __html: svgHtml }}
              />
            )}
          </div>
        </Card>
      </div>

      {/* Expanded AI Prompt Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RobotOutlined style={{ color: token.colorPrimary }} />
            <span>Soạn thảo yêu cầu AI Diagram Fixer & Enhancer</span>
          </div>
        }
        open={isAiModalOpen}
        onCancel={() => setIsAiModalOpen(false)}
        width="70vw"
        style={{ top: 40, maxWidth: 900 }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
              Mẹo: Nhấn <b>Cmd + Enter</b> (hoặc <b>Ctrl + Enter</b>) để gửi AI ngay.
            </span>
            <Space>
              <Button onClick={() => setIsAiModalOpen(false)}>Hủy</Button>
              <Button onClick={handleApplyModalDraft}>Xong (Lưu vào ô nhập)</Button>
              <Button
                type="primary"
                icon={<RobotOutlined />}
                loading={fixing}
                disabled={!code.trim()}
                onClick={() => handleAiFix(modalPromptDraft)}
              >
                Gửi AI ngay
              </Button>
            </Space>
          </div>
        }
        destroyOnClose={false}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0 4px 0' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Nhập prompt chi tiết cho AI (thêm nhánh, đổi layout, sửa lỗi cú pháp, bổ sung node, chuyển đổi loại biểu đồ...):
          </Text>
          <TextArea
            autoFocus
            rows={12}
            value={modalPromptDraft}
            onChange={(e) => setModalPromptDraft(e.target.value)}
            placeholder="Ví dụ:&#10;- Bổ sung thêm luồng xử lý lỗi khi DB connection timeout&#10;- Đổi các node hệ thống sang hình trụ [Database]&#10;- Định dạng sơ đồ dạng ngang LR thay vì dọc TD..."
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleAiFix(modalPromptDraft);
              }
            }}
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              resize: 'vertical',
              borderRadius: 8,
              fontFamily: 'inherit',
            }}
          />
        </div>
      </Modal>
    </div>
  );
};
