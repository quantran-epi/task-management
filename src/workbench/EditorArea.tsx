import { useEffect, useRef } from 'react';
import {
  CloseOutlined,
  InboxOutlined,
  PushpinOutlined,
  PushpinFilled,
  DownOutlined,
  ReloadOutlined,
  FundProjectionScreenOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { Dropdown, Tooltip, type MenuProps } from 'antd';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AntdThemeAdapter } from './AntdThemeAdapter';
import { useLayoutStore, type EditorTab, type EditorViewType } from './store/layoutStore';
import {
  JetBrainsTasksIcon,
  JetBrainsDocsIcon,
  JetBrainsPlannerIcon,
  JetBrainsAnalyticsIcon,
  JetBrainsDashboardIcon,
  JetBrainsAgentsIcon,
  JetBrainsTelegramIcon,
  JetBrainsProjectIcon,
  JetBrainsDiagramIcon,
  JetBrainsSystemsIcon,
  JetBrainsRemoteGitIcon,
  JetBrainsSdlcIcon,
} from '../components/icons/JetBrainsIcons';
import { SettingOutlined } from '@ant-design/icons';
import { TasksView } from '../views/TasksView';
import { NotesView } from '../views/NotesView';
import { PlannerView } from '../views/PlannerView';
import { AnalyticsView } from '../views/AnalyticsView';
import { SettingsView } from '../views/SettingsView';
import { DashboardView } from '../views/DashboardView';
import { AgentControlView } from '../views/AgentControlView';
import { TelegramMonitorView } from '../views/TelegramMonitorView';
import { ItemInsightView } from '../views/ItemInsightView';
import { ChangeRequestSdlcView } from '../views/ChangeRequestSdlcView';
import type { SdlcStepId } from '../services/wizard/workflowSchemas';
import { ChangeRequestDetailView } from '../views/ChangeRequestDetailView';
import { SystemCatalogView } from '../views/SystemCatalogView';
import { SystemDetailView } from '../views/SystemDetailView';
import { MermaidAssistantView } from '../views/MermaidAssistantView';
import { RemoteFileViewer } from './editor/RemoteFileViewer';
import type { TaskPlannerDatabase } from '../db';

export interface EditorAreaProps {
  db?: TaskPlannerDatabase | undefined;
}

export function getEditorTabIcon(viewType: EditorViewType, size = 13): React.ReactNode {
  switch (viewType) {
    case 'tasks':
      return <JetBrainsTasksIcon size={size} />;
    case 'notes':
      return <JetBrainsDocsIcon size={size} />;
    case 'planner':
      return <JetBrainsPlannerIcon size={size} />;
    case 'analytics':
      return <JetBrainsAnalyticsIcon size={size} />;
    case 'dashboard':
      return <JetBrainsDashboardIcon size={size} />;
    case 'agents':
      return <JetBrainsAgentsIcon size={size} />;
    case 'teams':
      return <JetBrainsAgentsIcon size={size} />;
    case 'telegram':
      return <JetBrainsTelegramIcon size={size} />;
    case 'sdlc':
      return <JetBrainsSdlcIcon size={size} />;
    case 'cr_detail':
      return <JetBrainsProjectIcon size={size} />;
    case 'systems':
    case 'system_detail':
      return <JetBrainsSystemsIcon size={size} />;
    case 'mermaid':
      return <JetBrainsDiagramIcon size={size} />;
    case 'remote_file':
      return <JetBrainsRemoteGitIcon size={size} />;
    case 'insight':
      return <FundProjectionScreenOutlined style={{ fontSize: size - 1, color: '#10b981' }} />;
    case 'settings':
      return <SettingOutlined style={{ fontSize: size - 1, color: 'var(--fg-muted, #6c707e)' }} />;
    default:
      return <FileTextOutlined style={{ fontSize: size - 1, color: 'var(--accent, #3871e1)' }} />;
  }
}

interface SortableEditorTabItemProps {
  tab: EditorTab;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onTogglePin: () => void;
  onReload: () => void;
  onReloadAll: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  tabRef: (el: HTMLDivElement | null) => void;
}

function SortableEditorTabItem({
  tab,
  isActive,
  onSelect,
  onClose,
  onTogglePin,
  onReload,
  onReloadAll,
  onCloseOthers,
  onCloseAll,
  tabRef,
}: SortableEditorTabItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const isPinned = Boolean(tab.pinned);

  const contextMenuItems: MenuProps['items'] = [
    {
      key: 'reload',
      label: 'Tải lại tab',
      icon: <ReloadOutlined />,
      onClick: onReload,
    },
    {
      key: 'reload-all',
      label: 'Tải lại tất cả tab',
      icon: <ReloadOutlined />,
      onClick: onReloadAll,
    },
    { type: 'divider' },
    {
      key: 'pin',
      label: isPinned ? 'Bỏ ghim tab' : 'Ghim tab',
      icon: isPinned ? <PushpinFilled /> : <PushpinOutlined />,
      onClick: onTogglePin,
    },
    { type: 'divider' },
    {
      key: 'close',
      label: 'Đóng tab',
      icon: <CloseOutlined />,
      onClick: onClose,
    },
    {
      key: 'close-others',
      label: 'Đóng các tab khác',
      onClick: onCloseOthers,
    },
    {
      key: 'close-all',
      label: 'Đóng tất cả tab',
      onClick: onCloseAll,
    },
  ];

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 99 : (isActive ? 2 : 1),
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 10px',
    height: 32,
    flex: isPinned ? '0 0 auto' : '1 1 140px',
    minWidth: isPinned ? 80 : 60,
    maxWidth: isPinned ? 240 : 200,
    background: isActive
      ? 'var(--bg-island, #ffffff)'
      : isPinned
      ? 'var(--bg-elev, #f7f8fa)'
      : 'transparent',
    borderRadius: '6px 6px 0 0',
    borderTop: isActive
      ? '2px solid var(--accent, #3871e1)'
      : isPinned
      ? '1px solid var(--border-strong, #d1d3d9)'
      : '1px solid transparent',
    borderLeft: isActive || isPinned ? '1px solid var(--border-strong, #d1d3d9)' : '1px solid transparent',
    borderRight: isActive || isPinned ? '1px solid var(--border-strong, #d1d3d9)' : '1px solid transparent',
    borderBottom: isActive ? '1px solid var(--bg-island, #ffffff)' : '1px solid transparent',
    marginBottom: isActive ? -1 : 0,
    color: isActive ? 'var(--fg-strong, #000000)' : 'var(--fg-secondary, #5f6269)',
    fontWeight: isActive ? 600 : isPinned ? 500 : 400,
    fontSize: 'var(--font-size-ui, 13.5px)',
    cursor: 'pointer',
    userSelect: 'none',
    position: 'relative',
    boxSizing: 'border-box',
    touchAction: 'none',
  };

  return (
    <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
      <div
        ref={(node) => {
          setNodeRef(node);
          tabRef(node);
        }}
        {...attributes}
        {...listeners}
        role="tab"
        aria-selected={isActive}
        tabIndex={0}
        title={tab.title}
        onClick={onSelect}
        onAuxClick={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
        onMouseDown={(e) => {
          if (e.button === 1) {
            e.preventDefault();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onSelect();
          }
        }}
        style={style}
      >
        {/* Pin toggle button / icon */}
        <button
          type="button"
          aria-label={isPinned ? `Unpin ${tab.title}` : `Pin ${tab.title}`}
          title={isPinned ? 'Unpin tab' : 'Pin tab'}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            padding: 2,
            marginRight: 4,
            borderRadius: 3,
            cursor: 'pointer',
            color: isPinned ? 'var(--accent, #3871e1)' : 'var(--fg-muted, #6c707e)',
            lineHeight: 1,
            flexShrink: 0,
            opacity: isPinned ? 1 : 0.45,
            transition: 'opacity 0.15s ease, color 0.15s ease',
          }}
        >
          {isPinned ? (
            <PushpinFilled style={{ fontSize: 11, pointerEvents: 'none' }} />
          ) : (
            <PushpinOutlined style={{ fontSize: 11, pointerEvents: 'none' }} />
          )}
        </button>

        {/* Tab Type Icon */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 6,
            flexShrink: 0,
            pointerEvents: 'none',
          }}
        >
          {getEditorTabIcon(tab.viewType, 13)}
        </span>

        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginRight: 6,
            pointerEvents: 'none',
          }}
          title={tab.title}
        >
          {tab.title}
        </span>

        <button
          type="button"
          aria-label={`Close ${tab.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            padding: 2,
            borderRadius: 3,
            cursor: 'pointer',
            color: 'var(--fg-muted, #6c707e)',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          <CloseOutlined style={{ fontSize: 11, pointerEvents: 'none' }} />
        </button>
      </div>
    </Dropdown>
  );
}

export function EditorArea({ db }: EditorAreaProps) {
  const openTabs = useLayoutStore((state) => state.openTabs);
  const activeTabId = useLayoutStore((state) => state.activeTabId);
  const setActiveTabId = useLayoutStore((state) => state.setActiveTabId);
  const closeTab = useLayoutStore((state) => state.closeTab);
  const closeOtherTabs = useLayoutStore((state) => state.closeOtherTabs);
  const closeAllTabs = useLayoutStore((state) => state.closeAllTabs);
  const openTab = useLayoutStore((state) => state.openTab);
  const reorderTabs = useLayoutStore((state) => state.reorderTabs);
  const togglePinTab = useLayoutStore((state) => state.togglePinTab);
  const tabReloadKeys = useLayoutStore((state) => state.tabReloadKeys);
  const reloadTab = useLayoutStore((state) => state.reloadTab);
  const reloadAllTabs = useLayoutStore((state) => state.reloadAllTabs);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tabElementsRef = useRef<Record<string, HTMLDivElement | null>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const activeTab = openTabs.find((tab) => tab.id === activeTabId) || openTabs[0];

  // Build menu items for open tabs dropdown
  const dropdownMenuItems: MenuProps['items'] = openTabs.map((t) => {
    const isCurrentActive = t.id === activeTab?.id;
    const isPinned = Boolean(t.pinned);

    return {
      key: t.id,
      label: (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            minWidth: 260,
            maxWidth: 420,
            padding: '2px 0',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flex: 1,
              minWidth: 0,
            }}
          >
            {isPinned ? (
              <PushpinFilled
                style={{
                  fontSize: 12,
                  color: 'var(--accent, #3871e1)',
                  flexShrink: 0,
                }}
              />
            ) : (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isCurrentActive ? 'var(--accent, #3871e1)' : 'transparent',
                  flexShrink: 0,
                }}
              />
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
              {getEditorTabIcon(t.viewType, 14)}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontWeight: isCurrentActive ? 600 : isPinned ? 500 : 400,
                color: isCurrentActive ? 'var(--accent, #3871e1)' : 'var(--fg-strong, #000000)',
                wordBreak: 'break-word',
                lineHeight: 1.4,
              }}
            >
              {t.title}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label={isPinned ? `Unpin ${t.title}` : `Pin ${t.title}`}
              title={isPinned ? 'Unpin tab' : 'Pin tab'}
              onClick={(e) => {
                e.stopPropagation();
                togglePinTab(t.id);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: 3,
                color: isPinned ? 'var(--accent, #3871e1)' : 'var(--fg-muted, #6c707e)',
              }}
            >
              {isPinned ? <PushpinFilled style={{ fontSize: 11 }} /> : <PushpinOutlined style={{ fontSize: 11 }} />}
            </button>
            <button
              type="button"
              aria-label={`Reload ${t.title}`}
              title="Tải lại tab"
              onClick={(e) => {
                e.stopPropagation();
                reloadTab(t.id);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: 3,
                color: 'var(--fg-muted, #6c707e)',
              }}
            >
              <ReloadOutlined style={{ fontSize: 10 }} />
            </button>
            <button
              type="button"
              aria-label={`Close ${t.title}`}
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: 3,
                color: 'var(--fg-muted, #6c707e)',
              }}
            >
              <CloseOutlined style={{ fontSize: 10 }} />
            </button>
          </div>
        </div>
      ),
      onClick: () => setActiveTabId(t.id),
    };
  });

  // Auto-scroll active tab into view
  useEffect(() => {
    if (activeTab?.id && tabElementsRef.current[activeTab.id]) {
      tabElementsRef.current[activeTab.id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [activeTab?.id]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = openTabs.findIndex((t) => t.id === active.id);
      const newIndex = openTabs.findIndex((t) => t.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderTabs(oldIndex, newIndex);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current && e.deltaY !== 0) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const dbProp = db ? { db } : {};

  // Resolve friendly title for insight tabs that only have ID
  useEffect(() => {
    if (!db) return;
    openTabs.forEach(async (t) => {
      if (t.viewType === 'insight' && t.params?.itemId) {
        const itemId = t.params.itemId;
        const itemType = (t.params.itemType || t.params.type || 'task') as string;
        const isPlaceholder = !t.title || t.title.startsWith(`${itemType.toUpperCase()}: `) || t.title.includes(itemId.slice(0, 8));
        if (isPlaceholder) {
          let realName: string | undefined;
          if (itemType === 'task') {
            const item = await db.tasks.get(itemId);
            realName = item?.name;
          } else if (itemType === 'cr') {
            const item = await db.changeRequests.get(itemId);
            realName = item?.name;
          } else if (itemType === 'system') {
            const item = await db.systems.get(itemId);
            realName = item?.name;
          }
          if (realName) {
            openTab({
              ...t,
              title: realName,
              params: { ...t.params, name: realName },
            });
          }
        }
      }
    });
  }, [openTabs, db, openTab]);

  const renderViewContent = (tab: EditorTab) => {
    switch (tab.viewType) {
      case 'tasks':
        return <TasksView {...dbProp} initialCrId={tab.params?.changeRequestId} />;
      case 'notes':
        return <NotesView {...dbProp} initialDocId={tab.params?.doc} hideFolderTree={true} />;
      case 'planner':
        return <PlannerView {...dbProp} targetDate={tab.params?.date} />;
      case 'analytics':
        return <AnalyticsView {...dbProp} />;
      case 'settings':
        return <SettingsView {...dbProp} />;
      case 'cr_detail':
        return (
          <ChangeRequestDetailView
            changeRequestId={String(tab.params?.changeRequestId ?? '')}
            {...dbProp}
          />
        );
      case 'dashboard':
        return <DashboardView onNavigate={(route) => openTab({ id: route, title: route.toUpperCase(), viewType: route as any })} />;
      case 'agents':
        return <AgentControlView />;
      case 'telegram':
        return <TelegramMonitorView />;
      case 'mermaid':
        return <MermaidAssistantView initialCode={tab.params?.code} noteId={tab.params?.noteId} db={db} />;
      case 'systems':
        return <SystemCatalogView {...dbProp} />;
      case 'system_detail':
        return <SystemDetailView systemId={tab.params?.systemId || ''} {...dbProp} />;
      case 'remote_file':
        return <RemoteFileViewer {...tab.params} />;
      case 'sdlc':
        return (
          <ChangeRequestSdlcView
            changeRequestId={String(tab.params?.changeRequestId ?? '')}
            systemId={tab.params?.systemId ? String(tab.params.systemId) : undefined}
            initialStepId={(tab.params?.stepId as SdlcStepId | undefined) ?? undefined}
            stepRequestId={tab.params?.stepRequestId ? String(tab.params.stepRequestId) : undefined}
            onBack={() => closeTab(tab.id)}
            {...dbProp}
          />
        );
      case 'insight':
        return (
          <ItemInsightView
            itemType={(tab.params?.itemType || tab.params?.type || 'task') as any}
            itemId={tab.params?.itemId || tab.params?.id || ''}
            onNavigate={(route, params) => {
              if (route === 'insight') {
                const targetType = (params?.itemType || params?.type || 'task') as string;
                const targetId = (params?.itemId || params?.id || '') as string;
                const explicitTitle = (params?.name || params?.title) as string | undefined;
                openTab({
                  id: `${targetType}-${targetId}`,
                  title: explicitTitle || `${targetType.toUpperCase()}: ${targetId.slice(0, 8)}`,
                  viewType: 'insight',
                  closable: true,
                  params: { itemType: targetType as any, itemId: targetId, ...(explicitTitle ? { name: explicitTitle } : {}) },
                });
                return;
              }
              const titles: Record<string, string> = {
                dashboard: 'Dashboard',
                tasks: 'Tasks',
                projects: 'Projects',
                planner: 'Planner',
                analytics: 'Analytics',
                notes: 'Docs',
                settings: 'Settings',
                agents: 'Ghost Dev',
                teams: 'AI Office — Nhóm',
                telegram: 'Telegram',
              };
              const tabId = params?.doc
                ? `doc-${params.doc}`
                : params?.project
                ? `project-${params.project}`
                : route;
              openTab({
                id: tabId,
                title: titles[route] || route,
                viewType: route as any,
                ...(params ? { params } : {}),
              });
            }}
            {...dbProp}
          />
        );
      default:
        return <TasksView {...dbProp} />;
    }
  };

  return (
    <div
      className="workbench-editor-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-app, #ffffff)',
      }}
    >
      {/* Editor Tab Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 'var(--tabbar-height, 36px)',
          minHeight: 'var(--tabbar-height, 36px)',
          background: 'var(--bg-elev, #f7f8fa)',
          borderBottom: '1px solid var(--border-strong, #d1d3d9)',
          position: 'relative',
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div
            ref={scrollContainerRef}
            role="tablist"
            aria-label="Editor tabs"
            onWheel={handleWheel}
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              height: '100%',
              flex: 1,
              minWidth: 0,
              padding: '0 4px 0 8px',
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollbarWidth: 'none',
              gap: 3,
            }}
          >
            <SortableContext
              items={openTabs.map((tab) => tab.id)}
              strategy={horizontalListSortingStrategy}
            >
              {openTabs.map((tab) => {
                const isActive = tab.id === activeTab?.id;
                return (
                  <SortableEditorTabItem
                    key={tab.id}
                    tab={tab}
                    isActive={isActive}
                    onSelect={() => setActiveTabId(tab.id)}
                    onClose={() => closeTab(tab.id)}
                    onTogglePin={() => togglePinTab(tab.id)}
                    onReload={() => reloadTab(tab.id)}
                    onReloadAll={() => reloadAllTabs()}
                    onCloseOthers={() => closeOtherTabs(tab.id)}
                    onCloseAll={() => closeAllTabs()}
                    tabRef={(el) => {
                      tabElementsRef.current[tab.id] = el;
                    }}
                  />
                );
              })}
            </SortableContext>
          </div>
        </DndContext>

        {/* Tab actions: reload active tab + dropdown for all open tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingRight: 8,
            paddingLeft: 4,
            height: '100%',
            flexShrink: 0,
            borderLeft: '1px solid var(--border, #e9eaee)',
            gap: 2,
          }}
        >
          <Tooltip title="Tải lại tab hiện tại (Alt+R)">
            <button
              type="button"
              aria-label="Reload active tab"
              onClick={() => reloadTab(activeTab?.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 24,
                width: 24,
                padding: 0,
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: 'var(--radius-control, 4px)',
                cursor: 'pointer',
                color: 'var(--fg-secondary, #5f6269)',
                fontSize: 12,
                outline: 'none',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover, #ededed)';
                e.currentTarget.style.borderColor = 'var(--border-strong, #d1d3d9)';
                e.currentTarget.style.color = 'var(--fg-strong, #000000)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
                e.currentTarget.style.color = 'var(--fg-secondary, #5f6269)';
              }}
            >
              <ReloadOutlined style={{ fontSize: 11 }} />
            </button>
          </Tooltip>

          <Dropdown
            menu={{
              items: dropdownMenuItems,
              style: {
                maxHeight: 400,
                overflowY: 'auto',
                minWidth: 280,
              },
            }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Tooltip title="Show Open Tabs">
              <button
                type="button"
                aria-label="Show open tabs list"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  height: 24,
                  padding: '0 6px',
                  background: 'transparent',
                  border: '1px solid transparent',
                  borderRadius: 'var(--radius-control, 4px)',
                  cursor: 'pointer',
                  color: 'var(--fg-secondary, #5f6269)',
                  fontSize: 12,
                  outline: 'none',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover, #ededed)';
                  e.currentTarget.style.borderColor = 'var(--border-strong, #d1d3d9)';
                  e.currentTarget.style.color = 'var(--fg-strong, #000000)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.color = 'var(--fg-secondary, #5f6269)';
                }}
              >
                <DownOutlined style={{ fontSize: 10 }} />
              </button>
            </Tooltip>
          </Dropdown>
        </div>
      </div>

      {/* Active Tab View Body inside AntdThemeAdapter */}
      <div
        className="workbench-editor-body"
        style={{
          flex: 1,
          minHeight: 0,
          height: '100%',
          overflow: activeTab?.viewType === 'notes' ? 'hidden' : 'auto',
          position: 'relative',
          padding: activeTab?.viewType === 'notes' ? 0 : '16px 20px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <AntdThemeAdapter>
          {activeTab ? (
            <div
              key={`${activeTab.id}-${tabReloadKeys[activeTab.id] ?? 0}`}
              data-testid="workbench-tab-content"
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
              }}
            >
              {renderViewContent(activeTab)}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--fg-muted, #6c707e)',
              }}
            >
              <InboxOutlined style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg, #000000)' }}>
                No Tool Window Open
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Press Double Shift to search everywhere, or press Alt+1 through Alt+5 to open tool windows.
              </div>
            </div>
          )}
        </AntdThemeAdapter>
      </div>
    </div>
  );
}
