import React, { useEffect, useRef } from 'react';
import type { MatchOptions } from './parsing';
import { previewMatchRanges } from './parsing';
import { tokenizeCodeLine, getGithubThemeColors } from '../../../components/common/DiffSyntaxHighlighter';
import { useThemeMode } from '../../../hooks/useThemeMode';

/** Slice text with <mark> on match ranges; skip overlapping/out-of-order ranges. */
export function HighlightedText({ text, ranges }: { text: string; ranges: Array<[number, number]> }) {
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s < pos || s > e || e > text.length) continue;
    if (s > pos) parts.push(text.slice(pos, s));
    parts.push(<mark key={`${s}-${e}`}>{text.slice(s, e)}</mark>);
    pos = e;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

export interface ResultRowProps {
  text: string;
  ranges: Array<[number, number]>;
  path: string;
  line: number;
  active: boolean;
  variant?: 'content' | 'files' | 'folders';
  count?: number | undefined;
  onSelect?: () => void;
  onOpen?: () => void;
}

export function ResultRow({
  text,
  ranges,
  path,
  line,
  active,
  variant = 'content',
  count,
  onSelect,
  onOpen,
}: ResultRowProps) {
  return (
    <div
      className={`find-rrow${active ? ' on' : ''}`}
      role="option"
      aria-selected={active}
      onMouseDown={onSelect}
      onDoubleClick={onOpen}
    >
      {variant === 'content' ? (
        <>
          <span className="find-rcode"><HighlightedText text={text} ranges={ranges} /></span>
          <span className="find-rfile">{path}:{line}</span>
        </>
      ) : (
        <>
          <span className="find-ricon" aria-hidden="true">{variant === 'folders' ? '▸' : '▫'}</span>
          <span className="find-rcode"><HighlightedText text={path} ranges={ranges} /></span>
          {count !== undefined ? <span className="find-rcount">{count}</span> : null}
        </>
      )}
    </div>
  );
}

/** Tokenize one preview line and keep match ranges as <mark>, so syntax color and hits coexist. */
function SyntaxLine({ text, ranges, isDark }: { text: string; ranges: Array<[number, number]>; isDark: boolean }) {
  const tokens = tokenizeCodeLine(text);
  const colors = getGithubThemeColors(isDark);
  const out: React.ReactNode[] = [];
  let pos = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const start = pos;
    const end = pos + token.text.length;
    pos = end;
    const style = { color: colors[token.type] || colors.plain, fontStyle: token.type === 'comment' ? 'italic' : undefined } as const;
    let cursor = start;
    for (const [ms, me] of ranges) {
      const s = Math.max(ms, start);
      const e = Math.min(me, end);
      if (s >= e) continue;
      if (s > cursor) out.push(<span key={`${cursor}-${s}`} style={style}>{text.slice(cursor, s)}</span>);
      out.push(<mark key={`${s}-${e}`} style={style}>{text.slice(s, e)}</mark>);
      cursor = e;
    }
    if (cursor < end) out.push(<span key={`${cursor}-${end}`} style={style}>{text.slice(cursor, end)}</span>);
  }
  return <>{out}</>;
}

export interface CodePreviewProps {
  content: string;
  pattern: string;
  options: MatchOptions;
  activeLine: number;
}

export function CodePreview({ content, pattern, options, activeLine }: CodePreviewProps) {
  const isDark = useThemeMode();
  const lines = content.split('\n');
  const marks = previewMatchRanges(content, pattern, options);
  const markByLine = new Map<number, Array<[number, number]>>();
  for (const mark of marks) markByLine.set(mark.line, mark.ranges);
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeRef.current || typeof activeRef.current.scrollIntoView !== 'function') return;
    activeRef.current.scrollIntoView({ block: 'center' });
  }, [activeLine, content]);

  return (
    <div className="find-code">
      {lines.map((line, i) => {
        const n = i + 1;
        const cur = n === activeLine;
        return (
          <div
            key={n}
            ref={cur ? activeRef : undefined}
            className={`find-cline${cur ? ' cur' : ''}`}
          >
            <span className="find-lno">{n}</span>
            <span className="find-source"><SyntaxLine text={line} ranges={markByLine.get(n) ?? []} isDark={isDark} /></span>
          </div>
        );
      })}
    </div>
  );
}

export function FolderPreview({ entries }: { entries: string[] }) {
  return (
    <div className="find-folder-preview">
      {entries.map((entry) => (
        <div key={entry} className="find-folder-entry">{entry}</div>
      ))}
    </div>
  );
}
