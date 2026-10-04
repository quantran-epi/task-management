import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-512x512-maskable.png',
      ],
      manifest: {
        name: 'PlannerMate',
        short_name: 'PlannerMate',
        description: 'PlannerMate - Private offline-first personal task and workload planner',
        theme_color: '#1677ff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/task-management/',
        scope: '/task-management/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/task-management/index.html',
        navigateFallbackAllowlist: [/^\/task-management\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: {
    alias: {
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./tests/mocks/pwaRegister.ts', import.meta.url)
      ),
    },
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    fileParallelism: false,
    testTimeout: 15000,
    exclude: [...configDefaults.exclude, 'proxy/**', '.claude/**'],
  },
});
