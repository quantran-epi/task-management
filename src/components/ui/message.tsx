import { App as AntApp } from 'antd';
import type { ReactNode } from 'react';
import { getSharedControlTokens } from './tokens.contract';

/** Message instance from the single holder below — never AntD's static `message.*`. */
export function useMessage() {
  return AntApp.useApp().message;
}

/**
 * Mount once at the shell root (Phase 50). This is the single context holder for
 * imperative message/notification/modal APIs so all of them inherit ConfigProvider
 * theme. Phase 50 swaps the 637 static call sites to useMessage/useNotification/
 * useTaskMateModal; do not call static methods inside ui/.
 */
export function ThemeAppHolder({ children }: { children: ReactNode }) {
  void getSharedControlTokens();
  return <AntApp>{children}</AntApp>;
}
