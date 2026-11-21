// One-shot generator for src/components/ui/icon.tsx — derives names from the
// repository's live icon usage intersected with @ant-design/icons declarations.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const declarations = new Set(
  [...readFileSync(join(root, 'node_modules/@ant-design/icons/lib/icons/index.d.ts'), 'utf8')
    .matchAll(/export \{ default as ([A-Za-z0-9_]+) \}/g)].map((m) => m[1]),
);

function walk(dir) {
  let out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', '.planning'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(path));
    else if (/\.(ts|tsx|js|jsx|mjs|html)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const used = new Set();
for (const file of walk(root)) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)) {
    if (declarations.has(match[1])) used.add(match[1]);
  }
}
const names = [...used].sort();
if (names.length < 140) throw new Error(`Icon inventory too small: ${names.length}`);

const lines = [];
lines.push("import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';");
lines.push('import {');
for (const name of names) lines.push(`  ${name} as ${name}Component,`);
lines.push("} from '@ant-design/icons';");
lines.push('');
lines.push("import { getSharedControlTokens, getStatusTokens, type StatusKind } from './tokens.contract';");
lines.push('');
lines.push('type AntIconComponent = (props: Record<string, unknown>) => ReactNode;');
lines.push('');
lines.push('export interface WrappedIconProps {');
lines.push('  className?: string;');
lines.push('  style?: CSSProperties;');
lines.push('  spin?: boolean;');
lines.push('  rotate?: number;');
lines.push('  size?: number | string;');
lines.push('  tone?: StatusKind;');
lines.push('  onClick?: MouseEventHandler<HTMLSpanElement>;');
lines.push("  'aria-label'?: string;");
lines.push('  role?: string;');
lines.push('}');
lines.push('');
lines.push('export type WrappedIcon = (props: WrappedIconProps) => ReactNode;');
lines.push('');
lines.push('/**');
lines.push(' * Single policy factory for all AntD icons (D-09/D-18).');
lines.push(' * Defaults come from tokens.contract; tone maps to the shared status map.');
lines.push(' */');
lines.push('export function wrapIcon(Component: AntIconComponent): WrappedIcon {');
lines.push('  return function PolicyIcon({ size, tone, style, ...rest }: WrappedIconProps) {');
lines.push('    const metrics = getSharedControlTokens();');
lines.push('    const resolvedStyle = {');
lines.push('      \'--ui-control-height\': `${metrics.controlHeight}px`,');
lines.push('      fontSize: typeof size === \'number\' ? `${size}px` : size ?? metrics.iconSize,');
lines.push('      ...(tone ? { color: getStatusTokens(tone) } : {}),');
lines.push('      ...style,');
lines.push('    } as CSSProperties;');
lines.push('    return <Component {...rest} style={resolvedStyle} />;');
lines.push('  };');
lines.push('}');
lines.push('');
lines.push('// Generated export block — keep exact AntD names for a pure import-path migration.');
for (const name of names) lines.push(`export const ${name} = wrapIcon(${name}Component);`);
lines.push('');

writeFileSync(join(root, 'src/components/ui/icon.tsx'), lines.join('\n'));
console.log(`wrote ${names.length} wrapped icons`);
