import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  CloseOutlined,
  ExperimentFilled,
  LeftOutlined,
  MessageOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Badge, Input, Tooltip, theme } from 'antd';
import type { TabRuntimeStatus } from './runtime/tabTypes';

export type ChatTabType = 'sdlc' | 'chat';

export interface ChatTabItem {
  id: string; // 'sdlc' hoặc uuid của chat thread
  type: ChatTabType;
  title: string;
  threadId: string;
  createdAt: string;
}

export interface ChatTabBarProps {
  tabs: ChatTabItem[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab?: (tabId: string, title: string) => void;
  onReorderTabs?: (fromIndex: number, toIndex: number) => void;
  sdlcStatus?: 'wait' | 'process' | 'stale' | 'finish';
  tabStatuses?: Record<string, TabRuntimeStatus>;
  tabAnalysisModes?: Record<string, boolean>;
}

const STATUS_TEXT: Record<Exclude<TabRuntimeStatus, 'idle'>, string> = {
  error: 'Lỗi',
  interrupted: 'Bị gián đoạn',
  processing: 'Đang xử lý',
  stale: 'Cần cập nhật',
  complete: 'Hoàn tất',
};

export const ChatTabBar: React.FC<ChatTabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onRenameTab,
  onReorderTabs,
  sdlcStatus = 'wait',
  tabStatuses,
  tabAnalysisModes,
}) => {
  const { token } = theme.useToken();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tabElementsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Escape unmounts the input, which also fires blur; the flag stops blur from committing.
  const cancelRef = useRef(false);

  // Scroll overflow check
  const checkScrollOverflow = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    checkScrollOverflow();
    const handleScroll = () => checkScrollOverflow();
    el.addEventListener('scroll', handleScroll, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => checkScrollOverflow());
      resizeObserver.observe(el);
    }

    return () => {
      el.removeEventListener('scroll', handleScroll);
      resizeObserver?.disconnect();
    };
  }, [checkScrollOverflow, tabs.length]);

  // Auto-scroll active tab into view
  useEffect(() => {
    const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (activeIndex >= 0 && tabElementsRef.current[activeIndex]) {
      tabElementsRef.current[activeIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [activeTabId, tabs]);

  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -150, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 150, behavior: 'smooth' });
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current && e.deltaY !== 0) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const startEditing = (tab: ChatTabItem) => {
    cancelRef.current = false;
    setEditingTabId(tab.id);
    setEditingValue(tab.title);
  };

  const cancelEditing = () => {
    cancelRef.current = true;
    setEditingTabId(null);
    setEditingValue('');
  };

  const commitEditing = (tab: ChatTabItem) => {
    if (cancelRef.current) return;
    cancelRef.current = true;
    const next = editingValue.trim();
    setEditingTabId(null);
    setEditingValue('');
    if (!next || next === tab.title) return;
    onRenameTab?.(tab.id, next);
  };

  // Drag-and-drop handlers for tabs
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (tabs[index]?.type === 'sdlc') {
      e.preventDefault();
      return;
    }
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (tabs[index]?.type === 'sdlc') return;
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (dragOverIndex === index) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (tabs[targetIndex]?.type === 'sdlc') {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    const from = sourceIndexStr ? parseInt(sourceIndexStr, 10) : draggedIndex;
    if (from !== null && !isNaN(from) && from !== targetIndex) {
      onReorderTabs?.(from, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        position: 'relative',
        backgroundColor: token.colorFillAlter,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        width: '100%',
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      {/* Nút cuộn trái */}
      {canScrollLeft && (
        <button
          type="button"
          aria-label="Cuộn tab sang trái"
          onClick={handleScrollLeft}
          style={{
            height: 28,
            width: 20,
            padding: 0,
            border: 'none',
            background: token.colorFillAlter,
            color: token.colorTextSecondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            zIndex: 10,
            marginBottom: 2,
            transition: 'color 0.15s',
          }}
        >
          <LeftOutlined style={{ fontSize: 10 }} />
        </button>
      )}

      {/* Container cuộn danh sách tab */}
      <div
        ref={scrollContainerRef}
        role="tablist"
        aria-label="Thanh tab hội thoại AI"
        onWheel={handleWheel}
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 2,
          padding: '6px 4px 0 6px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          userSelect: 'none',
          flex: 1,
          boxSizing: 'border-box',
        }}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isSdlc = tab.type === 'sdlc';
          const isAnalysisActive = isSdlc || Boolean(tabAnalysisModes?.[tab.id]);
          const isBeingDragged = draggedIndex === index;
          const isDragTarget = dragOverIndex === index;

          let resolvedStatus: TabRuntimeStatus = tabStatuses?.[tab.id] ?? 'idle';
          if (!tabStatuses?.[tab.id] && isSdlc) {
            if (sdlcStatus === 'process') resolvedStatus = 'processing';
            else if (sdlcStatus === 'stale') resolvedStatus = 'stale';
            else if (sdlcStatus === 'finish') resolvedStatus = 'complete';
            else resolvedStatus = 'idle';
          }

          const statusText = resolvedStatus !== 'idle' ? STATUS_TEXT[resolvedStatus] : undefined;
          const ariaLabel = statusText ? `${tab.title} — ${statusText}` : tab.title;

          const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (editingTabId === tab.id) return;
            if (e.key === 'F2') {
              if (!isSdlc && onRenameTab) {
                e.preventDefault();
                startEditing(tab);
              }
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              const nextIndex = (index + 1) % tabs.length;
              tabElementsRef.current[nextIndex]?.focus();
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              const prevIndex = (index - 1 + tabs.length) % tabs.length;
              tabElementsRef.current[prevIndex]?.focus();
            } else if (e.key === 'Home') {
              e.preventDefault();
              tabElementsRef.current[0]?.focus();
            } else if (e.key === 'End') {
              e.preventDefault();
              tabElementsRef.current[tabs.length - 1]?.focus();
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectTab(tab.id);
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
              if (!isSdlc) {
                e.preventDefault();
                onCloseTab(tab.id);
              }
            }
          };

          const renderStatusIndicator = () => {
            if (resolvedStatus === 'processing') {
              return <Badge status="processing" style={{ flexShrink: 0 }} />;
            }
            if (resolvedStatus === 'error') {
              return <Badge status="error" style={{ flexShrink: 0 }} />;
            }
            if (resolvedStatus === 'interrupted') {
              return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  <Badge status="warning" />
                  <ReloadOutlined style={{ fontSize: 9, color: token.colorWarning }} />
                </span>
              );
            }
            if (resolvedStatus === 'stale') {
              return <Badge status="warning" style={{ flexShrink: 0 }} />;
            }
            if (resolvedStatus === 'complete') {
              return <Badge status="success" style={{ flexShrink: 0 }} />;
            }
            if (isSdlc) {
              return <Badge status="default" style={{ flexShrink: 0 }} />;
            }
            return <MessageOutlined style={{ fontSize: 11, color: token.colorTextTertiary, flexShrink: 0 }} />;
          };

          return (
            <div
              key={tab.id}
              ref={(el) => {
                tabElementsRef.current[index] = el;
              }}
              id={`chat-tab-${tab.id}`}
              role="tab"
              aria-selected={isActive}
              aria-label={ariaLabel}
              aria-description="Dùng phím Delete hoặc Backspace để đóng tab"
              tabIndex={isActive ? 0 : -1}
              draggable={!isSdlc}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={(e) => handleDragLeave(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => onSelectTab(tab.id)}
              onDoubleClick={() => {
                if (!isSdlc && onRenameTab) startEditing(tab);
              }}
              onKeyDown={handleKeyDown}
              style={{
                height: 32,
                padding: '0 8px 0 10px',
                backgroundColor: isActive ? token.colorBgContainer : 'transparent',
                color: isActive ? token.colorText : token.colorTextSecondary,
                fontWeight: isActive ? 600 : 500,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                border: isActive
                  ? `1px solid ${token.colorBorderSecondary}`
                  : isDragTarget
                  ? `1px dashed ${token.colorPrimary}`
                  : '1px solid transparent',
                borderTop: isActive
                  ? `2px solid ${token.colorPrimary}`
                  : isDragTarget
                  ? `2px solid ${token.colorPrimary}`
                  : '2px solid transparent',
                borderBottom: isActive ? `1px solid ${token.colorBgContainer}` : undefined,
                marginBottom: isActive ? -1 : 0,
                maxWidth: 200,
                minWidth: 60,
                flex: '1 1 140px',
                position: 'relative',
                transition: 'background-color 0.15s, color 0.15s, opacity 0.15s',
                zIndex: isActive ? 2 : 1,
                outline: 'none',
                opacity: isBeingDragged ? 0.4 : 1,
                boxSizing: 'border-box',
              }}
            >
              {renderStatusIndicator()}

              {editingTabId === tab.id ? (
                <Input
                  size="small"
                  autoFocus
                  aria-label="Đổi tên tab"
                  value={editingValue}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onPressEnter={() => commitEditing(tab)}
                  onBlur={() => commitEditing(tab)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      cancelEditing();
                    }
                  }}
                  style={{ flex: 1, minWidth: 60, height: 22, fontSize: 12 }}
                />
              ) : (
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                    pointerEvents: 'none',
                  }}
                  title={tab.title}
                >
                  {tab.title}
                </span>
              )}

              {/* Visually hidden status text for assistive technology */}
              {statusText && (
                <span
                  style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: 'hidden',
                    clip: 'rect(0, 0, 0, 0)',
                    border: 0,
                  }}
                >
                  {statusText}
                </span>
              )}

              {/* Icon biểu thị Chế độ Phân tích (Analysis Mode) trên từng tab */}
              {isAnalysisActive && (
                <Tooltip title={isSdlc ? 'Quy trình SDLC: Bắt buộc Analysis Mode' : 'Tab này đang bật Analysis Mode'}>
                  <ExperimentFilled
                    aria-label="Analysis Mode"
                    style={{
                      fontSize: 10,
                      color: token.colorWarningActive || '#fa8c16',
                      flexShrink: 0,
                    }}
                  />
                </Tooltip>
              )}

              {/* Chỉ tab chat thường mới có nút đóng tab */}
              {!isSdlc && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Đóng ${tab.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  style={{
                    width: 16,
                    height: 16,
                    padding: 0,
                    border: 'none',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    color: token.colorTextQuaternary,
                    backgroundColor: 'transparent',
                    flexShrink: 0,
                    transition: 'background-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = token.colorFillSecondary;
                    e.currentTarget.style.color = token.colorText;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = token.colorTextQuaternary;
                  }}
                >
                  <CloseOutlined style={{ fontSize: 9 }} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Nút cuộn phải */}
      {canScrollRight && (
        <button
          type="button"
          aria-label="Cuộn tab sang phải"
          onClick={handleScrollRight}
          style={{
            height: 28,
            width: 20,
            padding: 0,
            border: 'none',
            background: token.colorFillAlter,
            color: token.colorTextSecondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            zIndex: 10,
            marginBottom: 2,
            transition: 'color 0.15s',
          }}
        >
          <RightOutlined style={{ fontSize: 10 }} />
        </button>
      )}

      {/* Nút [+] Tạo tab chat thường mới */}
      <Tooltip title="Mở tab chat AI mới">
        <button
          type="button"
          aria-label="Mở tab chat AI mới"
          onClick={onAddTab}
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: token.colorTextSecondary,
            cursor: 'pointer',
            marginLeft: 2,
            marginRight: 6,
            marginBottom: 3,
            flexShrink: 0,
            transition: 'background-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = token.colorFillSecondary;
            e.currentTarget.style.color = token.colorPrimary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = token.colorTextSecondary;
          }}
        >
          <PlusOutlined style={{ fontSize: 11 }} />
        </button>
      </Tooltip>
    </div>
  );
};
