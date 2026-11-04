import { useState, useEffect, useRef, useMemo, type CSSProperties } from 'react';
import {
  SearchOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getAllActions, executeAction, type ActionDefinition } from '../actions/actionRegistry';
import { useLayoutStore, type EditorViewType } from '../store/layoutStore';

export type SearchTabType = 'all' | 'tasks' | 'projects' | 'docs' | 'actions';

export interface SearchEverywhereModalProps {
  open: boolean;
  onClose: () => void;
  db?: TaskPlannerDatabase;
}

interface SearchResultItem {
  id: string;
  category: 'task' | 'project' | 'doc' | 'action';
  title: string;
  subtitle?: string;
  shortcut?: string;
  onSelect: () => void;
}

export function SearchEverywhereModal({ open, onClose, db: propDb }: SearchEverywhereModalProps) {
  const activeDb = propDb || defaultDb;
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTabType>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const openTab = useLayoutStore((s) => s.openTab);

  // Live queries for tasks, projects, notes
  const tasks = useLiveQuery(
    async () => {
      if (!open) return [];
      const list = await activeDb.tasks.toArray();
      return list.filter((t) => !t.deletedAt);
    },
    [open],
    []
  );

  const projects = useLiveQuery(
    async () => {
      if (!open) return [];
      const list = await activeDb.projects.toArray();
      return list.filter((p) => !p.deletedAt);
    },
    [open],
    []
  );

  const notes = useLiveQuery(
    async () => {
      if (!open) return [];
      const list = await activeDb.notes.toArray();
      return list.filter((n) => !n.deletedAt);
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
        if (!searchKeyword || task.title.toLowerCase().includes(searchKeyword)) {
          items.push({
            id: `task:${task.id}`,
            category: 'task',
            title: task.title,
            subtitle: task.status ? `Status: ${task.status}` : 'Task',
            onSelect: () => {
              openTab({
                id: 'tasks',
                title: 'Tasks',
                viewType: 'tasks',
                closable: false,
                params: { selectedTaskId: task.id },
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
                id: 'projects',
                title: 'Projects',
                viewType: 'projects',
                closable: true,
                params: { projectId: proj.id },
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
        if (!searchKeyword || note.title.toLowerCase().includes(searchKeyword)) {
          items.push({
            id: `doc:${note.id}`,
            category: 'doc',
            title: note.title || 'Untitled Doc',
            subtitle: 'Doc',
            onSelect: () => {
              openTab({
                id: `note-${note.id}`,
                title: note.title || 'Doc',
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

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-selected="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

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
        return <CheckSquareOutlined style={{ color: 'var(--success, #338555)', fontSize: 13 }} />;
      case 'project':
        return <ProjectOutlined style={{ color: 'var(--accent, #3871e1)', fontSize: 13 }} />;
      case 'doc':
        return <FileTextOutlined style={{ color: 'var(--fg-secondary, #5f6269)', fontSize: 13 }} />;
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
        background: 'rgba(0, 0, 0, 0.25)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 600,
          maxWidth: '90vw',
          maxHeight: '65vh',
          background: 'var(--bg-popup, #ffffff)',
          border: '1px solid var(--border-strong, #d1d3d9)',
          borderRadius: 3,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--font-size-ui, 12.5px)',
          color: 'var(--fg, #000000)',
        }}
      >
        {/* Top Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 12px',
            borderBottom: '1px solid var(--border, #e9eaee)',
            background: 'var(--bg-app, #ffffff)',
            gap: 8,
          }}
        >
          <SearchOutlined style={{ fontSize: 14, color: 'var(--fg-icon, #6c707e)' }} />
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
              fontSize: 13,
              fontFamily: 'inherit',
              color: 'var(--fg, #000000)',
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
                padding: '2px 4px',
                color: 'var(--fg-muted, #6c707e)',
              }}
            >
              <CloseOutlined style={{ fontSize: 11 }} />
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div
          role="tablist"
          aria-label="Search categories"
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 28,
            padding: '0 8px',
            background: 'var(--bg-elev, #f7f8f9)',
            borderBottom: '1px solid var(--border, #e9eaee)',
            gap: 4,
          }}
        >
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
                  height: 22,
                  padding: '0 8px',
                  border: 'none',
                  borderRadius: 2,
                  background: isActive ? 'var(--bg-app, #ffffff)' : 'transparent',
                  color: isActive ? 'var(--accent, #3871e1)' : 'var(--fg-secondary, #5f6269)',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 11.5,
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search Results List */}
        <div
          ref={listRef}
          role="listbox"
          style={{
            flex: 1,
            overflowY: 'auto',
            maxHeight: 380,
            padding: '4px 0',
          }}
        >
          {filteredItems.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--fg-muted, #6c707e)',
                fontSize: 12,
              }}
            >
              No results found
            </div>
          ) : (
            filteredItems.map((item, index) => {
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
                    cursor: 'pointer',
                    background: isSelected ? 'var(--bg-selected, #d0dffe)' : 'transparent',
                    color: 'var(--fg, #000000)',
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
            })
          )}
        </div>

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
