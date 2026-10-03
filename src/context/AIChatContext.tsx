import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import type { ChatScopeType } from '../types/models';

export interface ActiveScope {
  type: ChatScopeType;
  id?: string;
  title?: string;
}

export interface AIChatContextValue {
  isOpen: boolean;
  openChat: (scope?: ActiveScope) => void;
  closeChat: () => void;
  toggleChat: () => void;
  activeScope: ActiveScope;
  setCustomScope: (scope: ActiveScope) => void;
  registerActiveItem: (scope: ActiveScope | null) => () => void;
}

const AIChatContext = createContext<AIChatContextValue | null>(null);

export const AI_CHAT_OPEN_KEY = 'planner:ai_chat_open';

export interface AIChatProviderProps {
  children: ReactNode;
}

export const AIChatProvider: React.FC<AIChatProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(AI_CHAT_OPEN_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Stack of registered items from open drawers / modals (most recently opened on top)
  const registeredItemsRef = useRef<ActiveScope[]>([]);
  const [, setRegistrationTick] = useState(0);

  // User manually selected scope (overrides registered items if set)
  const [customScope, setCustomScopeState] = useState<ActiveScope | null>(null);

  const saveOpenState = (open: boolean) => {
    setIsOpen(open);
    try {
      localStorage.setItem(AI_CHAT_OPEN_KEY, String(open));
    } catch {}
  };

  const openChat = useCallback((scope?: ActiveScope) => {
    if (scope) {
      setCustomScopeState(scope);
    }
    saveOpenState(true);
  }, []);

  const closeChat = useCallback(() => {
    saveOpenState(false);
  }, []);

  const toggleChat = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AI_CHAT_OPEN_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  const setCustomScope = useCallback((scope: ActiveScope) => {
    setCustomScopeState(scope);
  }, []);

  const registerActiveItem = useCallback((scope: ActiveScope | null) => {
    if (!scope) {
      return () => {};
    }

    registeredItemsRef.current.push(scope);
    setRegistrationTick((t) => t + 1);

    return () => {
      registeredItemsRef.current = registeredItemsRef.current.filter((item) => item !== scope);
      setRegistrationTick((t) => t + 1);
    };
  }, []);

  // Compute activeScope:
  // If customScope exists, use it.
  // Else if registered items exist, use the most recent registered item.
  // Else fallback to global.
  const registeredTop = registeredItemsRef.current[registeredItemsRef.current.length - 1];
  const activeScope: ActiveScope = customScope ?? (registeredTop ? { ...registeredTop } : { type: 'global' });

  const value: AIChatContextValue = {
    isOpen,
    openChat,
    closeChat,
    toggleChat,
    activeScope,
    setCustomScope,
    registerActiveItem,
  };

  return <AIChatContext.Provider value={value}>{children}</AIChatContext.Provider>;
};

export const useAIChat = (): AIChatContextValue => {
  const context = useContext(AIChatContext);
  if (!context) {
    throw new Error('useAIChat must be used within an AIChatProvider');
  }
  return context;
};
