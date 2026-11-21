import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.TAURI_PLATFORM);

// https://vite.dev/config/
export default defineConfig({
  base: isTauri ? '/' : '/task-management/',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || false,
  },
  plugins: [react()],
  test: {
    alias: {
      'aria-query': fileURLToPath(
        new URL('./node_modules/aria-query', import.meta.url)
      ),
    },
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    fileParallelism: false,
    testTimeout: 15000,
    exclude: [...configDefaults.exclude, 'e2e/**', 'proxy/**', '.claude/**', 'knowledge-server/**'],
  },
});
