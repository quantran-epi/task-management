import React, { useEffect, useRef } from 'react';
import type { MatchOptions } from './parsing';
import { previewMatchRanges } from './parsing';

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
  count?: number;
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

export interface CodePreviewProps {
  content: string;
  pattern: string;
  options: MatchOptions;
  activeLine: number;
}

export function CodePreview({ content, pattern, options, activeLine }: CodePreviewProps) {
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
            <span className="find-source"><HighlightedText text={line} ranges={markByLine.get(n) ?? []} /></span>
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
