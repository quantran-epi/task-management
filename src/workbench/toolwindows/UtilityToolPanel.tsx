import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Segmented, Select, Tooltip, message } from 'antd';
import {
  CodeOutlined,
  CopyOutlined,
  DeleteOutlined,
  DiffOutlined,
  FileTextOutlined,
  FormatPainterOutlined,
  MinusOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { EditorViewType } from '../store/layoutStore';
import { renderSafeMarkdown } from '../../utils/markdown';

type Indent = '2' | '4' | 'tab';

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  background: 'var(--bg-island, #fff)',
};
const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 14px',
  borderBottom: '1px solid var(--border, #e9eaee)',
  flexWrap: 'wrap',
};
const editorStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  border: 'none',
  outline: 'none',
  resize: 'none',
  padding: '12px 14px',
  font: '12.5px/1.6 var(--font-mono, monospace)',
  color: 'var(--fg, #1f2937)',
  background: 'var(--bg-island, #fff)',
  tabSize: 2,
};
const outputStyle: React.CSSProperties = {
  ...editorStyle,
  margin: 0,
  whiteSpace: 'pre-wrap',
  overflow: 'auto',
};
const colHeadStyle: React.CSSProperties = {
  height: 30,
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  background: 'var(--bg-elev, #f7f8fa)',
  borderBottom: '1px solid var(--border, #e9eaee)',
  fontSize: 'var(--font-size-small, 12px)',
  fontWeight: 600,
  color: 'var(--fg-secondary, #5f6269)',
};
const footerStyle: React.CSSProperties = {
  height: 28,
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '0 14px',
  background: 'var(--bg-elev, #f7f8fa)',
  borderTop: '1px solid var(--border, #e9eaee)',
  color: 'var(--fg-muted, #6c707e)',
  fontSize: 'var(--font-size-xs, 11px)',
};

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    message.success('Đã copy');
  } catch {
    message.error('Không copy được');
  }
}

function indentUnit(indent: Indent) {
  return indent === 'tab' ? '\t' : indent === '4' ? '    ' : '  ';
}

/** Inline syntax highlight — keeps output local, no highlighter dependency. */
function highlight(code: string, kind: 'json' | 'xml'): string {
  const escaped = escapeHtml(code);
  if (kind === 'json') {
    return escaped.replace(
      /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      (match, str: string | undefined, colon: string | undefined, bool: string | undefined, num: string | undefined) => {
        if (str !== undefined) {
          const color = colon ? 'var(--syntax-key, #a626a4)' : 'var(--syntax-string, #0a7d4f)';
          return `<span style="color:${color}">${str}</span>${colon ?? ''}`;
        }
        if (bool !== undefined) return `<span style="color:var(--syntax-literal, #b45e00)">${bool}</span>`;
        if (num !== undefined) return `<span style="color:var(--syntax-number, #1f6feb)">${num}</span>`;
        return match;
      }
    );
  }
  // Attribute pass runs first: the tag pass injects `style="..."` and would otherwise
  // be re-matched as an attribute by the second regex.
  return escaped
    .replace(/([\w:.-]+)=(".*?"|&quot;.*?&quot;)/g, '<span style="color:var(--syntax-key, #a626a4)">$1</span>=<span style="color:var(--syntax-string, #0a7d4f)">$2</span>')
    .replace(/(&lt;\/?)([A-Za-z_][\w:.-]*)/g, '$1<span style="color:var(--syntax-tag, #1f6feb)">$2</span>')
    .replace(/&lt;!--[\s\S]*?--&gt;/g, '<span style="color:var(--fg-muted, #6c707e)">$&</span>');
}

/**
 * Two-column panes scroll together vertically. The guard prevents the mirrored
 * scroll event from bouncing back and fighting the user's wheel/trackpad.
 */
export function useSyncedScroll<TLeft extends HTMLElement, TRight extends HTMLElement>() {
  const leftRef = useRef<TLeft | null>(null);
  const rightRef = useRef<TRight | null>(null);
  const syncing = useRef(false);

  const sync = useCallback((source: 'left' | 'right') => {
    if (syncing.current) return;
    const from = source === 'left' ? leftRef.current : rightRef.current;
    const to = source === 'left' ? rightRef.current : leftRef.current;
    if (!from || !to) return;
    const fromMax = from.scrollHeight - from.clientHeight;
    const toMax = to.scrollHeight - to.clientHeight;
    if (fromMax <= 0 || toMax <= 0) return;
    syncing.current = true;
    to.scrollTop = (from.scrollTop / fromMax) * toMax;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }, []);

  return {
    leftRef,
    rightRef,
    onLeftScroll: useCallback(() => sync('left'), [sync]),
    onRightScroll: useCallback(() => sync('right'), [sync]),
  };
}

/**
 * XML pretty-printer: DOMParser validates, serialization preserves every node
 * (elements, text, comments, CDATA, processing instructions, doctype) so format
 * never changes document semantics. Mixed content keeps its inline whitespace.
 */
function formatXmlString(xml: string, indent: Indent | ''): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) {
    throw new Error((err.textContent || 'XML parse error').split('\n')[0]?.trim() || 'XML parse error');
  }
  const unit = indent === '' ? '' : indentUnit(indent);
  const nl = unit === '' ? '' : '\n';
  const escapeText = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');
  const significant = (node: Node, parentHasElement: boolean) =>
    node.nodeType !== Node.TEXT_NODE || !parentHasElement || Boolean(node.nodeValue?.trim());

  const serialize = (node: Node, level: number): string => {
    const pad = unit.repeat(level);
    switch (node.nodeType) {
      case Node.TEXT_NODE:
        return escapeText(node.nodeValue ?? '');
      case Node.COMMENT_NODE:
        return pad + '<!--' + escapeText(node.nodeValue ?? '') + '-->' + nl;
      case Node.CDATA_SECTION_NODE:
        return pad + '<![CDATA[' + (node.nodeValue ?? '') + ']]>' + nl;
      case Node.PROCESSING_INSTRUCTION_NODE: {
        const pi = node as ProcessingInstruction;
        return pad + '<?' + escapeText(pi.target) + (pi.data ? ' ' + escapeText(pi.data) : '') + '?>' + nl;
      }
      case Node.DOCUMENT_TYPE_NODE: {
        const doctype = node as DocumentType;
        const decl = doctype.publicId
          ? `<!DOCTYPE ${doctype.name} PUBLIC "${doctype.publicId}" "${doctype.systemId}">`
          : doctype.systemId
          ? `<!DOCTYPE ${doctype.name} SYSTEM "${doctype.systemId}">`
          : `<!DOCTYPE ${doctype.name}>`;
        return decl + nl;
      }
      case Node.ELEMENT_NODE:
        break;
      default:
        return '';
    }
    const element = node as Element;
    let open = pad + '<' + element.tagName;
    for (const attr of Array.from(element.attributes)) {
      open += ` ${attr.name}="${escapeAttr(attr.value)}"`;
    }
    const allChildren = Array.from(element.childNodes);
    const hasElementChild = allChildren.some((child) => child.nodeType === Node.ELEMENT_NODE);
    const children = allChildren.filter((child) => significant(child, hasElementChild));
    if (!children.length) return open + ' />' + nl;
    if (children.every((child) => child.nodeType === Node.TEXT_NODE)) {
      return open + '>' + escapeText(children.map((c) => c.nodeValue).join('')) + '</' + element.tagName + '>' + nl;
    }
    if (hasElementChild && children.some((child) => child.nodeType === Node.TEXT_NODE)) {
      const inline = children
        .map((child) => child.nodeType === Node.TEXT_NODE
          ? escapeText(child.nodeValue ?? '')
          : serialize(child, 0).trimEnd())
        .join('');
      return open + '>' + inline + '</' + element.tagName + '>' + nl;
    }
    if (unit !== '' && !hasElementChild) {
      const inline = children
        .map((child) => child.nodeType === Node.TEXT_NODE ? escapeText(child.nodeValue ?? '') : serialize(child, 0).trimEnd())
        .join('');
      return open + '>' + inline + '</' + element.tagName + '>' + nl;
    }
    return open + '>' + nl + children.map((child) => serialize(child, level + 1)).join('') + pad + '</' + element.tagName + '>' + nl;
  };

  return Array.from(doc.childNodes)
    .filter((node) => significant(node, true))
    .map((node) => serialize(node, 0))
    .join('')
    .trimEnd();
}

const MAX_DIFF_TOKENS = 4000;

type DiffRow = { type: 'same' | 'add' | 'del'; a: string; b: string; an: number | null; bn: number | null };
type DiffResult = { rows: DiffRow[]; changes: number; truncated: boolean };

/** LCS diff — O(n*m), capped below so a pasted log cannot OOM the renderer. */
function diffTokens(a: string[], b: string[]): DiffResult {
  if (a.length > MAX_DIFF_TOKENS || b.length > MAX_DIFF_TOKENS) {
    const rows: DiffRow[] = [];
    const common = Math.min(a.length, b.length);
    for (let k = 0; k < common; k++) {
      rows.push({ type: a[k] === b[k] ? 'same' : 'del', a: a[k]!, b: a[k] === b[k] ? b[k]! : '', an: k + 1, bn: a[k] === b[k] ? k + 1 : null });
      if (a[k] !== b[k]) {
        rows.push({ type: 'add', a: '', b: b[k]!, an: null, bn: k + 1 });
      }
    }
    for (let k = common; k < a.length; k++) rows.push({ type: 'del', a: a[k]!, b: '', an: k + 1, bn: null });
    for (let k = common; k < b.length; k++) rows.push({ type: 'add', a: '', b: b[k]!, an: null, bn: k + 1 });
    return { rows: rows.slice(0, MAX_DIFF_TOKENS * 2), changes: rows.length - common, truncated: true };
  }
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? 1 + dp[i + 1]![j + 1]! : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const rows: DiffRow[] = [];
  let changes = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: 'same', a: a[i]!, b: b[j]!, an: i + 1, bn: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      rows.push({ type: 'del', a: a[i]!, b: '', an: i + 1, bn: null });
      i++;
      changes++;
    } else {
      rows.push({ type: 'add', a: '', b: b[j]!, an: null, bn: j + 1 });
      j++;
      changes++;
    }
  }
  while (i < n) {
    rows.push({ type: 'del', a: a[i]!, b: '', an: i + 1, bn: null });
    i++;
    changes++;
  }
  while (j < m) {
    rows.push({ type: 'add', a: '', b: b[j]!, an: null, bn: j + 1 });
    j++;
    changes++;
  }
  return { rows, changes, truncated: false };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}

function JsonFormatter() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formatted, setFormatted] = useState(false);
  const [indent, setIndent] = useState<Indent>('2');
  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useSyncedScroll<HTMLTextAreaElement, HTMLPreElement>();

  const run = useCallback((minify: boolean) => {
    if (!input.trim()) {
      setOutput('');
      setError(null);
      return;
    }
    try {
      const value = JSON.parse(input);
      setOutput(JSON.stringify(value, null, minify ? undefined : indentUnit(indent)));
      setFormatted(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [input, indent]);

  const onInput = (value: string) => {
    setInput(value);
    setError(null);
    setFormatted(false);
    if (!value.trim()) setOutput('');
  };

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <Tooltip title="Format JSON">
          <Button type="primary" icon={<FormatPainterOutlined />} onClick={() => run(false)}>Format</Button>
        </Tooltip>
        <Tooltip title="Minify JSON">
          <Button icon={<MinusOutlined />} onClick={() => run(true)}>Minify</Button>
        </Tooltip>
        <Tooltip title="Copy input">
          <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(input)} />
        </Tooltip>
        <Tooltip title="Copy output">
          <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(output)} />
        </Tooltip>
        <Tooltip title="Clear">
          <Button icon={<DeleteOutlined />} onClick={() => { setInput(''); setOutput(''); setError(null); setFormatted(false); }} />
        </Tooltip>
        <Select<Indent>
          value={indent}
          onChange={setIndent}
          style={{ width: 100 }}
          options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tab' }]}
        />
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-small, 12px)', color: error ? 'var(--danger, #d1484f)' : 'var(--fg-muted, #6c707e)' }}>
          {error ? `❌ ${error}` : formatted ? '✓ JSON hợp lệ' : input.trim() ? 'Đã thay đổi · bấm Format' : 'Sẵn sàng'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 1, background: 'var(--border, #e9eaee)', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>INPUT <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>{input.length} ký tự</span></div>
          <textarea ref={leftRef} onScroll={onLeftScroll} aria-label="JSON input" spellCheck={false} style={editorStyle} value={input} onChange={(e) => onInput(e.target.value)} placeholder={'Dán JSON vào đây, ví dụ: {"name":"TaskMate","ok":true}'} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>OUTPUT <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>đã format</span></div>
          <pre ref={rightRef} onScroll={onRightScroll} aria-label="JSON output" style={outputStyle} dangerouslySetInnerHTML={{ __html: error ? escapeHtml(`❌ ${error}`) : highlight(output, 'json') }} />
        </div>
      </div>
      <div style={footerStyle}><span>JSON · UTF-8</span><span>{output ? output.split('\n').length : 0} dòng</span></div>
    </div>
  );
}

function XmlFormatter() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formatted, setFormatted] = useState(false);
  const [indent, setIndent] = useState<Indent>('2');
  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useSyncedScroll<HTMLTextAreaElement, HTMLPreElement>();

  const run = useCallback((minify: boolean) => {
    if (!input.trim()) {
      setOutput('');
      setError(null);
      return;
    }
    try {
      setOutput(formatXmlString(input, minify ? '' : indent));
      setFormatted(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [input, indent]);

  const onInput = (value: string) => {
    setInput(value);
    setError(null);
    setFormatted(false);
    if (!value.trim()) setOutput('');
  };

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <Tooltip title="Format XML">
          <Button type="primary" icon={<FormatPainterOutlined />} onClick={() => run(false)}>Format</Button>
        </Tooltip>
        <Tooltip title="Minify XML">
          <Button icon={<MinusOutlined />} onClick={() => run(true)}>Minify</Button>
        </Tooltip>
        <Tooltip title="Copy input">
          <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(input)} />
        </Tooltip>
        <Tooltip title="Copy output">
          <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(output)} />
        </Tooltip>
        <Tooltip title="Clear">
          <Button icon={<DeleteOutlined />} onClick={() => { setInput(''); setOutput(''); setError(null); setFormatted(false); }} />
        </Tooltip>
        <Select<Indent>
          value={indent}
          onChange={setIndent}
          style={{ width: 100 }}
          options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tab' }]}
        />
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-small, 12px)', color: error ? 'var(--danger, #d1484f)' : 'var(--fg-muted, #6c707e)' }}>
          {error ? `❌ ${error}` : formatted ? '✓ XML hợp lệ' : input.trim() ? 'Đã thay đổi · bấm Format' : 'Sẵn sàng'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 1, background: 'var(--border, #e9eaee)', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>INPUT <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>{input.length} ký tự</span></div>
          <textarea ref={leftRef} onScroll={onLeftScroll} aria-label="XML input" spellCheck={false} style={editorStyle} value={input} onChange={(e) => onInput(e.target.value)} placeholder={'Dán XML vào đây, ví dụ: <note><to>Quan</to></note>'} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>OUTPUT <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>đã format</span></div>
          <pre ref={rightRef} onScroll={onRightScroll} aria-label="XML output" style={outputStyle} dangerouslySetInnerHTML={{ __html: error ? escapeHtml(`❌ ${error}`) : highlight(output, 'xml') }} />
        </div>
      </div>
      <div style={footerStyle}><span>XML · UTF-8</span><span>{output ? output.split('\n').length : 0} dòng</span></div>
    </div>
  );
}

function TextCompare() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [mode, setMode] = useState<'lines' | 'words'>('lines');
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreSpace, setIgnoreSpace] = useState(false);
  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useSyncedScroll<HTMLTextAreaElement, HTMLTextAreaElement>();

  const result = useMemo<DiffResult>(() => {
    if (!a.trim() && !b.trim()) return { rows: [], changes: 0, truncated: false };
    const normalize = (s: string) => {
      let v = s.replace(/\r\n?/g, '\n');
      if (ignoreCase) v = v.toLowerCase();
      if (ignoreSpace) v = v.replace(/[ \t]+/g, ' ').trim();
      return v;
    };
    const tokenize = (s: string) => {
      const v = normalize(s);
      return mode === 'lines' ? v.split('\n') : v.split(/(\s+)/).filter((t) => t.trim());
    };
    return diffTokens(tokenize(a), tokenize(b));
  }, [a, b, mode, ignoreCase, ignoreSpace]);

  const unit = mode === 'lines' ? 'dòng' : 'từ';
  const countA = mode === 'lines' ? a.split('\n').length : a.split(/\s+/).filter(Boolean).length;
  const countB = mode === 'lines' ? b.split('\n').length : b.split(/\s+/).filter(Boolean).length;
  const rowStyle = (type: DiffRow['type']): React.CSSProperties => {
    const color =
      type === 'add' ? 'var(--success-bg, #e6f6ec)' : type === 'del' ? 'var(--danger-bg, #fdeaea)' : 'transparent';
    return { background: color };
  };

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <Segmented<'lines' | 'words'>
          value={mode}
          onChange={setMode}
          options={[{ label: 'Theo dòng', value: 'lines' }, { label: 'Theo từ', value: 'words' }]}
        />
        <Checkbox checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)}>Bỏ qua hoa/thường</Checkbox>
        <Checkbox checked={ignoreSpace} onChange={(e) => setIgnoreSpace(e.target.checked)}>Bỏ qua khoảng trắng</Checkbox>
        <Tooltip title="Đổi chiều">
          <Button icon={<SwapOutlined />} onClick={() => { setA(b); setB(a); }}>Đổi chiều</Button>
        </Tooltip>
        <Tooltip title="Xóa cả hai">
          <Button icon={<DeleteOutlined />} onClick={() => { setA(''); setB(''); }} />
        </Tooltip>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-small, 12px)', color: result.changes ? 'var(--warning, #a56906)' : 'var(--success, #338555)' }}>
          {!a.trim() && !b.trim()
            ? 'Dán 2 đoạn text để so sánh'
            : `${result.truncated ? '⚠ Quá lớn · so sánh trực tiếp, ' : ''}${result.changes ? `⚠ ${result.changes} thay đổi` : '✓ Hai đoạn giống hệt'}`}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 1, background: 'var(--border, #e9eaee)', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>A — GỐC <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>{countA} {unit}</span></div>
          <textarea ref={leftRef} onScroll={onLeftScroll} aria-label="Text A" spellCheck={false} style={editorStyle} value={a} onChange={(e) => setA(e.target.value)} placeholder="Text gốc..." />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>B — MỚI <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>{countB} {unit}</span></div>
          <textarea ref={rightRef} onScroll={onRightScroll} aria-label="Text B" spellCheck={false} style={editorStyle} value={b} onChange={(e) => setB(e.target.value)} placeholder="Text cần so sánh..." />
        </div>
      </div>
      <div style={{ height: '34%', display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-strong, #d1d3d9)' }}>
        <div style={colHeadStyle}>KẾT QUẢ KHÁC BIỆT</div>
        <div style={{ flex: 1, overflow: 'auto', font: '12.5px/1.55 var(--font-mono, monospace)' }}>
          {result.rows.length ? (
            result.rows.map((row, idx) => (
              <div key={idx} style={{ ...rowStyle(row.type), display: 'grid', gridTemplateColumns: '44px 1fr 20px 1fr 44px' }}>
                <span style={{ padding: '1px 8px', textAlign: 'right', color: 'var(--fg-muted)', background: 'var(--bg-elev, #f7f8fa)' }}>{row.an ?? ''}</span>
                <span style={{ padding: '1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: escapeHtml(row.a) }} />
                <span style={{ textAlign: 'center', color: row.type === 'del' ? 'var(--danger)' : row.type === 'add' ? 'var(--success)' : 'var(--fg-muted)' }}>
                  {row.type === 'del' ? '−' : row.type === 'add' ? '+' : ''}
                </span>
                <span style={{ padding: '1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: escapeHtml(row.b) }} />
                <span style={{ padding: '1px 8px', textAlign: 'right', color: 'var(--fg-muted)', background: 'var(--bg-elev, #f7f8fa)' }}>{row.bn ?? ''}</span>
              </div>
            ))
          ) : (
            <div style={{ padding: 12, color: 'var(--fg-muted)' }}>Dán 2 đoạn text để so sánh.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MarkdownViewer() {
  const [source, setSource] = useState('');
  const rendered = useMemo(() => renderSafeMarkdown(source), [source]);
  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useSyncedScroll<HTMLTextAreaElement, HTMLDivElement>();

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <Tooltip title="Copy source">
          <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(source)}>Copy</Button>
        </Tooltip>
        <Tooltip title="Clear">
          <Button icon={<DeleteOutlined />} onClick={() => setSource('')}>Clear</Button>
        </Tooltip>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-small, 12px)', color: 'var(--fg-muted, #6c707e)' }}>
          {source.length} ký tự · {source.trim() ? 'Đã cập nhật' : 'Sẵn sàng'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 1, background: 'var(--border, #e9eaee)', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>SOẠN</div>
          <textarea ref={leftRef} onScroll={onLeftScroll} aria-label="Markdown editor" spellCheck={false} style={editorStyle} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Dán Markdown vào đây..." />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>XEM TRƯỚC</div>
          <div ref={rightRef} onScroll={onRightScroll} aria-label="Markdown preview" className="markdown-rendered-view" style={{ ...outputStyle, whiteSpace: 'normal' }} dangerouslySetInnerHTML={{ __html: rendered }} />
        </div>
      </div>
      <div style={footerStyle}><span>Markdown · UTF-8</span><span>{rendered ? 'Đã render' : 'Chưa có nội dung'}</span></div>
    </div>
  );
}

export function UtilityToolPanel({ viewType }: { viewType: EditorViewType }) {
  switch (viewType) {
    case 'json_formatter':
      return <JsonFormatter />;
    case 'xml_formatter':
      return <XmlFormatter />;
    case 'text_compare':
      return <TextCompare />;
    case 'markdown_viewer':
      return <MarkdownViewer />;
    default:
      return null;
  }
}

export function utilityToolIcon(viewType: EditorViewType, size = 13): React.ReactNode {
  switch (viewType) {
    case 'json_formatter':
      return <span style={{ fontSize: size, color: 'var(--accent, #3871e1)' }}>{'{}'}</span>;
    case 'xml_formatter':
      return <CodeOutlined style={{ fontSize: size, color: 'var(--accent, #3871e1)' }} />;
    case 'text_compare':
      return <DiffOutlined style={{ fontSize: size, color: 'var(--accent, #3871e1)' }} />;
    case 'markdown_viewer':
      return <FileTextOutlined style={{ fontSize: size, color: 'var(--accent, #3871e1)' }} />;
    default:
      return null;
  }
}
