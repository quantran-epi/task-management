import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const workbenchRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(workbenchRoot, '..');
const manifestPath = join(workbenchRoot, 'gate-map.json');

/** Convert a glob (with ** / *) into an anchored RegExp. */
export function globToRegExp(pattern) {
  let out = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        i += 1;
        if (pattern[i + 1] === '/') {
          i += 1;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if ('.+?^${}()|[]\\'.includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  return new RegExp(`${out}$`);
}

export function matchesPath(changedPath, patterns) {
  const normalized = changedPath.replace(/^\.\//, '');
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

/** Pure resolver: given changed paths + manifest, return {scope, changed, unit, e2e, rules}. */
export function resolveScope(changed, manifest) {
  const paths = [...new Set(changed.map((p) => p.replace(/^\.\//, '')))].sort();
  const matched = manifest.rules.filter((rule) =>
    paths.some((path) => matchesPath(path, rule.match))
  );
  const chosen = matched.length > 0 ? matched : [manifest.fallback];
  const scope = matched.length > 0 ? 'changed' : 'fallback';
  const unit = [...new Set(chosen.flatMap((rule) => rule.unit))].sort();
  const e2e = [...new Set(chosen.flatMap((rule) => rule.e2e))].sort();
  return {
    scope,
    changed: paths,
    rules: chosen.map((rule) => rule.id ?? 'fallback'),
    unit,
    e2e,
  };
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/** Resolve baseline: merge-base only when branch is within maxDivergence of master. */
export function resolveBaseline(manifest, runGit = git) {
  const mergeBase = runGit(['merge-base', 'HEAD', 'master']);
  const fallback = 'HEAD~1';
  if (!mergeBase) return fallback;
  const ahead = Number(runGit(['rev-list', '--count', 'HEAD', `^${mergeBase}`]) || 0);
  const behind = Number(runGit(['rev-list', '--count', 'master', `^${mergeBase}`]) || 0);
  const maxDivergence = manifest?.baseline?.maxDivergence ?? 50;
  return ahead <= maxDivergence && behind <= maxDivergence ? mergeBase : fallback;
}

export function collectChangedPaths(manifest, runGit = git) {
  const baseline = resolveBaseline(manifest, runGit);
  const groups = [
    runGit(['diff', '--name-only', baseline]),
    runGit(['diff', '--name-only']),
    runGit(['diff', '--name-only', '--cached']),
    runGit(['ls-files', '--others', '--exclude-standard']),
  ];
  return [
    ...new Set(
      groups.flatMap((group) =>
        group
          .split('\n')
          .map((p) => p.trim())
          .filter(Boolean)
          .filter((p) => !p.includes('/.gates.') && !p.includes('/.scope.') && !p.startsWith('.planning/'))
      )
    ),
  ];
}

/** Expand a unit path (file or directory) into concrete test files for Vitest. */
export function expandUnitPaths(paths, exists, readdir, suffixes) {
  const result = [];
  for (const path of paths) {
    const absolute = resolve(repoRoot, path);
    if (!exists(absolute)) continue;
    if (exists(join(absolute, 'package.json'))) {
      result.push(path);
      continue;
    }
    const walk = (dir) => {
      for (const entry of readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(full);
        } else if (suffixes.some((suffix) => entry.name.endsWith(suffix))) {
          result.push(full.slice(repoRoot.length + 1));
        }
      }
    };
    walk(absolute);
  }
  return [...new Set(result)].sort();
}

/** CLI entry: print JSON scope. `--scope <path>` forces fallback-free explicit resolution. */
export function main(argv = process.argv.slice(2)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let changed = collectChangedPaths(manifest);
  let scopeOverride = null;
  const idx = argv.indexOf('--scope');
  if (idx >= 0) {
    const explicit = argv[idx + 1];
    if (!explicit) {
      process.stderr.write('--scope requires a path\n');
      return 2;
    }
    scopeOverride = explicit.replace(/^\.\//, '');
    changed = [...new Set([scopeOverride, ...changed])];
  }
  let resolved = resolveScope(changed, manifest);
  if (scopeOverride) {
    resolved = { ...resolved, scope: 'explicit', explicitPath: scopeOverride };
  }
  process.stdout.write(`${JSON.stringify({ ...resolved, manifest: 'workbench/gate-map.json' }, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}

export const paths = { workbenchRoot, repoRoot, manifestPath };
export const pathSep = sep;
