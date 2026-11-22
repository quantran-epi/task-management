import { useState, useEffect, useRef, useMemo } from 'react';
import { ThunderboltOutlined, CloseOutlined } from '../../components/ui/icon';
import {
  JetBrainsTasksIcon,
  JetBrainsProjectIcon,
  JetBrainsDocsIcon,
} from '../../components/icons/JetBrainsIcons';
import { ApartmentOutlined } from '../../components/ui/icon';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useActionRegistry, executeAction, type ActionNotify } from '../actions/actionRegistry';
import { useMessage, SearchInput } from '../../components/ui';
import { useLayoutStore } from '../store/layoutStore';
import { VirtualizedList } from '../virtual/VirtualizedList';
import { foldForSearch, searchIncludes } from '../../utils/searchText';

export type SearchTabType = 'all' | 'tasks' | 'cr' | 'docs' | 'systems' | 'actions';

export interface SearchEverywhereModalProps {
  open: boolean;
  onClose: () => void;
  db?: TaskPlannerDatabase | undefined;
}

interface SearchResultItem {
  id: string;
  category: 'task' | 'cr' | 'doc' | 'system' | 'action';
  title: string;
  subtitle?: string | undefined;
  shortcut?: string | undefined;
  onSelect: () => void;
}

export function SearchEverywhereModal({ open, onClose, db: propDb }: SearchEverywhereModalProps) {
  const activeDb = propDb || defaultDb;
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTabType>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<import('antd').InputRef>(null);

  const message = useMessage();
  const notify: ActionNotify = (kind, text) => message[kind](text);
  const openTab = useLayoutStore((s) => s.openTab);
  const allActions = useActionRegistry();

  // Live queries for tasks, CRs, notes
  const tasks = useLiveQuery(
    async () => {
      if (!open) return [];
      const list = await activeDb.tasks.toArray();
      return list.filter((t) => !(t as any).deletedAt);
    },
    [open],
    []
  );

  const changeRequests = useLiveQuery(
    async () => {
      if (!open) return [];
      const list = await activeDb.changeRequests.toArray();
      return list.filter((cr) => !(cr as any).deletedAt);
    },
    [open],
    []
  );

  const notes = useLiveQuery(
    async () => {
      if (!open) return [];
      const list = await activeDb.notes.toArray();
      return list.filter((n) => !(n as any).deletedAt);
    },
    [open],
    []
  );

  const systems = useLiveQuery(
    async () => {
      if (!open) return [];
      return await activeDb.systems.toArray();
    },
    [open],
    []
  );

  // Filter items based on activeTab and query
  const filteredItems = useMemo<SearchResultItem[]>(() => {
    const trimmed = query.trim();
    const isActionQuery = trimmed.startsWith('>');
    const searchKeyword = foldForSearch(isActionQuery ? trimmed.slice(1) : trimmed);

    const items: SearchResultItem[] = [];

    // 1. Actions
    if (activeTab === 'all' || activeTab === 'actions' || isActionQuery) {
      for (const act of allActions) {
        if (!searchKeyword || searchIncludes(act.title, searchKeyword) || searchIncludes(act.category, searchKeyword)) {
          items.push({
            id: `action:${act.id}`,
            category: 'action',
            title: act.title,
            subtitle: act.category,
            shortcut: act.shortcut,
            onSelect: () => {
              onClose();
              executeAction(act.id, notify);
            },
          });
        }
      }
    }

    // If query starts with '>', only show actions
    if (isActionQuery) {
      return items;
    }

    // 2. Tasks
    if (activeTab === 'all' || activeTab === 'tasks') {
      for (const task of tasks) {
        const taskTitle = task.name || 'Untitled Task';
        if (!searchKeyword || searchIncludes(taskTitle, searchKeyword)) {
          items.push({
            id: `task:${task.id}`,
            category: 'task',
            title: taskTitle,
            subtitle: task.status ? `Status: ${task.status}` : 'Task',
            onSelect: () => {
              openTab({
                id: `task-${task.id}`,
                title: taskTitle,
                viewType: 'insight',
                closable: true,
                params: { itemType: 'task', itemId: task.id },
              });
              onClose();
            },
          });
        }
      }
    }

    // 3. Change Requests
    if (activeTab === 'all' || activeTab === 'cr') {
      for (const cr of changeRequests) {
        const crTitle = cr.code || cr.name;
        if (!searchKeyword || searchIncludes(crTitle, searchKeyword) || searchIncludes(cr.name, searchKeyword)) {
          items.push({
            id: `cr:${cr.id}`,
            category: 'cr',
            title: crTitle,
            subtitle: cr.name,
            onSelect: () => {
              openTab({
                id: `cr-${cr.id}`,
                title: crTitle,
                viewType: 'cr_detail',
                closable: true,
                params: { changeRequestId: cr.id },
              });
              onClose();
            },
          });
        }
      }
    }

    // 4. Docs
    if (activeTab === 'all' || activeTab === 'docs') {
      for (const note of notes) {
        const noteTitle = note.title || 'Untitled Doc';
        if (!searchKeyword || searchIncludes(noteTitle, searchKeyword)) {
          items.push({
            id: `doc:${note.id}`,
            category: 'doc',
            title: noteTitle,
            subtitle: 'Doc',
            onSelect: () => {
              openTab({
                id: `doc-${note.id}`,
                title: noteTitle,
                viewType: 'notes',
                closable: true,
                params: { doc: note.id },
              });
              onClose();
            },
          });
        }
      }
    }

    // 5. Systems
    if (activeTab === 'all' || activeTab === 'systems') {
      for (const sys of systems) {
        if (!searchKeyword || searchIncludes(sys.name, searchKeyword) || searchIncludes(sys.code, searchKeyword)) {
          items.push({
            id: `system:${sys.id}`,
            category: 'system',
            title: sys.name,
            subtitle: `System [${sys.code}] · ${sys.type}`,
            onSelect: () => {
              openTab({
                id: `system-${sys.id}`,
                title: sys.name,
                viewType: 'system_detail',
                closable: true,
                params: { systemId: sys.id },
              });
              onClose();
            },
          });
        }
      }
    }

    return items;
  }, [query, activeTab, tasks, changeRequests, notes, systems, openTab, onClose, allActions]);

  // Reset selection index when query or tab changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeTab]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveTab('all');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const tabs: SearchTabType[] = ['all', 'tasks', 'cr', 'docs', 'systems', 'actions'];
      const currentIndex = tabs.indexOf(activeTab);
      const nextIndex = e.shiftKey
        ? (currentIndex - 1 + tabs.length) % tabs.length
        : (currentIndex + 1) % tabs.length;
      setActiveTab(tabs[nextIndex] ?? 'all');
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredItems[selectedIndex];
      if (selected) {
        selected.onSelect();
      }
      return;
    }
  };

  if (!open) return null;

  const TABS_CONFIG: { key: SearchTabType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'cr', label: 'CR' },
    { key: 'docs', label: 'Docs' },
    { key: 'systems', label: 'Systems' },
    { key: 'actions', label: 'Actions' },
  ];

  const getCategoryIcon = (category: SearchResultItem['category']) => {
    switch (category) {
      case 'action':
        return <ThunderboltOutlined style={{ color: 'var(--accent)', fontSize: 13 }} />;
      case 'task':
        return <JetBrainsTasksIcon size={14} />;
      case 'cr':
        return <JetBrainsProjectIcon size={14} />;
      case 'doc':
        return <JetBrainsDocsIcon size={14} />;
      case 'system':
        return <ApartmentOutlined style={{ color: 'var(--accent)', fontSize: 14 }} />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search Everywhere"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'var(--bg-backdrop)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 620,
          maxWidth: '92vw',
          maxHeight: '70vh',
          background: 'var(--bg-popup)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-popup, 8px)',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--font-size-ui, 13px)',
          color: 'var(--fg)',
        }}
      >
        {/* Top Header: Categories Tabs */}
        <div
          role="tablist"
          aria-label="Search categories"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 'var(--search-head-height)',
            padding: '0 10px',
            background: 'var(--bg-frame)',
            borderBottom: '1px solid var(--border-strong)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-4)' }}>
            {TABS_CONFIG.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    height: 'var(--search-tab-height)',
                    padding: '0 10px',
                    border: isActive ? '1px solid var(--border-strong)' : '1px solid transparent',
                    borderRadius: 'var(--radius-small, 4px)',
                    background: isActive ? 'var(--bg-popup)' : 'transparent',
                    color: isActive ? 'var(--fg-strong)' : 'var(--fg-secondary)',
                    fontWeight: isActive ? 600 : 400,
                    fontSize: 'var(--font-size-small)',
                    cursor: 'pointer',
                    boxShadow: isActive ? 'var(--shadow)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 3,
              color: 'var(--fg-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <CloseOutlined style={{ fontSize: 'var(--font-size-small)' }} />
          </button>
        </div>

        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-popup)',
            gap: 'var(--gap-10)',
          }}
        >
          <SearchInput
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tìm kiếm mọi nơi, hoặc gõ '>' để chạy lệnh..."
            aria-label="Tìm kiếm"
            size="middle"
          />
        </div>

        {/* Search Results List */}
        {filteredItems.length === 0 ? (
          <div
            role="listbox"
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--fg-muted)',
              fontSize: 'var(--font-size-small)',
              height: 120,
            }}
          >
            Không tìm thấy kết quả
          </div>
        ) : (
          <VirtualizedList
            items={filteredItems}
            height={360}
            estimateSize={() => 34 /* VirtualizedList needs a numeric estimate; mirrors --search-row-height. */}
            scrollToIndex={selectedIndex}
            role="listbox"
            aria-label="Search results"
            renderItem={(item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  role="option"
                  aria-selected={isSelected}
                  data-selected={isSelected}
                  onClick={() => item.onSelect()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 12px',
                    height: 'var(--search-row-height)',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-small, 4px)',
                    margin: '1px 6px',
                    background: isSelected ? 'var(--bg-selected)' : 'transparent',
                    color: 'var(--fg-strong)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)', overflow: 'hidden' }}>
                    {getCategoryIcon(item.category)}
                    <span
                      style={{
                        fontWeight: item.category === 'action' ? 600 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title}
                    </span>
                    {item.subtitle && (
                      <span
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--fg-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.subtitle}
                      </span>
                    )}
                  </div>

                  {item.shortcut && (
                    <kbd
                      style={{
                        fontSize: 10,
                        fontFamily: 'inherit',
                        padding: '1px 5px',
                        borderRadius: 2,
                        background: isSelected ? 'var(--accent-soft)' : 'var(--bg-island)',
                        border: '1px solid var(--border)',
                        color: 'var(--fg-secondary)',
                      }}
                    >
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              );
            }}
          />
        )}

        {/* Footer shortcuts hint */}
        <div
          style={{
            padding: '4px 12px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-elev)',
            fontSize: 10.5,
            color: 'var(--fg-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            Navigate: <kbd>↑</kbd> <kbd>↓</kbd> &nbsp;|&nbsp; Select: <kbd>↵</kbd> &nbsp;|&nbsp; Switch Tab: <kbd>Tab</kbd>
          </span>
          <span>Close: <kbd>Esc</kbd></span>
        </div>
      </div>
    </div>
  );
}
