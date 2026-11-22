import { useMemo, useState } from 'react';
import { Tooltip, SearchInput } from '../../components/ui';
import { useLayoutStore } from '../store/layoutStore';
import { UTILITY_TOOLS } from './utilityTools';
import { foldForSearch, searchIncludes } from '../../utils/searchText';

const CATEGORY_ORDER = ['Format & Transform', 'Encode & Decode', 'Developer Utilities', 'Date & Time', 'Crypto & Tokens'] as const;

export function ToolExplorerPanel() {
  const [query, setQuery] = useState('');
  const openTab = useLayoutStore((s) => s.openTab);

  const groups = useMemo(() => {
    const q = foldForSearch(query);
    const tools = q
      ? UTILITY_TOOLS.filter((tool) => searchIncludes(`${tool.title} ${tool.description}`, q))
      : UTILITY_TOOLS;
    return CATEGORY_ORDER
      .map((category) => ({ category, tools: tools.filter((tool) => (tool.category ?? 'Format & Transform') === category) }))
      .filter((group) => group.tools.length > 0);
  }, [query]);

  const openTool = (id: string, title: string, viewType: (typeof UTILITY_TOOLS)[number]['viewType']) => {
    openTab({ id, title, viewType, closable: true });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: 10, flexShrink: 0 }}>
        <SearchInput
          placeholder="Tìm công cụ..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
        {groups.map((group) => (
          <div key={group.category}>
            <div style={{ padding: '10px 4px 4px', color: 'var(--fg-muted, #6c707e)', fontSize: 'var(--font-size-xs, 11px)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {group.category}
            </div>
            {group.tools.map((tool) => (
              <Tooltip key={tool.id} title={tool.description} placement="left">
                <button
                  type="button"
                  onClick={() => openTool(tool.id, tool.title, tool.viewType)}
                  aria-label={`Open ${tool.title}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--gap-10)',
                    width: '100%',
                    padding: 9,
                    border: 'none',
                    borderRadius: 'var(--radius-control)',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--fg, #1f2937)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover, #ededed)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    background: 'var(--accent-soft, #e4ecff)',
                    color: 'var(--accent, #3871e1)',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}>
                    {tool.icon(16)}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--font-size-ui, 13px)', fontWeight: 600 }}>{tool.title}</span>
                    <span style={{ display: 'block', fontSize: 'var(--font-size-small, 12px)', color: 'var(--fg-muted, #6c707e)' }}>{tool.description}</span>
                  </span>
                </button>
              </Tooltip>
            ))}
          </div>
        ))}
        {!groups.length && (
          <div style={{ padding: 12, color: 'var(--fg-muted, #6c707e)' }}>Không tìm thấy công cụ.</div>
        )}
      </div>
      <div style={{ borderTop: '1px solid var(--border, #e9eaee)', padding: '9px 12px', color: 'var(--fg-muted, #6c707e)', fontSize: 'var(--font-size-small, 12px)' }}>
        Chọn tool để mở tab ở vùng làm việc.
      </div>
    </div>
  );
}
