import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import baseConfig from '../playwright.config';

/**
 * Isolated workbench Playwright config. Reuses the app's real Vite webServer and
 * Chrome channel from playwright.config.ts (read-only); only test discovery,
 * outputDir and webServer cwd are overridden. Specs use *.e2e.ts so root Vitest
 * never picks them up; paths stay repo-relative so CLI filters work.
 */
export default defineConfig({
  ...baseConfig,
  testDir: './',
  testMatch: ['workbench/e2e/**/*.e2e.ts'],
  outputDir: resolve(process.cwd(), 'workbench/evidence/test-results'),
  reporter: 'list',
  webServer: {
    ...baseConfig.webServer,
    cwd: process.cwd(),
    reuseExistingServer: true,
  },
  use: {
    ...baseConfig.use,
    baseURL: 'http://127.0.0.1:5173/task-management/',
    trace: 'retain-on-failure',
  },
  projects: baseConfig.projects,
});
