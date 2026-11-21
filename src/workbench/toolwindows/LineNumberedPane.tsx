import React, { memo, useEffect, useMemo, useRef } from 'react';

/** 0-based line interval of a foldable block, computed on the formatted output. */
export type FoldRange = { openLine: number; closeLine: number };

/** Line count without allocating the array that `split('\n')` builds on every keystroke. */
export function countLines(s: string): number {
  let n = 1;
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
    line += countLines(text.slice(lastIndex, match.index)) - 1;
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

type FoldButtonProps = {
  lineIndex: number;
  collapsed: boolean;
  onToggleFold: ((lineIndex: number) => void) | undefined;
};

const FoldButton = memo(function FoldButton({ lineIndex, collapsed, onToggleFold }: FoldButtonProps) {
  const number = lineIndex + 1;
  return (
    <button
      type="button"
      aria-label={`${collapsed ? 'Mở rộng' : 'Thu gọn'} dòng ${number}`}
      aria-expanded={!collapsed}
      onClick={() => onToggleFold?.(lineIndex)}
      style={{ position: 'absolute', right: 2, top: lineIndex * 20, height: 20, border: 'none', background: 'transparent', color: 'var(--fg-muted, #6c707e)', padding: '0 2px', font: 'inherit', cursor: 'pointer', lineHeight: '20px' }}
    >
      {collapsed ? '▸' : '▾'}
    </button>
  );
});

/**
 * Gutter + content. Line numbers are ONE text node (`<pre>`) instead of N divs —
 * long documents stay cheap to re-render. Fold buttons are absolute-positioned
 * only on foldable lines.
 */
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

  const lines = useMemo(
    () => visibleLines ?? Array.from({ length: Math.max(0, totalLines) }, (_, i) => i),
    [visibleLines, totalLines]
  );
  // One string, one DOM node. Building 500 <div>+<span> per keystroke was the lag.
  const numbersText = useMemo(
    () => lines.map((lineIndex) => String(lineIndex + 1)).join('\n'),
    [lines]
  );
  const foldButtons = useMemo(
    () => lines
      .filter((lineIndex) => foldableLines?.has(lineIndex))
      .map((lineIndex) => (
        <FoldButton
          key={lineIndex}
          lineIndex={lineIndex}
          collapsed={collapsedLines?.has(lineIndex) ?? false}
          onToggleFold={onToggleFold}
        />
      )),
    [lines, foldableLines, collapsedLines, onToggleFold]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
      <div
        ref={gutterRef}
        data-testid="line-gutter"
        style={{
          position: 'relative',
          overflow: 'hidden',
          flex: `0 0 ${gutterWidth}px`,
          background: 'var(--bg-elev, #f7f8fa)',
          borderRight: '1px solid var(--border, #e9eaee)',
          font: '12.5px/20px var(--font-mono, monospace)',
          paddingTop: gutterPaddingTop,
          color: 'var(--fg-muted, #6c707e)',
        }}
      >
        <pre style={{ margin: 0, padding: '0 0 0 6px', font: 'inherit' }}>{numbersText}</pre>
        {foldButtons}
      </div>
      {children}
    </div>
  );
}
