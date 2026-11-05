import React, { useState, useEffect } from 'react';
import './utils/date';
import { initializeDatabaseDefaults } from './db/seeds';
import { checkAndRequestStoragePersistence } from './services/storage/storagePersistence';
import { AntdThemeAdapter } from './workbench/AntdThemeAdapter';
import { WorkbenchLayout } from './workbench/WorkbenchLayout';
import { TimerProvider } from './context/TimerContext';
import { KnowledgeConfigProvider } from './services/knowledge/knowledgeConfig';
import { AIChatProvider } from './context/AIChatContext';
import { FormGuardProvider } from './context/FormGuardContext';
import { GitHubAuthProvider } from './context/GitHubAuthContext';
import { ServiceWorkerProvider } from './context/ServiceWorkerContext';
import { AppSplashScreen } from './components/AppSplashScreen';
import { useHashRoute } from './hooks/useHashRoute';
import { TimerPopoutView } from './views/TimerPopoutView';
import { NotesPopoutView } from './views/NotesPopoutView';
import { AIPopoutView } from './views/AIPopoutView';

export const AppIntelliJ: React.FC = () => {
  const { route } = useHashRoute();
  const isPopout = route === 'timer-popout' || route === 'notes-popout' || route === 'ai-popout';
  const [showSplash, setShowSplash] = useState(!isPopout);

  useEffect(() => {
    initializeDatabaseDefaults().catch((err) => {
      console.error('Failed to initialize database defaults:', err);
    });
    checkAndRequestStoragePersistence().catch((err) => {
      console.warn('Storage persistence auto-request failed on boot:', err);
    });
  }, []);

  if (route === 'timer-popout') {
    return (
      <AntdThemeAdapter>
        <TimerProvider>
          <TimerPopoutView />
        </TimerProvider>
      </AntdThemeAdapter>
    );
  }

  if (route === 'notes-popout') {
    return (
      <AntdThemeAdapter>
        <NotesPopoutView />
      </AntdThemeAdapter>
    );
  }

  if (route === 'ai-popout') {
    return (
      <AntdThemeAdapter>
        <AIChatProvider>
          <AIPopoutView />
        </AIChatProvider>
      </AntdThemeAdapter>
    );
  }

  return (
    <AntdThemeAdapter>
      {showSplash && <AppSplashScreen onReady={() => setShowSplash(false)} minDuration={1900} />}
      <KnowledgeConfigProvider>
        <ServiceWorkerProvider>
          <FormGuardProvider>
            <GitHubAuthProvider>
              <TimerProvider>
                <AIChatProvider>
                  <WorkbenchLayout />
                </AIChatProvider>
              </TimerProvider>
            </GitHubAuthProvider>
          </FormGuardProvider>
        </ServiceWorkerProvider>
      </KnowledgeConfigProvider>
    </AntdThemeAdapter>
  );
};

export default AppIntelliJ;
