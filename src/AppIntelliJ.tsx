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

export const AppIntelliJ: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    initializeDatabaseDefaults().catch((err) => {
      console.error('Failed to initialize database defaults:', err);
    });
    checkAndRequestStoragePersistence().catch((err) => {
      console.warn('Storage persistence auto-request failed on boot:', err);
    });
  }, []);

  return (
    <AntdThemeAdapter>
      {showSplash && <AppSplashScreen onReady={() => setShowSplash(false)} minDuration={900} />}
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
