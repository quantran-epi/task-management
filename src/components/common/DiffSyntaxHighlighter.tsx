import React from 'react';

// Lightweight Tokenizer matching common programming languages for diff lines
// Avoids heavy AST parsers or bundle bloat; fast regex tokenization per line

export interface TokenSpan {
  text: string;
  type: 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'type' | 'plain';
}

const KEYWORDS = new Set([
  'import', 'export', 'from', 'default', 'const', 'let', 'var', 'function', 'class',
  'interface', 'type', 'enum', 'extends', 'implements', 'return', 'if', 'else', 'switch',
  'case', 'break', 'continue', 'for', 'while', 'do', 'try', 'catch', 'finally', 'throw',
  'async', 'await', 'yield', 'new', 'typeof', 'instanceof', 'void', 'this', 'super',
  'true', 'false', 'null', 'undefined', 'pub', 'fn', 'struct', 'impl', 'mut', 'use',
  'def', 'self', 'lambda', 'with', 'as', 'pass', 'raise', 'package', 'func'
]);

/** Oracle SQL/PLSQL keywords. Lookups are case-insensitive (`.toUpperCase()`). */
export const ORACLE_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'WITH', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'ON',
  'GROUP', 'ORDER', 'BY', 'HAVING', 'UNION', 'ALL', 'DISTINCT', 'AS', 'IN', 'EXISTS', 'BETWEEN',
  'LIKE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'ELSIF', 'END', 'NULL', 'IS', 'NOT', 'AND', 'OR',
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'GRANT',
  'REVOKE', 'COMMENT', 'PROCEDURE', 'FUNCTION', 'PACKAGE', 'BODY', 'BEGIN', 'IF', 'LOOP',
  'WHILE', 'FOR', 'CURSOR', 'RETURN', 'PRAGMA', 'EXCEPTION', 'TABLE', 'VIEW', 'INDEX',
  'SEQUENCE', 'TRIGGER', 'SYNONYM', 'TYPE', 'MATERIALIZED', 'DBMS_METADATA', 'CONNECT', 'START',
  'FETCH', 'FIRST', 'NEXT', 'ROWS', 'ONLY', 'OFFSET', 'ROWNUM', 'USING', 'INTO', 'VALUES',
  'PRIOR', 'MINUS', 'INTERSECT', 'LEVEL', 'DUAL', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
]);

const TYPES = new Set([
  'string', 'number', 'boolean', 'any', 'void', 'never', 'unknown', 'object', 'symbol',
  'Promise', 'Array', 'Record', 'Map', 'Set', 'React', 'FC', 'Props', 'State',
  'i32', 'i64', 'u32', 'u64', 'f32', 'f64', 'usize', 'isize', 'str', 'String', 'Vec'
]);

export function tokenizeCodeLine(line: string, language: 'sql' | 'auto' = 'auto'): TokenSpan[] {
  if (!line) return [];

  const sql = language === 'sql';

  // 1. Comments
  const trimmed = line.trimStart();
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    (sql && (trimmed.startsWith('--') || trimmed.startsWith('/*')))
  ) {
    return [{ text: line, type: 'comment' }];
  }

  const spans: TokenSpan[] = [];
  // Oracle q'[...]' quotes stay one literal token; single quotes allow escaped ''.
  const regex = sql
    ? /(--[^\n]*|\/\*[\s\S]*?\*\/|q'\[[\s\S]*?\]'|q'\{[\s\S]*?\}'|q'\([\s\S]*?\)'|'(?:''|[^'])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$#][A-Za-z0-9_$#]*\b|[^\s\w]+|\s+)/g
    : /(\/\*[\s\S]*?\*\/|\/\/.*|#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][A-Za-z0-9_$]*\b|[^\s\w]+|\s+)/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    const text = match[0];
    if (!text) continue;

    const firstChar = text.charAt(0);

    // Comment
    if (text.startsWith('//') || text.startsWith('/*') || text.startsWith('#') || text.startsWith('--')) {
      spans.push({ text, type: 'comment' });
    }
    // String literal
    else if (firstChar === '"' || firstChar === "'" || firstChar === '`' || (sql && text.startsWith("q'"))) {
      spans.push({ text, type: 'string' });
    }
    // Number literal
    else if (/^\d/.test(text)) {
      spans.push({ text, type: 'number' });
    }
    // Keyword or Type or Function
    else if (/^[A-Za-z_$]/.test(text)) {
      if (ORACLE_KEYWORDS.has(text.toUpperCase()) || KEYWORDS.has(text)) {
        spans.push({ text, type: 'keyword' });
      } else if (TYPES.has(text)) {
        spans.push({ text, type: 'type' });
      } else {
        // Look ahead for function call: followed by '('
        const nextChar = line.charAt(regex.lastIndex);
        if (nextChar === '(') {
          spans.push({ text, type: 'function' });
        } else {
          spans.push({ text, type: 'plain' });
        }
      }
    }
    // Plain symbol or whitespace
    else {
      spans.push({ text, type: 'plain' });
    }
  }

  return spans;
}

// GitHub Light & GitHub Dark color palettes
export function getGithubThemeColors(isDark: boolean) {
  return isDark
    ? {
        keyword: '#ff7b72',    // Red-pink
        string: '#a5d6ff',     // Light blue
        comment: '#8b949e',    // Muted gray
        number: '#79c0ff',     // Bright blue
        function: '#d2a8ff',   // Lavender
        type: '#ffa657',       // Orange
        plain: '#c9d1d9',      // Off-white
      }
    : {
        keyword: '#cf222e',    // Red
        string: '#0a3069',     // Dark navy blue
        comment: '#6e7781',    // Gray
        number: '#0550ae',     // Blue
        function: '#8250df',   // Purple
        type: '#953800',       // Brown/Orange
        plain: '#24292f',      // Dark slate
      };
}

export const DiffLineCodeRenderer: React.FC<{
  content: string;
  isDark: boolean;
  language?: 'sql' | 'auto';
}> = React.memo(({ content, isDark, language = 'auto' }) => {
  const spans = React.useMemo(() => tokenizeCodeLine(content, language), [content, language]);
  const colors = React.useMemo(() => getGithubThemeColors(isDark), [isDark]);

  if (!content) return <span> </span>;

  return (
    <>
      {spans.map((span, idx) => (
        <span
          key={idx}
          style={{
            color: colors[span.type] || colors.plain,
            fontStyle: span.type === 'comment' ? 'italic' : 'normal',
          }}
        >
          {span.text}
        </span>
      ))}
    </>
  );
});
