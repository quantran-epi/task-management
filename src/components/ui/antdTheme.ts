// Internal bridge: the only place outside AntD itself that may import the
// runtime `theme` object. Keeps src/styles/tokens.ts (outside ui/) free of
// runtime AntD imports so GUARD-01 stays green (D-01/D-03/D-17/D-19).
export { theme } from 'antd';
export type { ThemeConfig } from 'antd';
