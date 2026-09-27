import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { announceToScreenReader } from '../components/common/AriaLiveRegion';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface UsePWAInstallReturn {
  installPrompt: BeforeInstallPromptEvent | null;
  isInstallable: boolean;
  isStandalone: boolean;
  isIos: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | null>;
}

export function usePWAInstall(): UsePWAInstallReturn {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  const checkStandalone = (): boolean => {
    if (typeof window === 'undefined') return false;
    const isMatchMedia = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
    const isNavStandalone = (window.navigator as unknown as { standalone?: boolean })?.standalone === true;
    return isMatchMedia || isNavStandalone;
  };

  const [isStandalone, setIsStandalone] = useState<boolean>(checkStandalone);

  const checkIos = (): boolean => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isIosDevice = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isIosDevice;
  };

  const isIos = checkIos();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check standalone initial and listen for media query change
    if (window.matchMedia) {
      const mql = window.matchMedia('(display-mode: standalone)');
      const handleModeChange = (e: MediaQueryListEvent) => {
        if (e.matches) {
          setIsStandalone(true);
          setIsInstalled(true);
        }
      };
      if (mql.addEventListener) {
        mql.addEventListener('change', handleModeChange);
      } else if (mql.addListener) {
        // Fallback for older browsers
        mql.addListener(handleModeChange);
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      message.success('Ứng dụng đã được cài đặt thành công!');
      announceToScreenReader('Ứng dụng đã được cài đặt thành công vào thiết bị!');
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | null> => {
    if (!installPrompt) return null;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
      setInstallPrompt(null);
    }
    return choice.outcome;
  }, [installPrompt]);

  const isInstallable = !isStandalone && !isInstalled && (installPrompt !== null || isIos);

  return {
    installPrompt,
    isInstallable,
    isStandalone,
    isIos,
    isInstalled,
    promptInstall,
  };
}
