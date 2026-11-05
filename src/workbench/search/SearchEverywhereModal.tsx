import { useState, useEffect, useRef, useMemo } from 'react';
import {
  SearchOutlined,
  ThunderboltOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import {
  JetBrainsTasksIcon,
  JetBrainsProjectIcon,
  JetBrainsDocsIcon,
} from '../../components/icons/JetBrainsIcons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getAllActions, executeAction } from '../actions/actionRegistry';
import { useLayoutStore } from '../store/layoutStore';
import { VirtualizedList } from '../virtual/VirtualizedList';

export type SearchTabType = 'all' | 'tasks' | 'projects' | 'docs' | 'actions';

export interface SearchEverywhereModalProps {
  open: boolean;
  onClose: () => void;
  db?: TaskPlannerDatabase | undefined;
}

interface SearchResultItem {
  id: string;
  category: 'task' | 'project' | 'doc' | 'action';
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

  const inputRef = useRef<HTMLInputElement>(null);

  const openTab = useLayoutStore((s) => s.openTab);

  // Live queries for tasks, projects, notes
  const tasks = useLiveQuery(
    async () => {
      if (!open) return [];
      const list = await activeDb.tasks.toArray();
      return list.filter((t) => !(t as any).deletedAt);
    },
    [open],
    []
  );

  const projects = useLiveQuery(
    async () => {
      if (!open) return [];
      const list = await activeDb.projects.toArray();
      return list.filter((p) => !(p as any).deletedAt);
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

  // Filter items based on activeTab and query
  const filteredItems = useMemo<SearchResultItem[]>(() => {
    const trimmed = query.trim();
    const isActionQuery = trimmed.startsWith('>');
    const searchKeyword = isActionQuery ? trimmed.slice(1).trim().toLowerCase() : trimmed.toLowerCase();

    const items: SearchResultItem[] = [];

    // 1. Actions
    if (activeTab === 'all' || activeTab === 'actions' || isActionQuery) {
      const allActions = getAllActions();
      for (const act of allActions) {
        if (!searchKeyword || act.title.toLowerCase().includes(searchKeyword) || act.category.toLowerCase().includes(searchKeyword)) {
          items.push({
            id: `action:${act.id}`,
            category: 'action',
            title: act.title,
            subtitle: act.category,
            shortcut: act.shortcut,
            onSelect: () => {
              executeAction(act.id);
              onClose();
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
        if (!searchKeyword || taskTitle.toLowerCase().includes(searchKeyword)) {
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

    // 3. Projects
    if (activeTab === 'all' || activeTab === 'projects') {
      for (const proj of projects) {
        if (!searchKeyword || proj.name.toLowerCase().includes(searchKeyword)) {
          items.push({
            id: `project:${proj.id}`,
            category: 'project',
            title: proj.name,
            subtitle: proj.status ? `Status: ${proj.status}` : 'Project',
            onSelect: () => {
              openTab({
                id: `project-${proj.id}`,
                title: proj.name,
                viewType: 'insight',
                closable: true,
                params: { itemType: 'project', itemId: proj.id },
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
        if (!searchKeyword || noteTitle.toLowerCase().includes(searchKeyword)) {
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

    return items;
  }, [query, activeTab, tasks, projects, notes, openTab, onClose]);

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
      const tabs: SearchTabType[] = ['all', 'tasks', 'projects', 'docs', 'actions'];
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
    { key: 'projects', label: 'Projects' },
    { key: 'docs', label: 'Docs' },
    { key: 'actions', label: 'Actions' },
  ];

  const getCategoryIcon = (category: SearchResultItem['category']) => {
    switch (category) {
      case 'action':
        return <ThunderboltOutlined style={{ color: 'var(--accent, #3871e1)', fontSize: 13 }} />;
      case 'task':
        return <JetBrainsTasksIcon size={14} />;
      case 'project':
        return <JetBrainsProjectIcon size={14} />;
      case 'doc':
        return <JetBrainsDocsIcon size={14} />;
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
        background: 'rgba(0, 0, 0, 0.28)',
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
          background: 'var(--bg-popup, #ffffff)',
          border: '1px solid var(--border-strong, #d1d3d9)',
          borderRadius: 'var(--radius-popup, 8px)',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--font-size-ui, 13px)',
          color: 'var(--fg, #191b1f)',
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
            height: 38,
            padding: '0 10px',
            background: 'var(--bg-frame, #e9eaee)',
            borderBottom: '1px solid var(--border-strong, #d1d3d9)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
                    height: 24,
                    padding: '0 10px',
                    border: isActive ? '1px solid var(--border-strong, #d1d3d9)' : '1px solid transparent',
                    borderRadius: 'var(--radius-small, 4px)',
                    background: isActive ? 'var(--bg-popup, #ffffff)' : 'transparent',
                    color: isActive ? 'var(--fg-strong, #000000)' : 'var(--fg-secondary, #5f6269)',
                    fontWeight: isActive ? 600 : 400,
                    fontSize: 12,
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
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
              color: 'var(--fg-muted, #6c707e)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <CloseOutlined style={{ fontSize: 12 }} />
          </button>
        </div>

        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: '1px solid var(--border, #e9eaee)',
            background: 'var(--bg-popup, #ffffff)',
            gap: 10,
          }}
        >
          <SearchOutlined style={{ fontSize: 15, color: 'var(--fg-icon, #6c707e)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search everywhere, or type '>' for actions..."
            aria-label="Search input"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: 13.5,
              fontFamily: 'inherit',
              color: 'var(--fg-strong, #000000)',
              background: 'transparent',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '2px 6px',
                color: 'var(--fg-muted, #6c707e)',
              }}
            >
              <CloseOutlined style={{ fontSize: 12 }} />
            </button>
          )}
        </div>

        {/* Search Results List */}
        {filteredItems.length === 0 ? (
          <div
            role="listbox"
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--fg-muted, #6c707e)',
              fontSize: 12,
              height: 120,
            }}
          >
            No results found
          </div>
        ) : (
          <VirtualizedList
            items={filteredItems}
            height={360}
            estimateSize={() => 34}
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
                    height: 34,
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-small, 4px)',
                    margin: '1px 6px',
                    background: isSelected ? 'var(--bg-selected, #d0dffe)' : 'transparent',
                    color: 'var(--fg-strong, #000000)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
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
                          fontSize: 11,
                          color: 'var(--fg-muted, #6c707e)',
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
                        background: isSelected ? 'rgba(255, 255, 255, 0.6)' : 'var(--bg-island, #f7f8f9)',
                        border: '1px solid var(--border, #e9eaee)',
                        color: 'var(--fg-secondary, #5f6269)',
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
            borderTop: '1px solid var(--border, #e9eaee)',
            background: 'var(--bg-elev, #f7f8f9)',
            fontSize: 10.5,
            color: 'var(--fg-muted, #6c707e)',
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
