#!/usr/bin/env node
// Phase 50 adoption codemod. Rewrites imports ONLY: antd/icons -> ui barrel,
// theme.useToken() -> useAntdToken(), theme.darkAlgorithm -> darkAlgorithm.
// It never touches static message.*/Modal.confirm calls or any behavior;
// every rewritten file must be reviewed and gated separately by the executor.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

// Static imperative APIs stay on their original import and print a warning;
// the executor must convert them to hooks by hand before gating the file.
const STATIC_APIS = new Set(['message', 'notification']);

const HELP = `Usage: node scripts/adoption-codemod.mjs [options] <file...>

Rewrites value imports of 'antd' and '@ant-design/icons' to the TaskMate UI
barrel for the given source files. Type-only imports stay on their original
module. A 'theme' value import is converted to useAntdToken/darkAlgorithm and
its two supported usages are rewritten. Static APIs are NOT rewritten.

Options:
  --root <dir>       Project root (default: cwd)
  --manifest <file>  Read one relative path per line (wave-*.txt)
  --dry-run          Print changed files without writing
  -h, --help         Show this help
`;

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return null;
  }
  let root = process.cwd();
  let manifest;
  let dryRun = false;
  const files = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') root = resolve(argv[++i]);
    else if (arg === '--manifest') manifest = argv[++i];
    else if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else files.push(arg);
  }
  if (manifest) {
    const lines = readFileSync(manifest, 'utf8').split('\n').map((line) => line.trim());
    files.push(...lines.filter((line) => line && !line.startsWith('#')));
  }
  if (files.length === 0) {
    process.stdout.write(HELP);
    return null;
  }
  return { root, files: [...new Set(files)], dryRun };
}

function barrelPath(root, file, target) {
  const from = dirname(resolve(root, file));
  const rel = relative(from, resolve(root, target)).split(sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

const IMPORT_RE = /\bimport\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+(['"])([^'"]+)\3\s*;?/g;
const SOURCES = new Set(['antd', '@ant-design/icons']);

function rewrite(source, root, file) {
  const ui = barrelPath(root, file, 'src/components/ui');
  const uiIcon = `${ui}/icon`;
  const usesTokenHook = /\btheme\s*\.\s*useToken\s*\(/.test(source);
  const usesDarkAlgorithm = /\btheme\s*\.\s*darkAlgorithm\b/.test(source);
  let changed = false;
  let sawTheme = false;

  const next = source.replace(IMPORT_RE, (whole, typeKeyword, clause, _quote, moduleName) => {
    if (typeKeyword || !SOURCES.has(moduleName)) return whole;
    const values = [];
    const types = [];
    let importedTheme = false;
    for (const raw of String(clause).split(',')) {
      const spec = raw.trim();
      if (!spec) continue;
      const isType = /^type\s+/.test(spec);
      const bare = isType ? spec.replace(/^type\s+/, '') : spec;
      const imported = bare.split(/\s+as\s+/)[0]?.trim();
      if (moduleName === 'antd' && !isType && imported === 'theme') {
        importedTheme = true;
        continue;
      }
      if (isType) types.push(bare);
      else values.push(bare);
    }
    if (!importedTheme && values.length === 0 && types.length === 0) return whole;
    const staticValues = values.filter((spec) => STATIC_APIS.has(spec.split(/\s+as\s+/)[0]?.trim()));
    const barrelValues = values.filter((spec) => !staticValues.includes(spec));
    if (importedTheme) {
      sawTheme = true;
      if (usesTokenHook) barrelValues.push('useAntdToken');
      if (usesDarkAlgorithm) barrelValues.push('darkAlgorithm');
    }
    if (staticValues.length) {
      process.stderr.write(
        `warning: ${file}: static API ${staticValues.join(', ')} needs manual hook conversion\n`,
      );
    }
    const statements = [];
    const target = moduleName === 'antd' ? ui : uiIcon;
    if (barrelValues.length) statements.push(`import { ${[...new Set(barrelValues)].join(', ')} } from '${target}';`);
    if (staticValues.length) statements.push(`import { ${[...new Set(staticValues)].join(', ')} } from '${moduleName}';`);
    if (types.length) statements.push(`import type { ${[...new Set(types)].join(', ')} } from '${moduleName}';`);
    const result = statements.join('\n');
    if (result !== whole) changed = true;
    return result;
  });

  let output = next;
  if (sawTheme) {
    output = output.replace(/\btheme\s*\.\s*useToken\s*\(\s*\)/g, 'useAntdToken()');
    output = output.replace(/\btheme\s*\.\s*darkAlgorithm\b/g, 'darkAlgorithm');
  }
  return { output, changed: changed || output !== source };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) return;
  let edited = 0;
  for (const file of args.files) {
    const path = resolve(args.root, file);
    if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Missing source file: ${file}`);
    const before = readFileSync(path, 'utf8');
    const { output, changed } = rewrite(before, args.root, file);
    if (!changed) continue;
    process.stdout.write(`${args.dryRun ? 'would rewrite' : 'rewrote'} ${file}\n`);
    if (!args.dryRun) writeFileSync(path, output);
    edited += 1;
  }
  process.stdout.write(`${edited} file(s) ${args.dryRun ? 'would change' : 'changed'}.\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
