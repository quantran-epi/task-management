import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { isTauriApp } from '../utils/timerPopout';
import {
  KEYRING_KEYS,
  getKeyringCredential,
  storeKeyringCredential,
  deleteKeyringCredential,
} from '../services/keyringService';

export interface GitHubAuthContextType {
  token: string | null;
  passphrase: string | null;
  setCredentials: (token: string, passphrase?: string) => void;
  setPassphrase: (passphrase: string) => void;
  clearSession: () => void;
  forgetCredentials: () => Promise<void>;
  hasToken: boolean;
  hasPassphrase: boolean;
  isDesktopStored: boolean;
}

const GitHubAuthContext = createContext<GitHubAuthContextType | undefined>(undefined);

export interface GitHubAuthProviderProps {
  children: React.ReactNode;
}

export const GitHubAuthProvider: React.FC<GitHubAuthProviderProps> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [isDesktopStored, setIsDesktopStored] = useState<boolean>(false);

  // On desktop boot, automatically load PAT and Passphrase from OS Keychain
  useEffect(() => {
    if (!isTauriApp()) return;

    let isMounted = true;
    (async () => {
      try {
        const [savedPat, savedPassphrase] = await Promise.all([
          getKeyringCredential(KEYRING_KEYS.GITHUB_PAT),
          getKeyringCredential(KEYRING_KEYS.BACKUP_PASSPHRASE),
        ]);

        if (isMounted) {
          if (savedPat) {
            setToken(savedPat);
            setIsDesktopStored(true);
          }
          if (savedPassphrase) {
            setPassphrase(savedPassphrase);
          }
        }
      } catch (err) {
        console.warn('Failed to load GitHub credentials from OS Keychain on boot:', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setPassphrase(null);
  }, []);

  const forgetCredentials = useCallback(async () => {
    setToken(null);
    setPassphrase(null);
    setIsDesktopStored(false);
    if (isTauriApp()) {
      await Promise.all([
        deleteKeyringCredential(KEYRING_KEYS.GITHUB_PAT),
        deleteKeyringCredential(KEYRING_KEYS.BACKUP_PASSPHRASE),
      ]);
    }
  }, []);

  const setCredentials = useCallback((t: string, p?: string) => {
    const trimmed = t.trim();
    setToken(trimmed);
    if (p !== undefined) {
      setPassphrase(p);
    }
    if (isTauriApp()) {
      setIsDesktopStored(true);
      void storeKeyringCredential(KEYRING_KEYS.GITHUB_PAT, trimmed).catch((err) => {
        console.warn('Failed to persist GitHub PAT to Keychain:', err);
      });
      if (p !== undefined) {
        void storeKeyringCredential(KEYRING_KEYS.BACKUP_PASSPHRASE, p).catch((err) => {
          console.warn('Failed to persist backup passphrase to Keychain:', err);
        });
      }
    }
  }, []);

  const handleSetPassphrase = useCallback((p: string) => {
    setPassphrase(p);
    if (isTauriApp()) {
      void storeKeyringCredential(KEYRING_KEYS.BACKUP_PASSPHRASE, p).catch((err) => {
        console.warn('Failed to persist backup passphrase to Keychain:', err);
      });
    }
  }, []);

  const value = useMemo<GitHubAuthContextType>(
    () => ({
      token,
      passphrase,
      setCredentials,
      setPassphrase: handleSetPassphrase,
      clearSession,
      forgetCredentials,
      hasToken: Boolean(token),
      hasPassphrase: Boolean(passphrase),
      isDesktopStored,
    }),
    [token, passphrase, setCredentials, handleSetPassphrase, clearSession, forgetCredentials, isDesktopStored]
  );

  return <GitHubAuthContext.Provider value={value}>{children}</GitHubAuthContext.Provider>;
};

export function useGitHubAuth(): GitHubAuthContextType {
  const context = useContext(GitHubAuthContext);
  if (!context) {
    return {
      token: null,
      passphrase: null,
      setCredentials: () => {},
      setPassphrase: () => {},
      clearSession: () => {},
      forgetCredentials: async () => {},
      hasToken: false,
      hasPassphrase: false,
      isDesktopStored: false,
    };
  }
  return context;
}
