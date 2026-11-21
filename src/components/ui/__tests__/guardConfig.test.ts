import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const eslintConfig = readFileSync('eslint.config.mjs', 'utf8');

describe('GUARD-01/02 local-only guard configuration', () => {
  it('defines the three local npm scripts and keeps build unchanged', () => {
    expect(packageJson.scripts.lint).toBe('eslint src');
    expect(packageJson.scripts['lint:adoption']).toBeUndefined();
    expect(packageJson.scripts['test:foundation']).toBeDefined();
    expect(packageJson.scripts.build).toBe('tsc && vite build');
  });

  it('has no remote CI invocation in scripts and no new lint/test/guard workflow', () => {
    const allScripts = Object.values(packageJson.scripts).join('\n').toLowerCase();
    expect(allScripts).not.toContain('github');
    expect(allScripts).not.toContain('gh-action');
    expect(allScripts).not.toContain('workflow_dispatch');
    const workflows = readdirSync('.github/workflows');
    expect(workflows.filter((name) => /lint|test|design|guard/i.test(name))).toEqual([]);
    expect(workflows).toContain('desktop-build.yml');
    expect(workflows).toContain('knowledge-server-docker.yml');
  });

  it('configures Babel parser, scoped ban, type-import exception, and ui/ override', () => {
    expect(eslintConfig).toContain('no-restricted-imports');
    expect(eslintConfig).toContain('allowTypeImports: true');
    expect(eslintConfig).toContain('antd');
    expect(eslintConfig).toContain('@ant-design/icons');
    expect(eslintConfig).toContain('src/components/ui/**/*.{ts,tsx}');
    expect(eslintConfig).toContain('@babel/eslint-parser');
    expect(eslintConfig).not.toContain('typescript-eslint');
    expect(eslintConfig.match(/'no-restricted-imports': 'off'/g)).toHaveLength(1);
  });

  it('rejects the negative fixture for the restriction reason, not a parse error', () => {
    let output = '';
    let exitCode = 0;
    try {
      execFileSync('npx', ['eslint', 'tests/fixtures/guard/bad-import.tsx'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });
    } catch (error) {
      const failure = error as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
      exitCode = failure.status ?? -1;
      output = `${String(failure.stdout ?? '')}\n${String(failure.stderr ?? '')}`;
    }
    expect(exitCode).not.toBe(0);
    expect(output).not.toContain('Parsing error');
    expect(output).toContain('Import from src/components/ui instead');
    expect(output).toContain('Import from src/components/ui/icon instead');
  }, 90_000);
});
