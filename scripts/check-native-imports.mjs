#!/usr/bin/env node
/** Reject runtime AntD imports in native control sources; allow fully type-only clauses. */
import { readFileSync } from 'node:fs';

const FORBIDDEN = /^(?:antd(?:\/.*)?|@ant-design\/icons(?:\/.*)?)$/;
const IMPORT = /\b(?:import|export)\s+([^;]*?)\bfrom\s*['"]([^'"]+)['"]/g;
const TYPE_ONLY = /^(?:type\b|[\w$]+\s*,\s*type\b)/;

function isTypeOnly(clause) {
  const text = clause.trim();
  if (TYPE_ONLY.test(text)) return true;
  if (!text.startsWith('{')) return false;
  const close = text.indexOf('}');
  if (close === -1) return false;
  const specifiers = text.slice(1, close).split(',').map((part) => part.trim()).filter(Boolean);
  if (specifiers.length === 0) return false;
  return specifiers.every((part) => /^type\s+[\w$]+(?:\s+as\s+[\w$]+)?$/.test(part));
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/check-native-imports.mjs <files...>');
  process.exit(1);
}

const violations = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  IMPORT.lastIndex = 0;
  for (const match of source.matchAll(IMPORT)) {
    if (!FORBIDDEN.test(match[2] ?? '')) continue;
    if (isTypeOnly(match[1] ?? '')) continue;
    const line = source.slice(0, match.index).split('\n').length;
    violations.push(`${file}:${line}: runtime import from '${match[2]}'`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}
