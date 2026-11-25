import React, { useState, useEffect } from 'react';
import './utils/date';
import { initializeDatabaseDefaults } from './db/seeds';
import { checkAndRequestStoragePersistence } from './services/storage/storagePersistence';
import { ThemeAppHolder } from './components/ui';
import { AntdThemeAdapter } from './workbench/AntdThemeAdapter';
import { WorkbenchLayout } from './workbench/WorkbenchLayout';
import { TimerProvider } from './context/TimerContext';
import { KnowledgeConfigProvider } from './services/knowledge/knowledgeConfig';
import { AIChatProvider } from './context/AIChatContext';
import { FormGuardProvider } from './context/FormGuardContext';
import { GitHubAuthProvider } from './context/GitHubAuthContext';
import { AppSplashScreen } from './components/AppSplashScreen';
import { useHashRoute } from './hooks/useHashRoute';
import { useGhostDevSessions } from './hooks/useGhostDevSessions';
import { useGhostDevNotifications } from './hooks/useGhostDevNotifications';
import { useDesktopNotification } from './hooks/useDesktopNotification';
import { useTimerAlertMonitor } from './hooks/useTimerAlertMonitor';
import { useLocalSqlitePersistence } from './hooks/useLocalSqlitePersistence';
import { useTeamRunTeardown } from './hooks/useTeamRunTeardown';
import { useGitHubAutoSync } from './hooks/useGitHubAutoSync';
import { useTelegramHeadlessWorker } from './services/telegram/telegramHeadlessWorker';
import { useNotifications } from './hooks/useNotifications';
import { TimerPopoutView } from './views/TimerPopoutView';
import { NotesPopoutView } from './views/NotesPopoutView';
import { AIPopoutView } from './views/AIPopoutView';
import { CodingZonePopoutView } from './views/CodingZonePopoutView';
import { startNotificationDeepLinkListener } from './utils/notificationDeepLink';
import { attachGlobalToolTaskListener } from './components/ai/runtime/toolTaskStore';
import { isTauriApp } from './utils/timerPopout';

const STANDALONE_CHAT = import.meta.env.VITE_CHAT_STANDALONE === '1';

export interface AppIntelliJProps {
  standaloneChat?: boolean | undefined;
}

export const AppIntelliJ: React.FC<AppIntelliJProps> = ({ standaloneChat = STANDALONE_CHAT }) => {
  const { route } = useHashRoute();
  const isPopout =
    route === 'timer-popout' ||
    route === 'notes-popout' ||
    route === 'ai-popout' ||
    route === 'coding-zone-popout';
  const [showSplash, setShowSplash] = useState(!isPopout);

  // Ghost-dev sessions outlive the retired agents page. Mount their OS notifications at the
  // app root so the IntelliJ/Tauri workbench receives them.
  const { sessions: ghostDevSessions } = useGhostDevSessions();
  useGhostDevNotifications(ghostDevSessions);

  // Runtime hooks previously owned by the deleted AntD shell. They must survive at the
  // single workbench root: OS notifications, SQLite mirror, run teardown, backup sync, worker.
  const notifications = useNotifications();
  useDesktopNotification({ notifications });
  useTimerAlertMonitor();
  useLocalSqlitePersistence();
  useTeamRunTeardown();
  useGitHubAutoSync();
  useTelegramHeadlessWorker();

  useEffect(() => {
    initializeDatabaseDefaults().catch((err) => {
      console.error('Failed to initialize database defaults:', err);
    });
    checkAndRequestStoragePersistence().catch((err) => {
      console.warn('Storage persistence auto-request failed on boot:', err);
    });
    // Clicking an OS notification focuses the window and navigates to its target page.
    const stopDeepLinks = startNotificationDeepLinkListener();

    // ONE global tool-task listener for the whole app lifetime — it must not live in a
    // chat tab, otherwise closing the tab would stop observing still-running tasks.
    let stopToolTasks: (() => void) | undefined;
    let cancelled = false;
    if (isTauriApp()) {
      void import('@tauri-apps/api/event').then(async ({ listen }) => {
        if (cancelled) return;
        const detach = await attachGlobalToolTaskListener(listen);
        if (cancelled) detach();
        else stopToolTasks = detach;
      });
    }
    return () => {
      cancelled = true;
      stopDeepLinks();
      // Detach only on real app teardown; drawer/tab unmounts never reach the root cleanup.
      stopToolTasks?.();
    };
  }, []);

  if (route === 'timer-popout') {
    return (
      <AntdThemeAdapter>
        <ThemeAppHolder>
          <TimerProvider>
            <TimerPopoutView />
          </TimerProvider>
        </ThemeAppHolder>
      </AntdThemeAdapter>
    );
  }

  if (route === 'notes-popout') {
    return (
      <AntdThemeAdapter>
        <ThemeAppHolder>
          <NotesPopoutView />
        </ThemeAppHolder>
      </AntdThemeAdapter>
    );
  }

  if (route === 'ai-popout') {
    return (
      <AntdThemeAdapter>
        <ThemeAppHolder>
          <KnowledgeConfigProvider>
            <AIChatProvider>
              <AIPopoutView standaloneChat={standaloneChat} />
            </AIChatProvider>
          </KnowledgeConfigProvider>
        </ThemeAppHolder>
      </AntdThemeAdapter>
    );
  }

  if (route === 'coding-zone-popout') {
    return (
      <AntdThemeAdapter>
        <ThemeAppHolder>
          <CodingZonePopoutView />
        </ThemeAppHolder>
      </AntdThemeAdapter>
    );
  }

  return (
    <AntdThemeAdapter>
      <ThemeAppHolder>
        {showSplash && <AppSplashScreen onReady={() => setShowSplash(false)} minDuration={1900} />}
        <KnowledgeConfigProvider>
          <FormGuardProvider>
            <GitHubAuthProvider>
              <TimerProvider>
                <AIChatProvider>
                  <WorkbenchLayout />
                </AIChatProvider>
              </TimerProvider>
            </GitHubAuthProvider>
          </FormGuardProvider>
        </KnowledgeConfigProvider>
      </ThemeAppHolder>
    </AntdThemeAdapter>
  );
};

export default AppIntelliJ;
