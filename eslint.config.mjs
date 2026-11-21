// Phase 49 (D-15/GUARD-01): local-only import guard. No GitHub Actions.
// The rule below has ZERO exceptions in config; it fires on every file in its
// `files` set, including tests/fixtures/guard/bad-import.tsx. The only allowed
// runtime AntD imports live in src/components/ui/** (D-01/D-03/D-18), disabled
// by the later override object.
//
// IN-01 (RESOLVED in Phase 50): `npm run lint` is now `eslint src` — app-wide
// guard coverage, not a scoped subset. Phase 50 migrated every view onto the
// ui/ barrel so runtime AntD imports outside ui/ are gone. `lint:adoption`
// was removed; this rule plus the static-API source guards are the single
// local-only gate. No GitHub Actions.
import babelParser from '@babel/eslint-parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'src-tauri/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/fixtures/guard/**/*.tsx'],
    languageOptions: {
      // TS7 (Go-native) has no compiler JS API -> the TS ESLint parser cannot run.
      // Babel strips TS/TSX syntax without type info (D-17, research Pitfall 1).
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          // Babel 8 preset-typescript removed isTSX/allExtensions; JSX is enabled
          // through the parser plugin instead (research example used Babel 7 options).
          presets: ['@babel/preset-typescript'],
          parserOpts: { plugins: ['jsx'] },
        },
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'antd',
              allowTypeImports: true,
              message: 'Import from src/components/ui instead.',
            },
            {
              name: '@ant-design/icons',
              allowTypeImports: true,
              message: 'Import from src/components/ui/icon instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // ONLY place runtime AntD imports are legal. Later object wins (flat config cascade).
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
