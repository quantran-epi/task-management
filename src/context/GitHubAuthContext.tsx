import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface GitHubAuthContextType {
  token: string | null;
  passphrase: string | null;
  setCredentials: (token: string, passphrase?: string) => void;
  setPassphrase: (passphrase: string) => void;
  clearSession: () => void;
  hasToken: boolean;
  hasPassphrase: boolean;
}

const GitHubAuthContext = createContext<GitHubAuthContextType | undefined>(undefined);

export interface GitHubAuthProviderProps {
  children: React.ReactNode;
}

export const GitHubAuthProvider: React.FC<GitHubAuthProviderProps> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    setToken(null);
    setPassphrase(null);
  }, []);

  const setCredentials = useCallback((t: string, p?: string) => {
    setToken(t.trim());
    if (p !== undefined) {
      setPassphrase(p);
    }
  }, []);

  const handleSetPassphrase = useCallback((p: string) => {
    setPassphrase(p);
  }, []);

  const value = useMemo<GitHubAuthContextType>(
    () => ({
      token,
      passphrase,
      setCredentials,
      setPassphrase: handleSetPassphrase,
      clearSession,
      hasToken: Boolean(token),
      hasPassphrase: Boolean(passphrase),
    }),
    [token, passphrase, setCredentials, handleSetPassphrase, clearSession]
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
      hasToken: false,
      hasPassphrase: false,
    };
  }
  return context;
}
