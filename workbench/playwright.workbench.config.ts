import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import baseConfig from '../playwright.config';

/**
 * Isolated workbench Playwright config. Reuses the app's real Vite command and
 * Chrome channel from playwright.config.ts (read-only), but anchors cwd/testDir
 * to this worktree via import.meta.url and refuses to reuse a foreign Vite server.
 */
const workbenchRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(workbenchRoot, '..');

export default defineConfig({
  ...baseConfig,
  testDir: repoRoot,
  testMatch: ['workbench/e2e/**/*.e2e.ts'],
  outputDir: resolve(workbenchRoot, 'evidence/test-results'),
  reporter: 'list',
  webServer: {
    ...baseConfig.webServer,
    command: 'npm run dev -- --host 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174/task-management/',
    cwd: repoRoot,
    reuseExistingServer: false,
  },
  use: {
    ...baseConfig.use,
    baseURL: 'http://127.0.0.1:5174/task-management/',
    trace: 'retain-on-failure',
  },
  projects: baseConfig.projects,
});
