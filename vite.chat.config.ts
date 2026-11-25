import { defineConfig, mergeConfig } from 'vite';
import baseConfig from './vite.config';

// Chat-only bundle: same dist shape as TaskMate, only the committed marker differs (D-02/D-04/D-15).
export default mergeConfig(
  baseConfig,
  defineConfig({
    define: {
      'import.meta.env.VITE_CHAT_STANDALONE': '"1"',
    },
  })
);
