import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Source-derived AntD wrapper inventory (D-04, Pitfall 3).
 * No hand-typed component list: the consumed set always comes from source.
 */
const UTILITIES = ['theme', 'message', 'notification', 'ConfigProvider'] as const;
const UTILITY_SET: ReadonlySet<string> = new Set(UTILITIES);

export interface ConsumedAntd {
  components: string[];
  icons: string[];
  utilities: string[];
}

function walk(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

/** Balanced extracting of `import { ... } from '<module>'`, including multiline and `type` modifiers. */
export function extractNamedImportsForTest(source: string, moduleName: string): string[] {
  const names: string[] = [];
  const pattern = new RegExp(`\\bimport\\s*{([^}]*)}\\s*from\\s*['"]${moduleName}['"]`, 'g');
  for (const match of source.matchAll(pattern)) {
    const clause = match[1];
    if (!clause) continue;
    for (const raw of clause.split(',')) {
      const entry = raw.trim();
      if (!entry || /^type\s+/.test(entry)) continue; // type-only imports are not value components
      const imported = entry.split(/\s+as\s+/)[0]?.trim();
      if (imported && /^[A-Za-z_$][\w$]*$/.test(imported)) names.push(imported);
    }
  }
  return names;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

export function scanConsumedAntd(srcRoot: string): ConsumedAntd {
  const components = new Set<string>();
  const icons = new Set<string>();
  const utilities = new Set<string>();
  for (const file of walk(srcRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const name of extractNamedImportsForTest(source, 'antd')) {
      (UTILITY_SET.has(name) ? utilities : components).add(name);
    }
    for (const name of extractNamedImportsForTest(source, '@ant-design/icons')) icons.add(name);
  }
  return {
    components: sortedUnique(components),
    icons: sortedUnique(icons),
    utilities: sortedUnique(utilities),
  };
}

/** Wrapper names come from actual `export const Name = wrapIcon(...)` declarations in ui/. */
export function scanWrappers(uiRoot: string): Set<string> {
  const wrapped = new Set<string>();
  for (const file of walk(uiRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/export\s+(?:const|function)\s+([A-Z][A-Za-z0-9_]*)/g)) {
      if (match[1]) wrapped.add(match[1]);
    }
  }
  return wrapped;
}

export function findMissingWrappers(consumed: ConsumedAntd, wrapped: ReadonlySet<string>): string[] {
  return sortedUnique(
    [...consumed.components, ...consumed.icons].filter((name) => !wrapped.has(name)),
  );
}

/**
 * T-49-09: a bare re-export is a pass-through. A wrapper must visibly reference
 * the shared policy contract (or apply a real policy helper) to pass.
 */
export function isPassThroughWrapper(fileContents: string): boolean {
  if (/\bexport\s+\*\s+from\s+['"]antd['"]/.test(fileContents)) return true;
  const bareReexport = /\bexport\s*\{([^}]*)\}\s*from\s*['"]antd['"]/g;
  let hasReexport = false;
  for (const match of fileContents.matchAll(bareReexport)) {
    hasReexport = true;
    const names = match[1]?.split(',').map((part) => part.trim().split(/\s+as\s+/)[0]) ?? [];
    if (names.some((name) => name && name !== 'default')) return true;
  }
  if (!hasReexport) return false;
  return !/getSharedControlTokens|getStatusTokens|tokens\.contract/.test(fileContents);
}
