import React, { useEffect, useRef } from 'react';

/** 0-based line interval of a foldable block, computed on the formatted output. */
export type FoldRange = { openLine: number; closeLine: number };

function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === '\n') n++;
  return n;
}

function computeJsonFoldRanges(text: string): FoldRange[] {
  const ranges: FoldRange[] = [];
  const stack: number[] = [];
  let line = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '\n') {
      line++;
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      stack.push(line);
    } else if (ch === '}' || ch === ']') {
      const openLine = stack.pop();
      if (openLine !== undefined && line > openLine) ranges.push({ openLine, closeLine: line });
    }
  }
  return ranges.sort((a, b) => a.openLine - b.openLine);
}

const XML_TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/?([A-Za-z_][\w:.-]*)(?:"[^"]*"|'[^']*'|[^>"'])*>/g;

function computeXmlFoldRanges(text: string): FoldRange[] {
  const ranges: FoldRange[] = [];
  const stack: { tag: string; line: number }[] = [];
  let line = 0;
  let lastIndex = 0;
  XML_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = XML_TOKEN.exec(text)) !== null) {
    line += countNewlines(text.slice(lastIndex, match.index));
    const raw = match[0];
    lastIndex = match.index + raw.length;
    if (raw.startsWith('<!--') || raw.startsWith('<![CDATA[') || raw.startsWith('<?') || raw.startsWith('<!DOCTYPE')) continue;
    const tag = match[1]!;
    if (!raw.startsWith('</')) {
      if (!/\/\s*>$/.test(raw)) stack.push({ tag, line });
      continue;
    }
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k]!.tag !== tag) continue;
      const open = stack.splice(k, 1)[0]!;
      if (line > open.line) ranges.push({ openLine: open.line, closeLine: line });
      break;
    }
  }
  return ranges.sort((a, b) => a.openLine - b.openLine);
}

/** Pure, single-pass fold detection. Only blocks with at least one body line fold. */
export function computeFoldRanges(text: string, kind: 'json' | 'xml'): FoldRange[] {
  return kind === 'json' ? computeJsonFoldRanges(text) : computeXmlFoldRanges(text);
}

export type LineNumberedPaneProps = {
  scrollRef: React.RefObject<HTMLElement | null>;
  totalLines: number;
  visibleLines?: number[];
  foldableLines?: ReadonlySet<number>;
  collapsedLines?: ReadonlySet<number>;
  onToggleFold?: (lineIndex: number) => void;
  gutterPaddingTop?: number;
  gutterWidth?: number;
  children?: React.ReactNode;
};

/** Gutter + content row. Caller owns the child ref; the gutter mirrors its scrollTop. */
export function LineNumberedPane({
  scrollRef,
  totalLines,
  visibleLines,
  foldableLines,
  collapsedLines,
  onToggleFold,
  gutterPaddingTop = 12,
  gutterWidth = 48,
  children,
}: LineNumberedPaneProps) {
  const gutterRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const sync = () => {
      if (gutterRef.current) gutterRef.current.scrollTop = node.scrollTop;
    };
    node.addEventListener('scroll', sync, { passive: true });
    sync();
    return () => node.removeEventListener('scroll', sync);
  }, [scrollRef]);

  const lines = visibleLines ?? Array.from({ length: Math.max(0, totalLines) }, (_, i) => i);
  return (
    <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
      <div
        ref={gutterRef}
        data-testid="line-gutter"
        style={{
          overflow: 'hidden',
          flex: `0 0 ${gutterWidth}px`,
          background: 'var(--bg-elev, #f7f8fa)',
          borderRight: '1px solid var(--border, #e9eaee)',
          font: '12.5px/20px var(--font-mono, monospace)',
          paddingTop: gutterPaddingTop,
          color: 'var(--fg-muted, #6c707e)',
        }}
      >
        {lines.map((lineIndex) => {
          const foldable = foldableLines?.has(lineIndex) ?? false;
          const collapsed = collapsedLines?.has(lineIndex) ?? false;
          const number = lineIndex + 1;
          return (
            <div key={lineIndex} style={{ height: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 0 6px' }}>
              <span style={{ color: 'var(--fg-muted, #6c707e)' }}>{number}</span>
              {foldable && (
                <button
                  type="button"
                  aria-label={`${collapsed ? 'Mở rộng' : 'Thu gọn'} dòng ${number}`}
                  aria-expanded={!collapsed}
                  onClick={() => onToggleFold?.(lineIndex)}
                  style={{ border: 'none', background: 'transparent', color: 'var(--fg-muted, #6c707e)', padding: '0 2px', font: 'inherit', cursor: 'pointer', lineHeight: '20px' }}
                >
                  {collapsed ? '▸' : '▾'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {children}
    </div>
  );
}
